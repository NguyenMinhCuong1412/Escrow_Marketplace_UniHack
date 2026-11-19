'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const ReactDOMServer = require('react-dom/server');

process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || 'test-session-secret-phase3-t3-0123456789abcdef';

const FRONTEND_ROOT = path.resolve(__dirname, '..');

function registerTsxLoader() {
  const origResolve = Module._resolveFilename;
  if (!Module._resolveFilename.__p3t3Patched) {
    Module._resolveFilename = function patchedResolve(request, parent, isMain, options) {
      if (typeof request === 'string' && request.startsWith('@/')) {
        const base = path.join(FRONTEND_ROOT, request.slice(2));
        for (const ext of ['.ts', '.tsx', '.js', '']) {
          const candidate = base + ext;
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return origResolve.call(this, candidate, parent, isMain, options);
          }
        }
        const indexTs = path.join(base, 'index.ts');
        if (fs.existsSync(indexTs) && fs.statSync(indexTs).isFile()) {
          return origResolve.call(this, indexTs, parent, isMain, options);
        }
      }
      return origResolve.call(this, request, parent, isMain, options);
    };
    Module._resolveFilename.__p3t3Patched = true;
  }

  for (const ext of ['.ts', '.tsx']) {
    require.extensions[ext] = function compileTs(mod, filename) {
      const src = fs.readFileSync(filename, 'utf8');
      const out = ts.transpileModule(src, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.React,
          esModuleInterop: true,
          moduleResolution: ts.ModuleResolutionKind.Node10,
        },
        fileName: filename,
      });
      return mod._compile(out.outputText, filename);
    };
  }
}

registerTsxLoader();

const { SESSION_COOKIE_NAME, createSessionToken } = require('@/lib/auth-session');
const discovery = require('@/lib/trade-discovery');
const marketplace = require('@/lib/marketplace');
const tradeIndexRoute = require('@/app/api/trades/index/route');

const WALLET_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const WALLET_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const WALLET_C = '0xcccccccccccccccccccccccccccccccccccccccc';
const ESCROW_ADDR = '0x19d053c84941411888f5b9e40c854365fdd4eb00';
const ZERO_B32 = '0x' + '00'.repeat(32);

function makeTrade(id, seller, buyer, state = 4, flagged = false) {
  return {
    id: BigInt(id),
    seller,
    buyer,
    itemValue: 1000000000000000000n,
    depositRequired: 200000000000000000n,
    sellerDeposit: 200000000000000000n,
    buyerDeposit: 1200000000000000000n,
    nonce: ZERO_B32,
    sellerEvidenceHash: ZERO_B32,
    buyerEvidenceHash: ZERO_B32,
    reportHash: ZERO_B32,
    riskScore: flagged ? 85 : 5,
    flagged,
    createdAt: BigInt(1700000000 + id),
    evidenceDeadline: 1700003600n,
    disputeDeadline: 1700007200n,
    state,
  };
}

function createMockChainAndIndex({
  chainId = 43113,
  escrowAddress = ESCROW_ADDR,
  tradesMap,
  headBlock = 61000000,
  indexedThroughBlock = 61000000,
  indexedNextTradeId,
  indexOverrides = {},
  staleDbStateOverrides = new Map(),
  onGetTradeIds,
}) {
  let getTradeCalls = 0;
  let indexPagesFetched = 0;

  const sortedIds = Array.from(tradesMap.keys()).sort((a, b) => a - b);
  const nextTradeId = sortedIds.length > 0 ? sortedIds[sortedIds.length - 1] + 1 : 1;
  const effIndexedNext = indexedNextTradeId ?? nextTradeId;

  const adapter = {
    chainId,
    escrowAddress,
    readNextTradeId: async (signal) => {
      if (signal?.aborted) throw discovery.createAbortError();
      return nextTradeId;
    },
    readBlockNumber: async (signal) => {
      if (signal?.aborted) throw discovery.createAbortError();
      return headBlock;
    },
    readTradesBatch: async (ids, signal) => {
      if (signal?.aborted) throw discovery.createAbortError();
      getTradeCalls += ids.length;
      if (onGetTradeIds) onGetTradeIds(ids);
      const out = new Map();
      for (const id of ids) {
        const t = tradesMap.get(id);
        if (t) out.set(id, t);
      }
      return out;
    },
    fetchIndexPage: async ({ wallet, filter, offset, limit, signal }) => {
      if (signal?.aborted) throw discovery.createAbortError();
      indexPagesFetched += 1;
      if (indexOverrides.httpStatus && indexOverrides.httpStatus !== 200) {
        return { ok: false, status: indexOverrides.httpStatus };
      }
      if (indexOverrides.throwError) {
        throw indexOverrides.throwError;
      }

      const items = [];
      let disputedCount = 0;
      let flaggedCount = 0;
      let activeCount = 0;

      for (let tid = effIndexedNext - 1; tid >= 1; tid -= 1) {
        const real = tradesMap.get(tid);
        if (!real) continue;
        const dbOv = staleDbStateOverrides.get(tid);
        const st = dbOv?.state ?? real.state;
        const flg = dbOv?.flagged ?? real.flagged;
        const isTerm = dbOv?.isTerminal ?? (st === 4 || st === 5);

        if (st === 3) disputedCount += 1;
        if (flg && st !== 4 && st !== 5) flaggedCount += 1;
        if (st !== 4 && st !== 5) activeCount += 1;

        if (wallet) {
          const w = wallet.toLowerCase();
          if (real.seller.toLowerCase() !== w && real.buyer.toLowerCase() !== w) continue;
        }
        if (filter === 'disputed' && st !== 3) continue;
        if (filter === 'flagged' && !(flg && st !== 4 && st !== 5)) continue;
        if (filter === 'active' && (st === 4 || st === 5)) continue;

        items.push({
          tradeId: tid,
          seller: real.seller,
          buyer: real.buyer,
          lastKnownState: st,
          flagged: flg,
          isTerminal: isTerm,
        });
      }

      const slice = items.slice(offset, offset + limit);
      return {
        ok: true,
        status: 200,
        data: {
          chainId,
          contractAddress: escrowAddress,
          deployBlock: chainId === 43113 ? 60980241 : 0,
          indexedThroughBlock,
          indexedNextTradeId: effIndexedNext,
          headBlockAtSync: headBlock,
          lastSyncEpoch: Date.now() / 1000,
          ageSeconds: 1,
          blockLag: Math.max(0, headBlock - indexedThroughBlock),
          missingGapCount: 0,
          isStale: false,
          isComplete: true,
          ...indexOverrides,
          totalMatching: items.length,
          summary: { disputedCount, flaggedCount, activeCount },
          items: slice,
        },
      };
    },
  };

  return {
    adapter,
    getStats: () => ({ getTradeCalls, indexPagesFetched }),
    resetStats: () => {
      getTradeCalls = 0;
      indexPagesFetched = 0;
    },
  };
}

test('TC-T3-01: Completeness preserves bound, direct P2P /trade/new, unbound and tail trades', async () => {
  discovery.clearTradeDiscoveryCache();
  const tradesMap = new Map([
    [1, makeTrade(1, WALLET_A, WALLET_B, 4)], // bound listing trade indexed
    [2, makeTrade(2, WALLET_B, WALLET_C, 4)], // other wallet
    [3, makeTrade(3, WALLET_A, WALLET_C, 1)], // direct P2P /trade/new (indexed via TradeCreated)
    [4, makeTrade(4, WALLET_B, WALLET_A, 0)], // newly mined unbound tail trade (not in index yet!)
    [5, makeTrade(5, WALLET_A, WALLET_C, 1)], // newly mined P2P tail trade (not in index yet!)
  ]);

  // Index only knows trades 1..3 (indexedNextTradeId = 4), while chain has nextTradeId = 6 (#4 and #5 in tail)
  const mock = createMockChainAndIndex({
    tradesMap,
    indexedNextTradeId: 4,
  });

  const res = await discovery.discoverWalletTrades(mock.adapter, {
    filterAddress: WALLET_A,
    isAuthenticated: true,
  });

  assert.equal(res.totalCreated, 5);
  assert.deepEqual(
    res.trades.map((t) => Number(t.id)),
    [5, 4, 3, 1],
    'Must preserve direct P2P, bound, and unindexed tail trades without losing any'
  );
  assert.equal(res.metrics.usedBackendIndex, true);
  assert.equal(res.metrics.tailIdsScanned, 2);
});

test('TC-T3-02: Quantitative RPC reduction on N=150 trades (cold-load AND steady-state)', async () => {
  discovery.clearTradeDiscoveryCache();
  const tradesMap = new Map();

  // 150 total trades: Wallet A participates in 8 trades (6 terminal, 2 active),
  // Global active trades across contract = 5 (including 2 disputed, 1 flagged non-disputed, 2 in-progress).
  for (let id = 1; id <= 150; id += 1) {
    let seller = WALLET_B;
    let buyer = WALLET_C;
    let state = id % 2 === 0 ? 4 : 5;
    let flagged = false;

    if (id <= 6) {
      seller = WALLET_A;
      buyer = WALLET_B;
      state = 4;
    } else if (id === 120) {
      seller = WALLET_A;
      buyer = WALLET_C;
      state = 3; // Disputed active
      flagged = true;
    } else if (id === 149) {
      buyer = WALLET_A;
      seller = WALLET_B;
      state = 1; // AwaitingEvidence active
    } else if (id === 10) {
      state = 3; // Disputed active (other wallets)
    } else if (id === 75) {
      state = 2; // Flagged attested active
      flagged = true;
    } else if (id === 148) {
      state = 1; // In-progress active
    }

    tradesMap.set(id, makeTrade(id, seller, buyer, state, flagged));
  }

  // 1) Wallet Discovery (useMyTrades / profile)
  const walletMock = createMockChainAndIndex({ tradesMap });
  const coldWallet = await discovery.discoverWalletTrades(walletMock.adapter, {
    filterAddress: WALLET_A,
    isAuthenticated: true,
  });
  const coldWalletCalls = coldWallet.metrics.getTradeCalls;

  walletMock.resetStats();
  const steadyWallet = await discovery.discoverWalletTrades(walletMock.adapter, {
    filterAddress: WALLET_A,
    isAuthenticated: true,
  });
  const steadyWalletCalls = steadyWallet.metrics.getTradeCalls;

  assert.equal(coldWallet.trades.length, 8);
  assert.equal(steadyWallet.trades.length, 8);
  assert.equal(coldWalletCalls, 8, 'Cold load should fetch only wallet K=8 trades instead of N=150');
  assert.equal(steadyWalletCalls, 2, 'Steady-state poll should fetch only active wallet trades (2 of 150)');
  assert.ok(1 - steadyWalletCalls / 150 >= 0.95, 'Wallet steady-state RPC reduction >= 95%');

  // 2) Admin Discovery (Disputed + All paginated 20/page)
  discovery.clearTradeDiscoveryCache();
  const adminMock = createMockChainAndIndex({ tradesMap });
  const coldAdminDisputed = await discovery.discoverAdminTrades(adminMock.adapter, {
    activeTab: 'disputed',
    page: 1,
    isAuthenticated: true,
  });
  assert.equal(coldAdminDisputed.disputedTrades.length, 2);
  assert.equal(coldAdminDisputed.flaggedTrades.length, 2);
  assert.equal(coldAdminDisputed.metrics.getTradeCalls, 5, 'Admin disputed cold load fetches only active trades (5 of 150)');

  // Now cold load Admin All tab (page 1 = IDs 150..131, 20 rows), then steady-state poll
  adminMock.resetStats();
  const coldAdminAll = await discovery.discoverAdminTrades(adminMock.adapter, {
    activeTab: 'all',
    page: 1,
    isAuthenticated: true,
  });
  assert.equal(coldAdminAll.pageTrades.length, 20);
  assert.ok(coldAdminAll.metrics.getTradeCalls <= 25, `Expected <=25 cold calls for Admin All page, got ${coldAdminAll.metrics.getTradeCalls}`);

  adminMock.resetStats();
  const steadyAdminAll = await discovery.discoverAdminTrades(adminMock.adapter, {
    activeTab: 'all',
    page: 1,
    isAuthenticated: true,
  });
  assert.equal(steadyAdminAll.pageTrades.length, 20);
  assert.equal(steadyAdminAll.metrics.getTradeCalls, 5, 'Steady-state Admin poll skips cached terminal rows cleanly');
  assert.ok(1 - steadyAdminAll.metrics.getTradeCalls / 150 >= 0.96, 'Admin steady-state RPC reduction >= 96%');

  // 3) Direct-RPC Fallback steady-state check on static Anvil/mocked chain
  discovery.clearTradeDiscoveryCache();
  const fallbackMock = createMockChainAndIndex({
    tradesMap,
    indexOverrides: { httpStatus: 503 },
  });
  const fbCold = await discovery.discoverWalletTrades(fallbackMock.adapter, {
    filterAddress: WALLET_A,
    isAuthenticated: true,
  });
  assert.equal(fbCold.metrics.usedBackendIndex, false);
  assert.equal(fbCold.metrics.getTradeCalls, 150);

  // Confirm static block promotes terminal rows after confirmation pass -> next poll hits only the 5 active trades!
  await discovery.discoverWalletTrades(fallbackMock.adapter, {
    filterAddress: WALLET_A,
    isAuthenticated: true,
  });
  const fbSteady = await discovery.discoverWalletTrades(fallbackMock.adapter, {
    filterAddress: WALLET_A,
    isAuthenticated: true,
  });
  assert.equal(fbSteady.metrics.getTradeCalls, 5, 'Fallback steady-state re-reads only 5 open non-terminal trades out of 150');
  assert.ok(1 - fbSteady.metrics.getTradeCalls / 150 >= 0.96);
});

test('TC-T3-03: Blockchain is final source of truth (stale DB state overridden by chain)', async () => {
  discovery.clearTradeDiscoveryCache();
  const tradesMap = new Map([
    [1, makeTrade(1, WALLET_A, WALLET_B, 4)],
    [2, makeTrade(2, WALLET_A, WALLET_B, 3, true)], // Live chain = Disputed & flagged
  ]);

  // DB index falsely claims trade #2 is still AwaitingEvidence (1), not flagged
  const staleDb = new Map([[2, { state: 1, flagged: false, isTerminal: false }]]);
  const mock = createMockChainAndIndex({
    tradesMap,
    staleDbStateOverrides: staleDb,
  });

  const walletRes = await discovery.discoverWalletTrades(mock.adapter, {
    filterAddress: WALLET_A,
    isAuthenticated: true,
  });
  const t2 = walletRes.trades.find((t) => Number(t.id) === 2);
  assert.equal(t2.state, 3, 'Wallet list must reflect live on-chain state=3 despite stale DB state=1');
  assert.equal(t2.flagged, true);

  const adminRes = await discovery.discoverAdminTrades(mock.adapter, {
    activeTab: 'disputed',
    page: 1,
    isAuthenticated: true,
  });
  assert.deepEqual(adminRes.disputedTrades.map((t) => Number(t.id)), [2]);
});

test('TC-T3-04: Index Freshness failures (isStale, isComplete=false, blockLag>20, reorg shrink) auto-fallback safely', async () => {
  const tradesMap = new Map([
    [1, makeTrade(1, WALLET_A, WALLET_B, 4)],
    [2, makeTrade(2, WALLET_A, WALLET_C, 3, true)],
  ]);

  const cases = [
    { name: 'isStale=true', indexOverrides: { isStale: true, isComplete: false } },
    { name: 'missingGapCount=1', indexOverrides: { missingGapCount: 1, isComplete: false } },
    { name: 'blockLag=30>20', indexedThroughBlock: 60999970, headBlock: 61000000 },
    { name: 'reorgNextIdShrink', indexedNextTradeId: 10 }, // chain nextTradeId=3 < indexedNextTradeId=10
  ];

  for (const c of cases) {
    discovery.clearTradeDiscoveryCache();
    const mock = createMockChainAndIndex({
      tradesMap,
      headBlock: c.headBlock ?? 61000000,
      indexedThroughBlock: c.indexedThroughBlock ?? 61000000,
      indexedNextTradeId: c.indexedNextTradeId,
      indexOverrides: c.indexOverrides ?? {},
    });

    const res = await discovery.discoverAdminTrades(mock.adapter, {
      activeTab: 'disputed',
      page: 1,
      isAuthenticated: true,
    });
    assert.equal(res.usedFallback, true, `${c.name} must trigger direct-RPC fallback`);
    assert.deepEqual(
      res.disputedTrades.map((t) => Number(t.id)),
      [2],
      `${c.name} fallback must still capture all disputed trades`
    );
  }
});

test('TC-T3-05: Admin pagination 20/page & Wallet/Profile full history > 100 trades (zero 100-cap)', async () => {
  discovery.clearTradeDiscoveryCache();
  const tradesMap = new Map();
  // Wallet A owns 115 out of 150 trades; Dispute #3 sits on oldest Admin page!
  for (let id = 1; id <= 150; id += 1) {
    const isWalletA = id <= 115;
    const isOldDispute = id === 3;
    tradesMap.set(
      id,
      makeTrade(
        id,
        isWalletA ? WALLET_A : WALLET_B,
        WALLET_C,
        isOldDispute ? 3 : 4,
        isOldDispute
      )
    );
  }

  const mock = createMockChainAndIndex({ tradesMap });
  const fullProfile = await discovery.discoverWalletTrades(mock.adapter, {
    filterAddress: WALLET_A,
    isAuthenticated: true,
  });
  assert.equal(fullProfile.trades.length, 115, 'Must paginate backend index and return all 115 trades (>100)');
  assert.equal(fullProfile.metrics.indexPagesFetched, 2);

  // Admin All tab page 1 & page 8 (last page: IDs 10..1) + Dispute #3 not missed
  const p1 = await discovery.discoverAdminTrades(mock.adapter, {
    activeTab: 'all',
    page: 1,
    isAuthenticated: true,
  });
  assert.equal(p1.totalPages, 8);
  assert.equal(p1.pageTrades.length, 20);
  assert.equal(Number(p1.pageTrades[0].id), 150);
  assert.equal(Number(p1.pageTrades[19].id), 131);
  assert.deepEqual(p1.disputedTrades.map((t) => Number(t.id)), [3]);

  const p8 = await discovery.discoverAdminTrades(mock.adapter, {
    activeTab: 'all',
    page: 8,
    isAuthenticated: true,
  });
  assert.equal(p8.pageTrades.length, 10);
  assert.deepEqual(
    p8.pageTrades.map((t) => Number(t.id)),
    [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
  );
});

test('TC-T3-06: Unauthenticated public profile fallback, cross-chain isolation & abort safety', async () => {
  discovery.clearTradeDiscoveryCache();
  const fujiTrades = new Map([[1, makeTrade(1, WALLET_A, WALLET_B, 4)]]);
  const anvilTrades = new Map([[1, makeTrade(1, WALLET_C, WALLET_B, 1)]]);

  // 1) Unauthenticated profile view skips /api/trades/index cleanly and loads full trades via direct RPC
  const unauthMock = createMockChainAndIndex({ chainId: 43113, tradesMap: fujiTrades });
  const unauthRes = await discovery.discoverWalletTrades(unauthMock.adapter, {
    filterAddress: WALLET_A,
    isAuthenticated: false,
  });
  assert.equal(unauthRes.metrics.indexPagesFetched, 0, 'Unauthenticated profile must not spam protected BFF index');
  assert.equal(unauthRes.metrics.fallbackReason, 'unauthenticated_direct_rpc');
  assert.equal(unauthRes.trades.length, 1);

  // 2) Cross-chain isolation: same escrowAddress on 43113 vs 31337 never cross-contaminates terminalTradesCache
  const fujiMock = createMockChainAndIndex({ chainId: 43113, tradesMap: fujiTrades });
  await discovery.discoverWalletTrades(fujiMock.adapter, {
    filterAddress: WALLET_A,
    isAuthenticated: true,
  });
  const anvilMock = createMockChainAndIndex({ chainId: 31337, tradesMap: anvilTrades });
  const anvilRes = await discovery.discoverWalletTrades(anvilMock.adapter, {
    filterAddress: WALLET_C,
    isAuthenticated: false,
  });
  assert.equal(anvilRes.trades.length, 1);
  assert.equal(anvilRes.trades[0].seller.toLowerCase(), WALLET_C);
  assert.equal(anvilRes.trades[0].state, 1);

  // 3) AbortController cancels cleanly without committing partial data
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    discovery.discoverWalletTrades(fujiMock.adapter, {
      filterAddress: WALLET_A,
      isAuthenticated: true,
      signal: ac.signal,
    }),
    (err) => err && err.name === 'AbortError'
  );
});

test('TC-T3-07: BFF GET /api/trades/index auth, validation & genuine runtime kill-switch', async () => {
  const prevUrl = process.env.BACKEND_URL;
  const prevSecret = process.env.ATTEST_API_KEY;
  const prevKillSwitch = process.env.TRADE_INDEX_ENABLED;
  const origFetch = global.fetch;

  const capturedBackendCalls = [];
  process.env.BACKEND_URL = 'http://backend.internal:8000';
  process.env.ATTEST_API_KEY = 'p3t3-bff-hmac-secret-key-at-least-32-bytes';
  process.env.TRADE_INDEX_ENABLED = 'true';

  global.fetch = async (url, init) => {
    capturedBackendCalls.push({ url: String(url), headers: init?.headers });
    return new Response(
      JSON.stringify({
        chainId: 43113,
        contractAddress: ESCROW_ADDR,
        indexedThroughBlock: 61000000,
        indexedNextTradeId: 2,
        isStale: false,
        isComplete: true,
        missingGapCount: 0,
        totalMatching: 1,
        summary: { disputedCount: 0, flaggedCount: 0, activeCount: 1 },
        items: [],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    // 1. Unauthenticated -> 401
    const unauthRes = await tradeIndexRoute.GET(
      new Request(`https://app.local/api/trades/index?wallet=${WALLET_B}`)
    );
    assert.equal(unauthRes.status, 401);

    const tokenA = createSessionToken(WALLET_A, 43113);
    const cookieHdr = `${SESSION_COOKIE_NAME}=${tokenA}`;

    // 2. Validation errors
    const badWalletRes = await tradeIndexRoute.GET(
      new Request('https://app.local/api/trades/index?wallet=invalid', {
        headers: { Cookie: cookieHdr },
      })
    );
    assert.equal(badWalletRes.status, 400);

    const badFilterRes = await tradeIndexRoute.GET(
      new Request('https://app.local/api/trades/index?filter=secret_dump', {
        headers: { Cookie: cookieHdr },
      })
    );
    assert.equal(badFilterRes.status, 400);

    // 3. Authenticated Wallet A can query Wallet B cleanly (OD-P3-T3-02)
    const okRes = await tradeIndexRoute.GET(
      new Request(`https://app.local/api/trades/index?wallet=${WALLET_B}&filter=all&limit=50&extra=dropme`, {
        headers: { Cookie: cookieHdr },
      })
    );
    assert.equal(okRes.status, 200);
    assert.equal(capturedBackendCalls.length, 1);
    assert.ok(!capturedBackendCalls[0].url.includes('extra=dropme'));
    assert.ok(capturedBackendCalls[0].url.includes(`wallet=${WALLET_B}`));

    // 4. Server runtime kill-switch `TRADE_INDEX_ENABLED=false` disables endpoint dynamically
    // without touching any Next.js build-time `NEXT_PUBLIC_*` variable
    process.env.TRADE_INDEX_ENABLED = 'false';
    const killedRes = await tradeIndexRoute.GET(
      new Request(`https://app.local/api/trades/index?wallet=${WALLET_B}`, {
        headers: { Cookie: cookieHdr },
      })
    );
    assert.equal(killedRes.status, 503);
    const killedBody = await killedRes.json();
    assert.equal(killedBody.error_code, 'TRADE_INDEX_DISABLED');
    assert.equal(killedBody.details?.fallback, 'direct_rpc');
    assert.equal(capturedBackendCalls.length, 1, 'Kill-switch short-circuits before hitting backend');
  } finally {
    global.fetch = origFetch;
    if (prevUrl === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = prevUrl;
    if (prevSecret === undefined) delete process.env.ATTEST_API_KEY;
    else process.env.ATTEST_API_KEY = prevSecret;
    if (prevKillSwitch === undefined) delete process.env.TRADE_INDEX_ENABLED;
    else process.env.TRADE_INDEX_ENABLED = prevKillSwitch;
  }
});

test('TC-T3-08: Visibility pause, exponential backoff & /admin error + pagination rendering checks', async () => {
  // 1) Poll controller visibility pause + backoff 5s -> 10s -> 20s -> 30s (imported from frozen marketplace.ts)
  let visible = false;
  let calls = 0;
  let seq = 100;
  const scheduled = [];
  const ctrl = marketplace.createNonOverlappingPollController({
    baseIntervalMs: 5000,
    maxBackoffMs: 30000,
    isVisible: () => visible,
    canPoll: () => true,
    setTimer: (fn, delayMs) => {
      const id = ++seq;
      scheduled.push({ id, fn, delayMs });
      return id;
    },
    clearTimer: () => {},
    runTask: async () => {
      calls += 1;
      throw new Error('429 rate limited');
    },
  });

  // Hidden tab must not start background polls
  await ctrl.trigger({ silent: true });
  assert.equal(calls, 0);
  assert.equal(scheduled.length, 0);

  // Becoming visible schedules 5s -> fails -> 10s -> fails -> 20s -> fails -> 30s
  visible = true;
  await ctrl.trigger({ silent: true });
  assert.equal(calls, 1);
  assert.equal(scheduled[scheduled.length - 1].delayMs, 10000);
  await scheduled[scheduled.length - 1].fn();
  assert.equal(scheduled[scheduled.length - 1].delayMs, 20000);
  await scheduled[scheduled.length - 1].fn();
  assert.equal(scheduled[scheduled.length - 1].delayMs, 30000);
  await scheduled[scheduled.length - 1].fn();
  assert.equal(scheduled[scheduled.length - 1].delayMs, 30000);
  ctrl.dispose();

  // 2) Render AdminDisputePage SSR check confirming Owner gating & absence of banned console.error
  const adminSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'app/admin/page.tsx'), 'utf8');
  assert.ok(!adminSrc.includes('console.error('), 'admin/page.tsx must not use console.error(');
  assert.ok(adminSrc.includes('notifyWalletActionError'), 'admin/page.tsx must keep notifyWalletActionError');

  const hookSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'hooks/useMyTrades.ts'), 'utf8');
  assert.ok(
    hookSrc.includes('trades,') &&
      hookSrc.includes('totalCreated,') &&
      hookSrc.includes('isLoading:') &&
      hookSrc.includes('isError:') &&
      hookSrc.includes('error:') &&
      hookSrc.includes('refetch,'),
    'useMyTrades must keep exact return contract'
  );

  // Verify admin page compiles and renders cleanly via ReactDOMServer with mocked hooks
  const origLoad = Module._load;
  Module._load = function mockedAdminLoad(request, parent, isMain) {
    if (request === 'wagmi') {
      return {
        useAccount: () => ({ address: WALLET_A, isConnected: true, chain: { id: 43113, name: 'Avalanche Fuji' } }),
        useChainId: () => 43113,
        usePublicClient: () => null,
        useReadContract: () => ({ data: WALLET_A, isLoading: false }),
        useWriteContract: () => ({ writeContractAsync: async () => '0xabc' }),
      };
    }
    if (request === '@/lib/wagmi') {
      return {
        targetChain: { id: 43113, name: 'Avalanche Fuji' },
      };
    }
    if (request === '@/hooks/useAuthSession') {
      return { useAuthSession: () => ({ isAuthenticated: true }) };
    }
    if (request === 'sonner') {
      return { toast: { loading: () => '1', success: () => {}, error: () => {} } };
    }
    return origLoad.call(this, request, parent, isMain);
  };
  try {
    const adminMod = require('@/app/admin/page.tsx');
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(adminMod.default));
    assert.ok(html.includes('Trọng tài &amp; Xử lý Tranh chấp') || html.includes('Trọng tài'));
    assert.ok(html.includes('Authorized Owner'));
    assert.ok(html.includes('Tổng cộng:'));
  } finally {
    Module._load = origLoad;
  }
});

test('TC-T3-09: Live hook useMyTrades & AdminDisputePage behavioral isolation and RPC error UI', async () => {
  discovery.clearTradeDiscoveryCache();

  function createMiniHookRunner(renderFn) {
    const slots = [];
    let hookIdx = 0;
    let mounted = true;

    function depsEqual(a, b) {
      if (!a || !b || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i += 1) {
        if (!Object.is(a[i], b[i])) return false;
      }
      return true;
    }

    const origHooks = {
      useState: React.useState,
      useRef: React.useRef,
      useMemo: React.useMemo,
      useCallback: React.useCallback,
      useEffect: React.useEffect,
    };

    const fakeDispatcher = {
      useState(init) {
        const idx = hookIdx++;
        if (idx >= slots.length) {
          slots.push({ kind: 'state', value: typeof init === 'function' ? init() : init });
        }
        const slot = slots[idx];
        const setState = (upd) => {
          const next = typeof upd === 'function' ? upd(slot.value) : upd;
          if (!Object.is(next, slot.value)) {
            slot.value = next;
          }
        };
        return [slot.value, setState];
      },
      useRef(init) {
        const idx = hookIdx++;
        if (idx >= slots.length) slots.push({ kind: 'ref', current: init });
        return slots[idx];
      },
      useMemo(factory, deps) {
        const idx = hookIdx++;
        if (idx >= slots.length || !depsEqual(slots[idx].deps, deps)) {
          slots[idx] = { kind: 'memo', deps, value: factory() };
        }
        return slots[idx].value;
      },
      useCallback(fn, deps) {
        return fakeDispatcher.useMemo(() => fn, deps);
      },
      useEffect(eff, deps) {
        const idx = hookIdx++;
        const prev = slots[idx];
        const run = !prev || deps === undefined || !depsEqual(prev.deps, deps);
        if (!prev) slots[idx] = { kind: 'effect', deps, cleanup: null };
        else prev.deps = deps;
        if (run) {
          pendingEffects.push({ idx, eff });
        }
      },
    };

    let pendingEffects = [];
    let lastOutput = null;

    function step(props) {
      if (!mounted) return lastOutput;
      Object.assign(React, fakeDispatcher);
      try {
        hookIdx = 0;
        pendingEffects = [];
        lastOutput = renderFn(props);
        const effects = pendingEffects.slice();
        pendingEffects = [];
        for (const it of effects) {
          if (typeof slots[it.idx].cleanup === 'function') {
            slots[it.idx].cleanup();
            slots[it.idx].cleanup = null;
          }
          const c = it.eff();
          if (typeof c === 'function') slots[it.idx].cleanup = c;
        }
      } finally {
        Object.assign(React, origHooks);
      }
      return lastOutput;
    }

    function unmount() {
      mounted = false;
      for (const s of slots) {
        if (s.kind === 'effect' && typeof s.cleanup === 'function') {
          s.cleanup();
          s.cleanup = null;
        }
      }
    }

    return { step, unmount };
  }

  let sessionCtx = {
    address: WALLET_A,
    chainId: 31337,
    isAuthenticated: false,
    failRpc: false,
    tradesById: new Map([[1, makeTrade(1, WALLET_A, WALLET_B, 1)]]),
  };

  const mockPublicClient = {
    getBlockNumber: async () => 50n,
    readContract: async ({ functionName, args }) => {
      if (sessionCtx.failRpc) throw new Error('429 Too Many Requests');
      if (functionName === 'nextTradeId') return BigInt(sessionCtx.tradesById.size + 1);
      if (functionName === 'getTrade') {
        const t = sessionCtx.tradesById.get(Number(args[0]));
        if (!t) return null;
        return [
          t.seller,
          t.buyer,
          t.itemValue,
          t.depositRequired,
          t.sellerDeposit,
          t.buyerDeposit,
          t.nonce,
          t.sellerEvidenceHash,
          t.buyerEvidenceHash,
          t.reportHash,
          t.riskScore,
          t.flagged,
          t.createdAt,
          t.evidenceDeadline,
          t.disputeDeadline,
          t.state,
        ];
      }
      return null;
    },
  };

  const origLoad = Module._load;
  const origDoc = global.document;
  global.document = {
    visibilityState: 'visible',
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  Module._load = function mockedLiveLoad(request, parent, isMain) {
    if (request === 'wagmi') {
      return {
        useAccount: () => ({
          address: sessionCtx.address,
          isConnected: Boolean(sessionCtx.address),
          chain: { id: sessionCtx.chainId, name: 'MockChain' },
        }),
        useChainId: () => sessionCtx.chainId,
        usePublicClient: () => mockPublicClient,
        useReadContract: () => ({ data: WALLET_A, isLoading: false }),
        useWriteContract: () => ({ writeContractAsync: async () => '0xabc' }),
      };
    }
    if (request === '@/lib/contracts') {
      return {
        chainId: 31337,
        escrowAddress: ESCROW_ADDR,
        escrowAbi: [],
      };
    }
    if (request === '@/lib/wagmi') {
      return { targetChain: { id: 31337, name: 'Local Anvil' } };
    }
    if (request === '@/hooks/useAuthSession') {
      return { useAuthSession: () => ({ isAuthenticated: sessionCtx.isAuthenticated }) };
    }
    if (request === 'sonner') {
      return { toast: { loading: () => '1', success: () => {}, error: () => {} } };
    }
    return origLoad.call(this, request, parent, isMain);
  };

  try {
    const hookAbs = path.join(FRONTEND_ROOT, 'hooks/useMyTrades.ts');
    const adminAbs = path.join(FRONTEND_ROOT, 'app/admin/page.tsx');
    delete require.cache[hookAbs];
    delete require.cache[adminAbs];

    const { useMyTrades } = require(hookAbs);
    const hookRunner = createMiniHookRunner(() => useMyTrades());

    hookRunner.step();
    await new Promise((r) => setTimeout(r, 30));
    const afterA = hookRunner.step();
    assert.equal(afterA.trades.length, 1);
    assert.equal(afterA.trades[0].seller.toLowerCase(), WALLET_A);

    // Trigger transient 429 RPC error: MUST preserve existing valid trades and mark isError=true
    sessionCtx.failRpc = true;
    await afterA.refetch();
    const afterErr = hookRunner.step();
    assert.equal(afterErr.isError, true);
    assert.equal(afterErr.trades.length, 1, 'Transient RPC 429 must keep prior valid trades');

    // Switch wallet to WALLET_B: MUST immediately clear WALLET_A trades (0 cross-wallet leak!)
    sessionCtx.failRpc = false;
    sessionCtx.address = WALLET_B;
    const immediateSwitch = hookRunner.step();
    assert.deepEqual(immediateSwitch.trades, [], 'Synchronous scope isolation clears old wallet trades immediately');
    hookRunner.unmount();

    // Now test AdminDisputePage rendering explicit RPC error banner on cold RPC 429 failure
    discovery.clearTradeDiscoveryCache();
    sessionCtx.address = WALLET_A;
    sessionCtx.failRpc = true;
    const AdminPage = require(adminAbs).default;
    const adminRunner = createMiniHookRunner(() => AdminPage());
    adminRunner.step();
    await new Promise((r) => setTimeout(r, 30));
    const errTree = adminRunner.step();
    const errHtml = ReactDOMServer.renderToStaticMarkup(errTree);
    assert.ok(
      errHtml.includes('Lỗi đồng bộ dữ liệu blockchain (RPC)'),
      'Admin must render explicit RPC error alert on 429/timeout'
    );
    assert.ok(
      !errHtml.includes('Không có tranh chấp nào cần giải quyết'),
      'Admin must NOT display false empty-state when initial RPC fails'
    );
    adminRunner.unmount();
  } finally {
    Module._load = origLoad;
    global.document = origDoc;
  }
});

test('TC-T3-10: Index lag 1-20 blocks never misses old trade turning Disputed/Flagged & partial multicall rejects', async () => {
  discovery.clearTradeDiscoveryCache();

  // Case A: Index lags 10 blocks behind head (60,999,990 vs 61,000,000).
  // Old trades #15 (Attested, unflagged) & #20 (AwaitingEvidence, unflagged) transitioned on-chain at block 60,999,995
  // to Disputed (#15) and Flagged Attested (#20), while index DB still holds stale pre-lag states.
  const tradesMap = new Map();
  for (let id = 1; id <= 30; id += 1) {
    if (id === 15) {
      tradesMap.set(id, makeTrade(id, WALLET_A, WALLET_B, 3, false)); // Live: Disputed!
    } else if (id === 20) {
      tradesMap.set(id, makeTrade(id, WALLET_A, WALLET_C, 2, true)); // Live: Attested + Flagged!
    } else if (id === 25) {
      tradesMap.set(id, makeTrade(id, WALLET_B, WALLET_C, 3, true)); // Live: Reorg-reverted within 12-block window
    } else {
      tradesMap.set(id, makeTrade(id, WALLET_B, WALLET_C, 4, false));
    }
  }

  const staleDbOverrides = new Map([
    [15, { state: 2, flagged: false, isTerminal: false }], // index didn't see Disputed yet
    [20, { state: 1, flagged: false, isTerminal: false }], // index didn't see Flagged yet
    [25, { state: 4, flagged: false, isTerminal: false }], // recent terminal inside 12-block lookback (is_terminal=0)
  ]);

  const mock = createMockChainAndIndex({
    chainId: 43113,
    tradesMap,
    headBlock: 61000000,
    indexedThroughBlock: 60999990, // lag = 10 blocks (within 1..20)
    staleDbStateOverrides: staleDbOverrides,
  });

  // Override fetchIndexPage filter=active to mirror db.py (is_terminal=0 OR state not in 4,5)
  const baseFetch = mock.adapter.fetchIndexPage;
  mock.adapter.fetchIndexPage = async (params) => {
    const resp = await baseFetch(params);
    if (resp.ok && resp.data && params.filter === 'active') {
      const has25 = resp.data.items.some((x) => x.tradeId === 25);
      if (!has25) {
        resp.data.items.push({
          tradeId: 25,
          seller: WALLET_B,
          buyer: WALLET_C,
          lastKnownState: 4,
          flagged: false,
          isTerminal: false,
        });
        resp.data.totalMatching += 1;
        resp.data.summary.activeCount += 1;
      }
    }
    return resp;
  };

  const adminRes = await discovery.discoverAdminTrades(mock.adapter, {
    activeTab: 'disputed',
    page: 1,
    isAuthenticated: true,
  });

  assert.deepEqual(
    adminRes.disputedTrades.map((t) => Number(t.id)),
    [25, 15],
    'Admin must capture old trade #15 turning Disputed & recent #25 during 1-20 block index lag'
  );
  assert.deepEqual(
    adminRes.flaggedTrades.map((t) => Number(t.id)),
    [25, 20],
    'Admin must capture old trade #20 turning Flagged during 1-20 block index lag'
  );

  // Case B: Partial multicall failure MUST recover via readContract OR throw cleanly (never treat partial as complete)
  let readContractFallbackCount = 0;
  const recoveringClient = {
    getBlockNumber: async () => 61000000n,
    multicall: async () => [
      { status: 'success', result: [WALLET_A, WALLET_B, 1n, 1n, 1n, 1n, ZERO_B32, ZERO_B32, ZERO_B32, ZERO_B32, 0, false, 1n, 1n, 1n, 4] },
      { status: 'failure', error: new Error('slot failure') },
    ],
    readContract: async ({ functionName, args }) => {
      if (functionName === 'getTrade') {
        readContractFallbackCount += 1;
        assert.equal(Number(args[0]), 2);
        return [WALLET_A, WALLET_C, 1n, 1n, 1n, 1n, ZERO_B32, ZERO_B32, ZERO_B32, ZERO_B32, 90, true, 1n, 1n, 1n, 3];
      }
      return 3n;
    },
  };
  const partialAdapter = discovery.createPublicClientTradeAdapter({
    chainId: 43113,
    escrowAddress: ESCROW_ADDR,
    escrowAbi: [],
    publicClient: recoveringClient,
  });
  const recoveredMap = await partialAdapter.readTradesBatch([1, 2]);
  assert.equal(readContractFallbackCount, 1);
  assert.equal(recoveredMap.get(2).state, 3, 'Must recover failed multicall slot rather than dropping trade #2');

  const failingClient = {
    ...recoveringClient,
    readContract: async ({ functionName }) => {
      if (functionName === 'getTrade') throw new Error('persistent RPC failure on slot 2');
      return 3n;
    },
  };
  const strictAdapter = discovery.createPublicClientTradeAdapter({
    chainId: 43113,
    escrowAddress: ESCROW_ADDR,
    escrowAbi: [],
    publicClient: failingClient,
  });
  await assert.rejects(
    strictAdapter.readTradesBatch([1, 2]),
    /persistent RPC failure/,
    'Must reject rather than silently returning incomplete partial batch as complete'
  );
});
