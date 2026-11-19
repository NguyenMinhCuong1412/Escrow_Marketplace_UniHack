'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');

const FRONTEND_ROOT = path.resolve(__dirname, '..');

function registerTsLoader() {
  const origResolve = Module._resolveFilename;
  if (!Module._resolveFilename.__phase2TsPatched) {
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
    Module._resolveFilename.__phase2TsPatched = true;
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
const sessionRoute = require('@/app/api/auth/session/route');
const pinRoute = require('@/app/api/pin/route');
const listingsRoute = require('@/app/api/listings/route');
const verifyRoute = require('@/app/api/verify/route');
const urisRoute = require('@/app/api/uris/route');

const SAMPLE_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

async function withEnv(vars, fn) {
  const keys = [
    'SHARED_API_URL',
    'BFF_AUTH_MODE',
    'BACKEND_URL',
    'NEXT_PUBLIC_BACKEND_URL',
    'ATTEST_API_KEY',
    'SESSION_SECRET',
    'PINATA_JWT',
    'CHAIN_ID',
    'NEXT_PUBLIC_CHAIN_ID',
  ];
  const backup = {};
  for (const k of keys) backup[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined || v === null) delete process.env[k];
      else process.env[k] = String(v);
    }
    return await fn();
  } finally {
    for (const k of keys) {
      if (backup[k] === undefined) delete process.env[k];
      else process.env[k] = backup[k];
    }
  }
}

test('Phase 2 Shared Mode: auth handshake stores opsToken only inside HttpOnly cookie and never leaks secrets', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const sharedEnv = {
    SHARED_API_URL: 'https://ops.marketplace.test',
    BFF_AUTH_MODE: 'shared',
    BACKEND_URL: undefined,
    ATTEST_API_KEY: undefined,
    SESSION_SECRET: undefined,
    PINATA_JWT: undefined,
    CHAIN_ID: '43113',
    NEXT_PUBLIC_CHAIN_ID: '43113',
  };

  await withEnv(sharedEnv, async () => {
    const origFetch = global.fetch;
    const calls = [];
    global.fetch = async (url, init) => {
      calls.push({ url: String(url), method: init?.method, headers: init?.headers, body: init?.body });
      if (String(url).endsWith('/auth/challenge')) {
        const reqBody = JSON.parse(init.body);
        assert.strictEqual(reqBody.address, account.address);
        assert.strictEqual(reqBody.chain_id, 43113);
        return new Response(
          JSON.stringify({
            nonce: '0123456789abcdef0123456789abcdef',
            message: `Escrow Marketplace Challenge\nWallet: ${account.address}\nDomain: ${reqBody.domain}\nNonce: 0123456789abcdef0123456789abcdef`,
            challenge_token: 'ops.challenge.jwt',
            domain: reqBody.domain,
            expires_at: Math.floor(Date.now() / 1000) + 300,
            chain_id: 43113,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (String(url).endsWith('/auth/verify')) {
        return new Response(
          JSON.stringify({
            ok: true,
            ops_token: 'header.payload.ops_jwt_secret_token',
            token_type: 'Bearer',
            address: account.address,
            chain_id: 43113,
            domain: 'http://127.0.0.1:3000',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (String(url).includes('/listings')) {
        return new Response(JSON.stringify({ id: 'lst-shared-1' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (String(url).endsWith('/pin')) {
        return new Response(
          JSON.stringify({
            cid: 'QmSharedRelayTest1234567890',
            uri: 'ipfs://QmSharedRelayTest1234567890',
            mock: false,
            mime_type: 'image/png',
            size: SAMPLE_PNG.length,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (String(url).endsWith('/verify-evidence') || String(url).endsWith('/uris')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    };

    try {
      // Passive status check returns false without calling backend
      const passiveRes = await sessionRoute.GET(new Request('http://127.0.0.1:3000/api/auth/session'));
      assert.strictEqual(passiveRes.status, 200);
      assert.strictEqual((await passiveRes.json()).authenticated, false);
      assert.strictEqual(calls.length, 0);

      // Address challenge call delegates to SHARED_API_URL/auth/challenge
      const chRes = await sessionRoute.GET(
        new Request(`http://127.0.0.1:3000/api/auth/session?address=${account.address}&chainId=43113`)
      );
      assert.strictEqual(chRes.status, 200);
      const chJson = await chRes.json();
      assert.strictEqual(chJson.challengeToken, 'ops.challenge.jwt');
      assert.ok(chJson.message.includes(account.address));

      // Sign challenge & verify -> sets HttpOnly cookie, hides ops_token from JSON response!
      const sig = await account.signMessage({ message: chJson.message });
      const vrRes = await sessionRoute.POST(
        new Request('http://127.0.0.1:3000/api/auth/session', {
          method: 'POST',
          headers: { origin: 'http://127.0.0.1:3000', 'content-type': 'application/json' },
          body: JSON.stringify({
            address: account.address,
            chainId: 43113,
            nonce: chJson.nonce,
            signature: sig,
            challengeToken: chJson.challengeToken,
          }),
        })
      );
      assert.strictEqual(vrRes.status, 200);
      const vrJson = await vrRes.json();
      assert.strictEqual(vrJson.authenticated, true);
      assert.strictEqual(vrJson.ops_token, undefined);
      assert.strictEqual(vrJson.opsToken, undefined);

      const setCookie = vrRes.headers.get('set-cookie') || '';
      assert.ok(setCookie.includes(`${SESSION_COOKIE_NAME}=`));
      assert.ok(/httponly/i.test(setCookie));
      const cookiePair = setCookie.split(';')[0];

      // Authenticated BFF mutation forwards Authorization: Bearer <ops_token>
      const createRes = await listingsRoute.POST(
        new Request('http://127.0.0.1:3000/api/listings', {
          method: 'POST',
          headers: {
            origin: 'http://127.0.0.1:3000',
            'sec-fetch-site': 'same-origin',
            'content-type': 'application/json',
            cookie: cookiePair,
          },
          body: JSON.stringify({
            sku: 'SHR-001',
            category: 'Other',
            title: 'Shared Auth Item',
            description: 'Forwarded via Bearer JWT',
            price_wei: '1000000000000000000',
            condition: 'Mint',
            quantity_total: 1,
            images: ['ipfs://QmSharedRelayTest1234567890'],
          }),
        })
      );
      assert.strictEqual(createRes.status, 201);
      const createCall = calls.find((c) => c.url === 'https://ops.marketplace.test/listings');
      assert.ok(createCall);
      assert.strictEqual(createCall.headers.Authorization, 'Bearer header.payload.ops_jwt_secret_token');
      assert.strictEqual(createCall.headers['X-API-Key'], undefined);

      // /api/pin forwards to SHARED_API_URL/pin with Bearer JWT without local PINATA_JWT!
      const fd = new FormData();
      fd.append('file', new Blob([SAMPLE_PNG], { type: 'image/png' }), 'item.png');
      const pinRes = await pinRoute.POST(
        new Request('http://127.0.0.1:3000/api/pin', {
          method: 'POST',
          headers: {
            origin: 'http://127.0.0.1:3000',
            'sec-fetch-site': 'same-origin',
            cookie: cookiePair,
          },
          body: fd,
        })
      );
      assert.strictEqual(pinRes.status, 200);
      const pinJson = await pinRes.json();
      assert.strictEqual(pinJson.cid, 'QmSharedRelayTest1234567890');
      const pinCall = calls.find((c) => c.url === 'https://ops.marketplace.test/pin');
      assert.ok(pinCall);
      assert.strictEqual(pinCall.headers.Authorization, 'Bearer header.payload.ops_jwt_secret_token');

      // /api/verify & /api/uris forward Bearer JWT cleanly without ATTEST_API_KEY
      const verifyRes = await verifyRoute.POST(
        new Request('http://127.0.0.1:3000/api/verify', {
          method: 'POST',
          headers: {
            origin: 'http://127.0.0.1:3000',
            'sec-fetch-site': 'same-origin',
            'content-type': 'application/json',
            cookie: cookiePair,
          },
          body: JSON.stringify({
            trade_id: 1,
            listing_image_url: 'ipfs://QmL',
            seller_evidence_url: 'ipfs://QmS',
            buyer_evidence_url: 'ipfs://QmB',
          }),
        })
      );
      assert.strictEqual(verifyRes.status, 200);
      const verifyCall = calls.find((c) => c.url === 'https://ops.marketplace.test/verify-evidence');
      assert.ok(verifyCall);
      assert.strictEqual(verifyCall.headers.Authorization, 'Bearer header.payload.ops_jwt_secret_token');

      const urisRes = await urisRoute.POST(
        new Request('http://127.0.0.1:3000/api/uris', {
          method: 'POST',
          headers: {
            origin: 'http://127.0.0.1:3000',
            'sec-fetch-site': 'same-origin',
            'content-type': 'application/json',
            cookie: cookiePair,
          },
          body: JSON.stringify({
            trade_id: 1,
            role: 'buyer',
            uri: 'ipfs://QmB',
          }),
        })
      );
      assert.strictEqual(urisRes.status, 200);
      const urisCall = calls.find((c) => c.url === 'https://ops.marketplace.test/trade/1/uris');
      assert.ok(urisCall);
      assert.strictEqual(urisCall.headers.Authorization, 'Bearer header.payload.ops_jwt_secret_token');
    } finally {
      global.fetch = origFetch;
    }
  });
});

test('Phase 2 BFF /api/listings passes through ETag, If-None-Match, and 304 Not Modified cleanly', async () => {
  const wallet = privateKeyToAccount(generatePrivateKey()).address;
  await withEnv(
    {
      SHARED_API_URL: 'https://ops.marketplace.test',
      BFF_AUTH_MODE: 'shared',
      CHAIN_ID: '43113',
      SESSION_SECRET: undefined,
    },
    async () => {
      const origFetch = global.fetch;
      const seenHeaders = [];
      let callNum = 0;
      global.fetch = async (url, init) => {
        callNum += 1;
        seenHeaders.push(init?.headers || {});
        if (callNum === 1) {
          return new Response(JSON.stringify({ items: [], total: 0, page: 1, limit: 20, total_pages: 0 }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              etag: '"v1-abcdef123456"',
              'cache-control': 'no-cache',
              vary: 'Origin',
            },
          });
        }
        return new Response(null, {
          status: 304,
          headers: {
            etag: '"v1-abcdef123456"',
            'cache-control': 'no-cache',
            vary: 'Origin',
          },
        });
      };

      try {
        const res1 = await listingsRoute.GET(new Request('http://127.0.0.1:3000/api/listings?page=1'));
        assert.strictEqual(res1.status, 200);
        assert.strictEqual(res1.headers.get('etag'), '"v1-abcdef123456"');
        assert.strictEqual(res1.headers.get('cache-control'), 'no-cache');

        // Also test with signed Shared session cookie -> Bearer token forwarded
        const token = createSessionToken(wallet, 43113, 'ops.jwt.sample');
        const res2 = await listingsRoute.GET(
          new Request('http://127.0.0.1:3000/api/listings?page=1', {
            headers: {
              'if-none-match': '"v1-abcdef123456"',
              cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
            },
          })
        );
        assert.strictEqual(res2.status, 304);
        assert.strictEqual(res2.headers.get('etag'), '"v1-abcdef123456"');
        assert.strictEqual(seenHeaders[1]['If-None-Match'], '"v1-abcdef123456"');
        assert.strictEqual(seenHeaders[1].Authorization, 'Bearer ops.jwt.sample');
      } finally {
        global.fetch = origFetch;
      }
    }
  );
});
