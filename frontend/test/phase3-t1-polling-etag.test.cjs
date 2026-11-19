'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

const FRONTEND_ROOT = path.resolve(__dirname, '..');

function registerTsLoader() {
  const origResolve = Module._resolveFilename;
  if (!Module._resolveFilename.__p3t1TsPatched) {
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
    Module._resolveFilename.__p3t1TsPatched = true;
  }

  require.extensions['.ts'] = function compileTs(mod, filename) {
    const src = fs.readFileSync(filename, 'utf8');
    const out = ts.transpileModule(src, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.Node10,
      },
      fileName: filename,
    });
    return mod._compile(out.outputText, filename);
  };
}

registerTsLoader();

const {
  browseListings,
  getListing,
  createListing,
  updateListing,
  createPurchaseRequest,
  clearListingsEtagCache,
  getListingsEtagCacheStats,
  computePollDelayMs,
  createNonOverlappingPollController,
  MAX_ETAG_CACHE_ENTRIES,
  MarketplaceApiError,
} = require('@/lib/marketplace');

const WALLET_A = '0x1111111111111111111111111111111111111111';
const WALLET_B = '0x2222222222222222222222222222222222222222';

function makeSampleListing(overrides = {}) {
  return {
    id: 'lst-101',
    chain_id: 43113,
    escrow_address: '0x19d053c84941411888f5b9e40c854365fdd4eb00',
    seller_wallet: WALLET_A,
    sku: 'LEGO-10305',
    sku_norm: 'LEGO-10305',
    category: 'LEGO',
    title: 'LEGO Lion Knights Castle',
    description: 'Sealed box',
    price_wei: '2000000000000000000',
    deposit_required_wei: '600000000000000000',
    collateral_asset: 'AVAX',
    accounting_token: 'CDU',
    condition: 'SEALED_NEW',
    quantity_total: 2,
    quantity_reserved: 0,
    quantity_sold: 0,
    quantity_available: 2,
    primary_image_uri: 'ipfs://QmPrimary101',
    primary_image_sha256: 'abc123',
    primary_image_phash: 'def456',
    images: [
      { id: 1, cid: 'QmPrimary101', uri: 'ipfs://QmPrimary101', sort_order: 0, is_primary: true },
    ],
    review_required: false,
    warnings: [{ code: 'SAMPLE_WARN', severity: 'info', message: 'ok' }],
    status: 'ACTIVE',
    seller_reputation: 50,
    linked_trades: [],
    created_at: 1700000000,
    updated_at: 1700000000,
    ...overrides,
  };
}

function makeEnvelope(items = [makeSampleListing()]) {
  return {
    items,
    total: items.length,
    page: 1,
    limit: 12,
    total_pages: 1,
  };
}

test('P3-T1 AC-02: browseListings caches ETag by canonical query, sends If-None-Match, and handles 304 without parsing JSON', async () => {
  clearListingsEtagCache();
  const prevFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, headers: { ...(init.headers || {}) } });
    if (calls.length === 1) {
      return {
        ok: true,
        status: 200,
        headers: { get: (k) => (k.toLowerCase() === 'etag' ? 'W/"listings-v1-hash"' : null) },
        json: async () => makeEnvelope(),
      };
    }
    return {
      ok: false,
      status: 304,
      headers: { get: (k) => (k.toLowerCase() === 'etag' ? 'W/"listings-v1-hash"' : null) },
      json: async () => {
        throw new Error('304 response must not invoke res.json()');
      },
    };
  };

  try {
    const first = await browseListings(
      { page: 1, category: 'LEGO', sort: 'newest' },
      { sessionScope: WALLET_A, chainScope: 43113 }
    );
    assert.equal(first._notModified, false);
    assert.equal(first.items.length, 1);
    assert.equal(calls[0].headers['If-None-Match'], undefined);

    // Reordered query keys must hit the exact same canonical cache entry
    const second = await browseListings(
      { sort: 'newest', category: 'LEGO', page: 1 },
      { sessionScope: WALLET_A, chainScope: 43113 }
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[1].headers['If-None-Match'], 'W/"listings-v1-hash"');
    assert.equal(second._notModified, true);
    assert.equal(second.items.length, 1);
    assert.equal(second.items[0].sku, 'LEGO-10305');
  } finally {
    globalThis.fetch = prevFetch;
    clearListingsEtagCache();
  }
});

test('P3-T1 Cache Immutability: caller mutating returned items/nested arrays never corrupts cached snapshot', async () => {
  clearListingsEtagCache();
  const prevFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        ok: true,
        status: 200,
        headers: { get: (k) => (k.toLowerCase() === 'etag' ? 'W/"etag-immut"' : null) },
        json: async () => makeEnvelope(),
      };
    }
    return {
      ok: false,
      status: 304,
      headers: { get: () => 'W/"etag-immut"' },
      json: async () => ({}),
    };
  };

  try {
    const res1 = await browseListings({ page: 1 }, { sessionScope: WALLET_A, chainScope: 43113 });
    // Mutate returned objects and nested arrays aggressively
    res1.items[0].title = 'CORRUPTED BY CALLER';
    res1.items[0].images[0].uri = 'ipfs://CORRUPTED';
    res1.items[0].images.push({ id: 99, cid: 'x', uri: 'ipfs://x', sort_order: 1, is_primary: false });
    res1.items[0].warnings[0].message = 'CORRUPTED WARN';
    res1.items.push(makeSampleListing({ id: 'lst-fake' }));

    const res2 = await browseListings({ page: 1 }, { sessionScope: WALLET_A, chainScope: 43113 });
    assert.equal(res2._notModified, true);
    assert.equal(res2.items.length, 1);
    assert.equal(res2.items[0].title, 'LEGO Lion Knights Castle');
    assert.equal(res2.items[0].images.length, 1);
    assert.equal(res2.items[0].images[0].uri, 'ipfs://QmPrimary101');
    assert.equal(res2.items[0].warnings[0].message, 'ok');

    // Also mutate 304 result and verify next 304 is still clean
    res2.items[0].title = 'CORRUPTED ON 304';
    const res3 = await browseListings({ page: 1 }, { sessionScope: WALLET_A, chainScope: 43113 });
    assert.equal(res3.items[0].title, 'LEGO Lion Knights Castle');
  } finally {
    globalThis.fetch = prevFetch;
    clearListingsEtagCache();
  }
});

test('P3-T1 AC-02 Cache-Miss on 304: bounded 1-attempt retry without If-None-Match and clear error on broken upstream', async () => {
  clearListingsEtagCache();
  const prevFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, headers: { ...(init.headers || {}) } });
    if (calls.length === 1) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'W/"v1"' },
        json: async () => makeEnvelope([makeSampleListing({ title: 'V1 Title' })]),
      };
    }
    if (calls.length === 2) {
      // Simulate cache cleared while GET with If-None-Match was in flight, and server still responds 304
      clearListingsEtagCache();
      return {
        ok: false,
        status: 304,
        headers: { get: () => 'W/"v1"' },
        json: async () => ({}),
      };
    }
    if (calls.length === 3) {
      // Unconditional fallback retry without If-None-Match returns fresh 200
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'W/"v2"' },
        json: async () => makeEnvelope([makeSampleListing({ title: 'V2 Fresh After Retry' })]),
      };
    }
    throw new Error('Unexpected extra fetch call');
  };

  try {
    await browseListings({ page: 1 }, { sessionScope: WALLET_A, chainScope: 43113 });
    const recovered = await browseListings({ page: 1 }, { sessionScope: WALLET_A, chainScope: 43113 });
    assert.equal(calls.length, 3);
    assert.equal(calls[1].headers['If-None-Match'], 'W/"v1"');
    assert.equal(calls[2].headers['If-None-Match'], undefined);
    assert.equal(recovered._notModified, false);
    assert.equal(recovered.items[0].title, 'V2 Fresh After Retry');

    // Now verify bounded retry when upstream misbehaves and returns 304 even on unconditional retry
    let brokenCalls = 0;
    globalThis.fetch = async () => {
      brokenCalls += 1;
      if (brokenCalls === 1) {
        clearListingsEtagCache();
      }
      return {
        ok: false,
        status: 304,
        headers: { get: () => 'W/"broken"' },
        json: async () => ({ error_code: 'UPSTREAM_304_WITHOUT_CACHE' }),
      };
    };

    await assert.rejects(
      () => browseListings({ page: 1 }, { sessionScope: WALLET_A, chainScope: 43113 }),
      (err) => err instanceof MarketplaceApiError && err.status === 502
    );
    assert.equal(brokenCalls, 2, 'Must stop after exactly 1 fallback retry (2 total fetches)');
  } finally {
    globalThis.fetch = prevFetch;
    clearListingsEtagCache();
  }
});

test('P3-T1 AC-03 Mutation Race Protection (cacheEpoch): in-flight GET from before mutation cannot poison cache', async () => {
  clearListingsEtagCache();
  const prevFetch = globalThis.fetch;
  let resolveSlowGet;
  const seenHeaders = [];

  globalThis.fetch = async (url, init = {}) => {
    seenHeaders.push({ url, method: init.method, headers: { ...(init.headers || {}) } });
    if (init.method === 'GET' && seenHeaders.length === 1) {
      return await new Promise((resolve) => {
        resolveSlowGet = resolve;
      });
    }
    if (init.method === 'POST') {
      return {
        ok: true,
        status: 201,
        headers: { get: () => null },
        json: async () => makeSampleListing({ id: 'lst-new' }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'W/"fresh-after-post"' },
      json: async () => makeEnvelope([makeSampleListing({ id: 'lst-new', title: 'New Listing' })]),
    };
  };

  try {
    // 1. Start slow GET at epoch X
    const slowGetPromise = browseListings({ page: 1 }, { sessionScope: WALLET_A, chainScope: 43113 });

    // 2. While slow GET is in-flight, execute a write mutation (createListing)
    await createListing({
      sku: 'NEW-1',
      category: 'LEGO',
      title: 'New Listing',
      price_wei: '1000000000000000000',
      condition: 'SEALED_NEW',
      quantity_total: 1,
      images: [{ uri: 'ipfs://QmNew', is_primary: true }],
    });

    // 3. Now slow GET finishes with a stale ETag from before the mutation
    resolveSlowGet({
      ok: true,
      status: 200,
      headers: { get: () => 'W/"stale-pre-mutation"' },
      json: async () => makeEnvelope([makeSampleListing({ title: 'Stale Listing' })]),
    });
    await slowGetPromise;

    // 4. Verify stale ETag was NOT written to cache
    assert.equal(getListingsEtagCacheStats().size, 0);

    // 5. Next GET must NOT send stale If-None-Match
    const afterMutation = await browseListings({ page: 1 }, { sessionScope: WALLET_A, chainScope: 43113 });
    const lastCall = seenHeaders[seenHeaders.length - 1];
    assert.equal(lastCall.headers['If-None-Match'], undefined);
    assert.equal(afterMutation.items[0].title, 'New Listing');
  } finally {
    globalThis.fetch = prevFetch;
    clearListingsEtagCache();
  }
});

test('P3-T1 AC-03 & AC-08 Session/Chain Isolation, LRU Bound (<= 50) & Zero Secret Key Leakage', async () => {
  clearListingsEtagCache();
  const prevFetch = globalThis.fetch;
  const reqLog = [];

  globalThis.fetch = async (url, init = {}) => {
    reqLog.push({ url, inm: init.headers?.['If-None-Match'] });
    return {
      ok: true,
      status: 200,
      headers: { get: () => `W/"etag-${reqLog.length}"` },
      json: async () => makeEnvelope(),
    };
  };

  try {
    // Wallet A on chain 43113 caches ETag
    await browseListings({ page: 1 }, { sessionScope: WALLET_A, chainScope: 43113 });
    assert.equal(getListingsEtagCacheStats().size, 1);

    // Switching to Wallet B on chain 43113 automatically purges Wallet A's cache and does NOT send Wallet A's ETag
    await browseListings({ page: 1 }, { sessionScope: WALLET_B, chainScope: 43113 });
    assert.equal(reqLog[1].inm, undefined);
    const statsB = getListingsEtagCacheStats();
    assert.equal(statsB.size, 1);
    assert.ok(statsB.keys[0].startsWith(`${WALLET_B}::43113::`));

    // Switching chainScope from 43113 to 31337 purges 43113 cache
    await browseListings({ page: 1 }, { sessionScope: WALLET_B, chainScope: 31337 });
    assert.equal(reqLog[2].inm, undefined);
    assert.ok(getListingsEtagCacheStats().keys[0].startsWith(`${WALLET_B}::31337::`));

    // Security check: passing a raw JWT or API secret as sessionScope must NEVER store the secret in cache keys
    const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.secretSig';
    await browseListings({ page: 1 }, { sessionScope: fakeJwt, chainScope: 43113 });
    for (const key of getListingsEtagCacheStats().keys) {
      assert.equal(key.includes('eyJhbGci'), false, 'Cache key must never contain raw JWT');
      assert.equal(key.includes('secretSig'), false, 'Cache key must never contain secret signature');
      assert.ok(key.startsWith('anon::43113::'));
    }

    // LRU bound check: inserting 55 distinct pages within same scope caps size at MAX_ETAG_CACHE_ENTRIES (50)
    for (let p = 1; p <= 55; p += 1) {
      await browseListings({ page: p }, { sessionScope: WALLET_A, chainScope: 43113 });
    }
    const lruStats = getListingsEtagCacheStats();
    assert.equal(lruStats.size, MAX_ETAG_CACHE_ENTRIES);
    assert.equal(
      lruStats.keys.some((k) => k.endsWith('?page=1')),
      false,
      'Oldest entries (page 1..5) must be evicted by LRU'
    );
    assert.equal(
      lruStats.keys.some((k) => k.endsWith('?page=55')),
      true,
      'Newest entry (page 55) must remain in cache'
    );
  } finally {
    globalThis.fetch = prevFetch;
    clearListingsEtagCache();
  }
});

test('P3-T1 AC-07: computePollDelayMs & controller follow exact 5s -> 10s -> 20s -> 30s backoff and reset on success', async () => {
  assert.equal(computePollDelayMs(0), 5_000);
  assert.equal(computePollDelayMs(1), 10_000);
  assert.equal(computePollDelayMs(2), 20_000);
  assert.equal(computePollDelayMs(3), 30_000);
  assert.equal(computePollDelayMs(4), 30_000);

  const scheduledDelays = [];
  let nextTimerFn = null;
  let shouldFail = false;

  const controller = createNonOverlappingPollController({
    baseIntervalMs: 5_000,
    maxBackoffMs: 30_000,
    setTimer: (fn, delayMs) => {
      scheduledDelays.push(delayMs);
      nextTimerFn = fn;
      return scheduledDelays.length;
    },
    clearTimer: () => {
      nextTimerFn = null;
    },
    runTask: async () => {
      if (shouldFail) {
        throw new Error('simulated poll failure');
      }
    },
  });

  // Initial load succeeds -> schedules 5,000 ms
  await controller.trigger({ silent: false });
  assert.equal(scheduledDelays[scheduledDelays.length - 1], 5_000);

  // Consecutive background failures -> 10,000 -> 20,000 -> 30,000 -> 30,000
  shouldFail = true;
  for (const expectedDelay of [10_000, 20_000, 30_000, 30_000]) {
    const fn = nextTimerFn;
    assert.equal(typeof fn, 'function');
    await fn();
    assert.equal(scheduledDelays[scheduledDelays.length - 1], expectedDelay);
  }

  // Recovery on next poll -> resets consecutiveFailures to 0 and schedules 5,000 ms
  shouldFail = false;
  await nextTimerFn();
  assert.equal(controller.getState().consecutiveFailures, 0);
  assert.equal(scheduledDelays[scheduledDelays.length - 1], 5_000);

  controller.dispose();
});

test('P3-T1 AC-04, AC-06, AC-07: Non-overlapping poll guard, stale response rejection, and visibility/form pause & resume', async () => {
  let visible = true;
  let formBusy = false;
  let pendingTimer = null;
  const appliedResults = [];
  const pendingResolvers = new Map();

  const controller = createNonOverlappingPollController({
    baseIntervalMs: 5_000,
    isVisible: () => visible,
    canPoll: () => !formBusy,
    setTimer: (fn, delayMs) => {
      pendingTimer = { fn, delayMs };
      return 1;
    },
    clearTimer: () => {
      pendingTimer = null;
    },
    runTask: async ({ signal, seq, isCurrent }) => {
      const value = await new Promise((resolve, reject) => {
        pendingResolvers.set(seq, { resolve, reject, signal });
      });
      if (!isCurrent()) return;
      appliedResults.push({ seq, value });
    },
  });

  // 1. Start initial request (seq=1)
  const p1 = controller.trigger({ silent: false });
  assert.equal(controller.getState().inFlight, true);
  assert.equal(controller.getState().seq, 1);

  // 2. Attempt silent background poll while seq=1 is still in-flight -> MUST NOT overlap!
  await controller.trigger({ silent: true });
  assert.equal(controller.getState().seq, 1);
  assert.equal(pendingResolvers.size, 1);

  // 3. User changes filter (silent: false) while seq=1 is still in-flight -> aborts seq=1 and starts seq=2
  const p2 = controller.trigger({ silent: false });
  assert.equal(controller.getState().seq, 2);
  assert.equal(pendingResolvers.get(1).signal.aborted, true, 'Request 1 must be aborted on filter change');

  // 4. Resolve Request 2 first, then resolve stale Request 1 late -> stale Request 1 MUST be ignored
  pendingResolvers.get(2).resolve('fresh-filter-B');
  await p2;
  pendingResolvers.get(1).resolve('stale-filter-A');
  await p1;

  assert.deepEqual(appliedResults, [{ seq: 2, value: 'fresh-filter-B' }]);
  assert.notEqual(pendingTimer, null, 'Next 5s timer should be scheduled after Request 2 completes');

  // 5. Tab becomes hidden -> scheduled timer is cancelled immediately
  visible = false;
  controller.onVisibilityOrStateChange();
  assert.equal(pendingTimer, null);

  // 6. Tab becomes visible again, but form is busy (e.g. isSubmitting / priceError) -> still paused
  visible = true;
  formBusy = true;
  controller.onVisibilityOrStateChange();
  assert.equal(controller.getState().inFlight, false);

  // 7. Form finishes (formBusy = false) -> triggers immediate silent refresh (seq=3)
  formBusy = false;
  controller.onVisibilityOrStateChange();
  assert.equal(controller.getState().inFlight, true);
  assert.equal(controller.getState().seq, 3);
  pendingResolvers.get(3).resolve('resumed-refresh');

  controller.dispose();
});
