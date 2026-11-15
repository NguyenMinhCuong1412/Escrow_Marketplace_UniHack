'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || 'test-session-secret-marketplace-bff-0123456789abcd';

const FRONTEND_ROOT = path.resolve(__dirname, '..');

function registerTsLoader() {
  const origResolve = Module._resolveFilename;
  if (!Module._resolveFilename.__mktTsPatched) {
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
    Module._resolveFilename.__mktTsPatched = true;
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

const { SESSION_COOKIE_NAME, createSessionToken } = require('@/lib/auth-session');
const { computeProxySignature, buildSignedProxyHeaders } = require('@/lib/marketplace-bff');
const marketplaceClient = require('@/lib/marketplace');

const listingsRoute = require('@/app/api/listings/route');
const myListingsRoute = require('@/app/api/listings/mine/route');
const listingByIdRoute = require('@/app/api/listings/[id]/route');
const listingRequestsRoute = require('@/app/api/listings/[id]/requests/route');
const requestsRoute = require('@/app/api/requests/route');
const requestByIdRoute = require('@/app/api/requests/[id]/route');
const requestDecisionRoute = require('@/app/api/requests/[id]/decision/route');
const requestCancelRoute = require('@/app/api/requests/[id]/cancel/route');
const requestBindTradeRoute = require('@/app/api/requests/[id]/bind-trade/route');
const tradeSyncRoute = require('@/app/api/trades/[id]/sync/route');
const tradeContextRoute = require('@/app/api/trades/[id]/context/route');

const SELLER = '0x2222222222222222222222222222222222222222';
const BUYER = '0x3333333333333333333333333333333333333333';
const TEST_API_KEY = 'test-hmac-secret-key-999999';

function makeCookieHeader(address = SELLER, chainId = 43113) {
  const token = createSessionToken(address, chainId);
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

function makeJsonRequest(
  urlPath,
  {
    method = 'GET',
    body = undefined,
    cookie = undefined,
    origin = 'http://127.0.0.1:3000',
    referer = undefined,
    secFetchSite = 'same-origin',
    contentType = undefined,
    idempotencyKey = undefined,
  } = {}
) {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  if (method !== 'GET') {
    if (origin !== null) headers.set('origin', origin);
    if (referer) headers.set('referer', referer);
    if (secFetchSite) headers.set('sec-fetch-site', secFetchSite);
    if (contentType !== undefined) {
      if (contentType !== null) headers.set('content-type', contentType);
    } else if (body !== undefined) {
      headers.set('content-type', 'application/json');
    }
  }
  if (idempotencyKey) headers.set('idempotency-key', idempotencyKey);

  return new Request(`http://127.0.0.1:3000${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function withEnv(vars, fn) {
  const backup = {};
  for (const k of Object.keys(vars)) {
    backup[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const k of Object.keys(vars)) {
        if (backup[k] === undefined) delete process.env[k];
        else process.env[k] = backup[k];
      }
    });
}

function ctxId(id) {
  return { params: Promise.resolve({ id }) };
}

test('computeProxySignature matches backend/listings.py reference vector & rejects missing key on Fuji', () => {
  const secret = 'super-secret-proxy-key';
  const msg = 'POST\n/listings\n0xabcdefabcdefabcdefabcdefabcdefabcdefabcd\n43113\n1700000000\nnonce_12345678';
  const expected = crypto.createHmac('sha256', secret).update(msg, 'utf8').digest('hex');

  const actual = computeProxySignature(
    secret,
    'post',
    '/listings',
    '0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCd',
    43113,
    1700000000,
    'nonce_12345678'
  );
  assert.equal(actual, expected);

  // Fail closed on Fuji 43113 if API key is empty
  const failFuji = buildSignedProxyHeaders({
    method: 'POST',
    upstreamPath: '/listings',
    session: { address: SELLER, chainId: 43113 },
    apiKey: '',
    requireSignature: false,
  });
  assert.equal(failFuji.ok, false);
  assert.equal(failFuji.response.status, 503);

  // Fail closed on 31337 if REQUIRE_PROXY_SIGNATURE=true and API key is empty
  const failRequired = buildSignedProxyHeaders({
    method: 'POST',
    upstreamPath: '/listings',
    session: { address: SELLER, chainId: 31337 },
    apiKey: '',
    requireSignature: true,
  });
  assert.equal(failRequired.ok, false);
  assert.equal(failRequired.response.status, 503);
});

test('Public GET routes allow Guests without fake wallet headers and strip extra query params', async () => {
  const origFetch = global.fetch;
  const captured = [];
  global.fetch = async (url, init) => {
    captured.push({ url, init });
    return new Response(JSON.stringify({ items: [], total: 0, page: 1, limit: 20, total_pages: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await withEnv(
    {
      BACKEND_URL: 'http://backend.local:8000',
      ATTEST_API_KEY: TEST_API_KEY,
      NEXT_PUBLIC_CHAIN_ID: '43113',
      REQUIRE_PROXY_SIGNATURE: 'true',
    },
    async () => {
      try {
        // Guest browse with unknown/dangerous params stripped
        const browseRes = await listingsRoute.GET(
          makeJsonRequest('/api/listings?category=LEGO&q=cafe&evil=1&admin=true')
        );
        assert.equal(browseRes.status, 200);
        assert.equal(captured[0].url, 'http://backend.local:8000/listings?q=cafe&category=LEGO');
        assert.equal(captured[0].init.headers['X-Authenticated-Wallet'], undefined);
        assert.equal(captured[0].init.headers['X-Auth-Signature'], undefined);
        assert.equal(captured[0].init.headers['X-API-Key'], TEST_API_KEY);

        // Guest detail
        const detailRes = await listingByIdRoute.GET(
          makeJsonRequest('/api/listings/lst_demo_01'),
          ctxId('lst_demo_01')
        );
        assert.equal(detailRes.status, 200);
        assert.equal(captured[1].url, 'http://backend.local:8000/listings/lst_demo_01');
        assert.equal(captured[1].init.headers['X-Authenticated-Wallet'], undefined);

        // Guest trade context
        const ctxRes = await tradeContextRoute.GET(
          makeJsonRequest('/api/trades/42/context'),
          ctxId('42')
        );
        assert.equal(ctxRes.status, 200);
        assert.equal(captured[2].url, 'http://backend.local:8000/trades/42/context');
        assert.equal(captured[2].init.headers['X-Authenticated-Wallet'], undefined);

        // Authenticated browse includes valid HMAC signature
        const authedRes = await listingsRoute.GET(
          makeJsonRequest('/api/listings?status=ACTIVE', { cookie: makeCookieHeader(SELLER, 43113) })
        );
        assert.equal(authedRes.status, 200);
        assert.equal(captured[3].init.headers['X-Authenticated-Wallet'], SELLER.toLowerCase());
        assert.ok(captured[3].init.headers['X-Auth-Signature']);
        assert.ok(captured[3].init.headers['X-Auth-Nonce']);
        assert.ok(captured[3].init.headers['X-Auth-Timestamp']);
      } finally {
        global.fetch = origFetch;
      }
    }
  );
});

test('Private reads & all writes reject Guest (401), CSRF attacks (403/415), spoofed wallet/chainId (400), and invalid IDs (400)', async () => {
  const origFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return new Response('{}', { status: 200 });
  };

  await withEnv(
    {
      BACKEND_URL: 'http://backend.local:8000',
      ATTEST_API_KEY: TEST_API_KEY,
      NEXT_PUBLIC_CHAIN_ID: '43113',
      REQUIRE_PROXY_SIGNATURE: 'true',
    },
    async () => {
      try {
        const cookie = makeCookieHeader(SELLER, 43113);

        // Guest rejected on private GETs & POST/PATCH writes
        assert.equal((await myListingsRoute.GET(makeJsonRequest('/api/listings/mine'))).status, 401);
        assert.equal((await requestsRoute.GET(makeJsonRequest('/api/requests'))).status, 401);
        assert.equal(
          (await requestByIdRoute.GET(makeJsonRequest('/api/requests/req_01'), ctxId('req_01'))).status,
          401
        );
        assert.equal(
          (
            await listingsRoute.POST(
              makeJsonRequest('/api/listings', { method: 'POST', body: { title: 'x' } })
            )
          ).status,
          401
        );
        assert.equal(
          (
            await listingByIdRoute.PATCH(
              makeJsonRequest('/api/listings/lst_01', { method: 'PATCH', body: { title: 'y' } }),
              ctxId('lst_01')
            )
          ).status,
          401
        );
        assert.equal(
          (
            await tradeSyncRoute.POST(
              makeJsonRequest('/api/trades/7/sync', { method: 'POST', body: {} }),
              ctxId('7')
            )
          ).status,
          401
        );

        // Tampered session cookie -> 401
        assert.equal(
          (
            await myListingsRoute.GET(
              makeJsonRequest('/api/listings/mine', { cookie: `${SESSION_COOKIE_NAME}=tampered.token` })
            )
          ).status,
          401
        );

        // CSRF origin & sec-fetch-site & <form> content-type blocked even with valid cookie
        const crossOrigin = await listingsRoute.POST(
          makeJsonRequest('/api/listings', {
            method: 'POST',
            cookie,
            origin: 'https://evil.example',
            secFetchSite: 'same-origin',
            body: { title: 'test' },
          })
        );
        assert.equal(crossOrigin.status, 403);
        assert.equal((await crossOrigin.json()).error_code, 'CSRF_REJECTED');

        const crossSiteFetch = await requestDecisionRoute.POST(
          makeJsonRequest('/api/requests/req_01/decision', {
            method: 'POST',
            cookie,
            origin: null,
            secFetchSite: 'cross-site',
            body: { action: 'accept' },
          }),
          ctxId('req_01')
        );
        assert.equal(crossSiteFetch.status, 403);

        const formCt = await listingsRoute.POST(
          makeJsonRequest('/api/listings', {
            method: 'POST',
            cookie,
            contentType: 'application/x-www-form-urlencoded',
            body: 'title=hack',
          })
        );
        assert.equal(formCt.status, 415);

        // Spoofed identity fields rejected even on POST /trades/[id]/sync
        for (const payload of [
          { seller_wallet: BUYER, title: 'x' },
          { buyer_wallet: SELLER, quantity: 1 },
          { chainId: 31337 },
          { chain_id: 31337 },
          { escrow_address: '0x0000000000000000000000000000000000000001' },
        ]) {
          const spoofRes = await listingsRoute.POST(
            makeJsonRequest('/api/listings', { method: 'POST', cookie, body: payload })
          );
          assert.equal(spoofRes.status, 400);
          assert.equal((await spoofRes.json()).error_code, 'SPOOFED_IDENTITY_FORBIDDEN');
        }

        const spoofSyncRes = await tradeSyncRoute.POST(
          makeJsonRequest('/api/trades/7/sync', {
            method: 'POST',
            cookie,
            body: { actor_wallet: SELLER },
          }),
          ctxId('7')
        );
        assert.equal(spoofSyncRes.status, 400);
        assert.equal((await spoofSyncRes.json()).error_code, 'SPOOFED_IDENTITY_FORBIDDEN');

        // Path traversal / invalid IDs blocked before fetch
        assert.equal(
          (await listingByIdRoute.GET(makeJsonRequest('/api/listings/bad'), ctxId('../admin'))).status,
          400
        );
        assert.equal(
          (await tradeContextRoute.GET(makeJsonRequest('/api/trades/0/context'), ctxId('0'))).status,
          400
        );
        assert.equal(
          (
            await tradeSyncRoute.POST(
              makeJsonRequest('/api/trades/abc/sync', { method: 'POST', cookie, body: {} }),
              ctxId('abc')
            )
          ).status,
          400
        );

        // Invalid Idempotency-Key header -> 400
        assert.equal(
          (
            await listingRequestsRoute.POST(
              makeJsonRequest('/api/listings/lst_01/requests', {
                method: 'POST',
                cookie,
                body: { quantity: 1 },
                idempotencyKey: 'bad key with spaces!!',
              }),
              ctxId('lst_01')
            )
          ).status,
          400
        );

        assert.equal(fetchCalled, false, 'Backend fetch must never be called when rejected by BFF');
      } finally {
        global.fetch = origFetch;
      }
    }
  );
});

test('Authenticated BFF routes sign upstream requests, inject seller on /mine, strip unknown fields, and forward Idempotency-Key', async () => {
  const origFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init, parsedBody: init.body ? JSON.parse(init.body) : undefined });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await withEnv(
    {
      BACKEND_URL: 'http://backend.local:8000',
      ATTEST_API_KEY: TEST_API_KEY,
      NEXT_PUBLIC_CHAIN_ID: '43113',
      REQUIRE_PROXY_SIGNATURE: 'true',
    },
    async () => {
      try {
        const sellerCookie = makeCookieHeader(SELLER, 43113);
        const buyerCookie = makeCookieHeader(BUYER, 43113);

        // 1. GET /api/listings/mine ignores spoofed ?seller=0xBuyer and uses session address + status=ALL default
        const mineRes = await myListingsRoute.GET(
          makeJsonRequest(`/api/listings/mine?seller=${BUYER}&page=2`, { cookie: sellerCookie })
        );
        assert.equal(mineRes.status, 200);
        const mineUrl = new URL(calls[0].url);
        assert.equal(mineUrl.pathname, '/listings');
        assert.equal(mineUrl.searchParams.get('seller'), SELLER.toLowerCase());
        assert.equal(mineUrl.searchParams.get('status'), 'ALL');
        assert.equal(mineUrl.searchParams.get('page'), '2');

        // 2. POST /api/listings strips unknown fields and signs HMAC for path /listings
        const createRes = await listingsRoute.POST(
          makeJsonRequest('/api/listings', {
            method: 'POST',
            cookie: sellerCookie,
            idempotencyKey: 'idem-create-001',
            body: {
              sku: 'LEGO-10182',
              category: 'LEGO',
              title: 'Cafe Corner',
              description: 'Sealed box',
              price_wei: '2500000000000000000',
              condition: 'SEALED_NEW',
              quantity_total: 2,
              images: [{ uri: 'ipfs://Qm123', is_primary: true }],
              unexpected_admin_flag: true,
            },
          })
        );
        assert.equal(createRes.status, 200);
        assert.equal(calls[1].parsedBody.unexpected_admin_flag, undefined);
        assert.equal(calls[1].parsedBody.sku, 'LEGO-10182');
        assert.equal(calls[1].init.headers['Idempotency-Key'], 'idem-create-001');
        assert.equal(calls[1].init.headers['X-Authenticated-Wallet'], SELLER.toLowerCase());
        assert.equal(calls[1].init.headers['X-Authenticated-Chain-Id'], '43113');
        const expectedSig = computeProxySignature(
          TEST_API_KEY,
          'POST',
          '/listings',
          SELLER.toLowerCase(),
          43113,
          calls[1].init.headers['X-Auth-Timestamp'],
          calls[1].init.headers['X-Auth-Nonce']
        );
        assert.equal(calls[1].init.headers['X-Auth-Signature'], expectedSig);

        // 3. Cancel without body succeeds (allowEmptyBody: true) + bind-trade & sync work cleanly
        assert.equal(
          (
            await requestCancelRoute.POST(
              makeJsonRequest('/api/requests/req_123/cancel', {
                method: 'POST',
                cookie: buyerCookie,
                body: '',
              }),
              ctxId('req_123')
            )
          ).status,
          200
        );
        assert.equal(calls[2].url, 'http://backend.local:8000/requests/req_123/cancel');

        assert.equal(
          (
            await requestBindTradeRoute.POST(
              makeJsonRequest('/api/requests/req_123/bind-trade', {
                method: 'POST',
                cookie: sellerCookie,
                idempotencyKey: 'idem-bind-1',
                body: { tx_hash: `0x${'a'.repeat(64)}`, trade_id: 9, evil: 1 },
              }),
              ctxId('req_123')
            )
          ).status,
          200
        );
        assert.deepEqual(calls[3].parsedBody, { tx_hash: `0x${'a'.repeat(64)}`, trade_id: 9 });

        assert.equal(
          (
            await tradeSyncRoute.POST(
              makeJsonRequest('/api/trades/9/sync', {
                method: 'POST',
                cookie: sellerCookie,
                body: { ignored_field: 'stripped' },
              }),
              ctxId('9')
            )
          ).status,
          200
        );
        assert.deepEqual(calls[4].parsedBody, {});
      } finally {
        global.fetch = origFetch;
      }
    }
  );
});

test('marketplace.ts AVAX/wei BigInt helpers preserve exact precision without float loss', () => {
  // > 9.22 AVAX (exceeds JS Number.MAX_SAFE_INTEGER in wei = 9.007e18)
  const weiStr = marketplaceClient.avaxInputToWeiString('12.345678901234567890');
  assert.equal(weiStr, '12345678901234567890');
  assert.equal(marketplaceClient.weiToAvaxString(weiStr, 18), '12.34567890123456789');
  assert.equal(marketplaceClient.weiToAvaxString('1000000000000000000000000', 2), '1,000,000');

  assert.equal(marketplaceClient.computeTotalValueWeiString('1500000000000000000', 3), '4500000000000000000');
  assert.equal(marketplaceClient.computeDepositWeiString('1000000000000000000'), '300000000000000000');
  assert.equal(marketplaceClient.computeDepositWeiString('1000000000000000001'), '300000000000000000');

  assert.throws(() => marketplaceClient.avaxInputToWeiString('0'));
  assert.throws(() => marketplaceClient.avaxInputToWeiString('-1.5'));
  assert.throws(() => marketplaceClient.parseWeiString('1.5'));
});

test('marketplace.ts normalizes 401/403/409/502/503 and MKT-002 error codes cleanly', async () => {
  for (const code of [
    'CHAIN_UNVERIFIED_CANNOT_RELEASE',
    'ONCHAIN_TRADE_ALREADY_EXISTS',
    'INSUFFICIENT_STOCK_AFTER_EXPIRY',
    'OUT_OF_STOCK_OR_RESERVED',
  ]) {
    const err = marketplaceClient.normalizeMarketplaceErrorResponse(409, {
      error_code: code,
      detail: 'raw upstream message',
    });
    assert.ok(err instanceof marketplaceClient.MarketplaceApiError);
    assert.equal(err.status, 409);
    assert.equal(err.errorCode, code);
    assert.ok(err.message.length > 10);
  }

  for (const status of [401, 403, 409, 502, 503]) {
    const err = marketplaceClient.normalizeMarketplaceErrorResponse(status, {});
    assert.equal(err.status, status);
    assert.equal(err.errorCode, `HTTP_${status}`);
    assert.ok(err.message.length > 10);
  }

  // Client API helper forwards Idempotency-Key & throws MarketplaceApiError on error
  const origFetch = global.fetch;
  let lastReq = null;
  try {
    global.fetch = async (url, init) => {
      lastReq = { url, init };
      return new Response(
        JSON.stringify({
          error_code: 'OUT_OF_STOCK_OR_RESERVED',
          message: 'out of stock',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    };

    await assert.rejects(
      () =>
        marketplaceClient.createPurchaseRequest(
          'lst_01',
          { quantity: 1, buyer_note: 'please ship safely' },
          { idempotencyKey: 'ui-retry-007' }
        ),
      (err) => err instanceof marketplaceClient.MarketplaceApiError && err.errorCode === 'OUT_OF_STOCK_OR_RESERVED'
    );
    assert.equal(lastReq.url, '/api/listings/lst_01/requests');
    assert.equal(lastReq.init.headers['Idempotency-Key'], 'ui-retry-007');
  } finally {
    global.fetch = origFetch;
  }
});
