'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');

const FRONTEND_ROOT = path.resolve(__dirname, '..');

function registerTsLoader() {
  const origResolve = Module._resolveFilename;
  if (!Module._resolveFilename.__secRemTsPatched) {
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
    Module._resolveFilename.__secRemTsPatched = true;
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
  SESSION_COOKIE_NAME,
  SessionConfigError,
  getSecretKey,
  createSessionToken,
  verifySessionToken,
  verifySessionFromRequest,
} = require('@/lib/auth-session');
const { buildAuthChallengeMessage } = require('@/lib/auth-challenge');
const sessionRoute = require('@/app/api/auth/session/route');
const verifyRoute = require('@/app/api/verify/route');
const urisRoute = require('@/app/api/uris/route');

const LEGACY_SECRET = 'escrow-marketplace-fuji-session-secret-2026';
const WALLET_A = '0x1111111111111111111111111111111111111111';

async function withEnv(vars, fn) {
  const keys = ['SESSION_SECRET', 'ATTEST_API_KEY', 'CHAIN_ID', 'NEXT_PUBLIC_CHAIN_ID', 'BACKEND_URL'];
  const backup = {};
  for (const k of keys) {
    backup[k] = process.env[k];
  }
  try {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined || v === null) {
        delete process.env[k];
      } else {
        process.env[k] = String(v);
      }
    }
    return await fn();
  } finally {
    for (const k of keys) {
      if (backup[k] === undefined) delete process.env[k];
      else process.env[k] = backup[k];
    }
  }
}

function forgeTokenWithSecret(address, chainId, secret) {
  const now = Date.now();
  const payload = { address, chainId, iat: now, exp: now + 60_000 };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${hmac}`;
}

test('SEC-01: fails closed on Fuji 43113 and non-31337 when session secret is missing or legacy default', async () => {
  await withEnv(
    { SESSION_SECRET: undefined, ATTEST_API_KEY: undefined, CHAIN_ID: '43113', NEXT_PUBLIC_CHAIN_ID: '43113' },
    () => {
      assert.throws(() => getSecretKey(43113), SessionConfigError);
      assert.throws(() => createSessionToken(WALLET_A, 43113), SessionConfigError);
      assert.throws(() => getSecretKey(43114), SessionConfigError);

      // Token signed with old legacy public secret must NEVER be accepted
      const legacyToken = forgeTokenWithSecret(WALLET_A, 43113, LEGACY_SECRET);
      assert.strictEqual(verifySessionToken(legacyToken), null);

      const req = new Request('http://127.0.0.1:3000/api/listings/mine', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${legacyToken}` },
      });
      assert.strictEqual(verifySessionFromRequest(req), null);
    }
  );

  // Even if someone explicitly puts LEGACY_SECRET into env on Fuji, reject it
  await withEnv(
    { SESSION_SECRET: LEGACY_SECRET, ATTEST_API_KEY: undefined, CHAIN_ID: '43113' },
    () => {
      assert.throws(() => getSecretKey(43113), SessionConfigError);
      assert.throws(() => createSessionToken(WALLET_A, 43113), SessionConfigError);
    }
  );
});

test('SEC-01: prioritizes SESSION_SECRET independently of ATTEST_API_KEY and enforces valid vs invalid tokens', async () => {
  const independentSessionSecret = 'independent-session-secret-0123456789abcdef';
  const backendApiKey = 'backend-attest-api-key-only-9876543210';

  await withEnv(
    { SESSION_SECRET: independentSessionSecret, ATTEST_API_KEY: backendApiKey, CHAIN_ID: '43113' },
    () => {
      assert.strictEqual(getSecretKey(43113), independentSessionSecret);

      // Token minted with SESSION_SECRET is accepted
      const validToken = createSessionToken(WALLET_A, 43113);
      const decoded = verifySessionToken(validToken);
      assert.ok(decoded);
      assert.strictEqual(decoded.address, WALLET_A);
      assert.strictEqual(decoded.chainId, 43113);

      // Token forged using ATTEST_API_KEY must be rejected because SESSION_SECRET takes priority
      const apiKeyForged = forgeTokenWithSecret(WALLET_A, 43113, backendApiKey);
      assert.strictEqual(verifySessionToken(apiKeyForged), null);

      // Token forged with wrong/tampered signature is rejected
      assert.strictEqual(verifySessionToken(`${validToken}x`), null);
    }
  );
});

test('SEC-01: keeps local Anvil 31337 compatibility while still rejecting legacy public secret', async () => {
  await withEnv(
    { SESSION_SECRET: undefined, ATTEST_API_KEY: undefined, CHAIN_ID: '31337', NEXT_PUBLIC_CHAIN_ID: '31337' },
    () => {
      const token = createSessionToken(WALLET_A, 31337);
      const decoded = verifySessionToken(token);
      assert.ok(decoded);
      assert.strictEqual(decoded.chainId, 31337);

      // Legacy hardcoded secret must STILL be rejected on 31337
      const legacyAnvil = forgeTokenWithSecret(WALLET_A, 31337, LEGACY_SECRET);
      assert.strictEqual(verifySessionToken(legacyAnvil), null);

      // Requesting Fuji 43113 session while missing secret must still fail closed
      assert.throws(() => createSessionToken(WALLET_A, 43113), SessionConfigError);
    }
  );
});

test('SEC-01: POST /api/auth/session returns 503 SESSION_MISCONFIGURED when secret missing on Fuji 43113', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const getRes = await sessionRoute.GET(new Request('http://127.0.0.1:3000/api/auth/session'));
  const { nonce } = await getRes.json();
  const msg = buildAuthChallengeMessage(account.address, nonce, 43113);
  const signature = await account.signMessage({ message: msg });

  await withEnv(
    { SESSION_SECRET: undefined, ATTEST_API_KEY: undefined, CHAIN_ID: '43113', NEXT_PUBLIC_CHAIN_ID: '43113' },
    async () => {
      const postRes = await sessionRoute.POST(
        new Request('http://127.0.0.1:3000/api/auth/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            address: account.address,
            chainId: 43113,
            nonce,
            signature,
          }),
        })
      );
      assert.strictEqual(postRes.status, 503);
      const body = await postRes.json();
      assert.strictEqual(body.error_code, 'SESSION_MISCONFIGURED');
    }
  );
});

test('SEC-03: /api/verify and /api/uris block foreign Origin, cross-site, Referer mismatch, and form content-types, and allow valid same-origin requests', async () => {
  await withEnv(
    {
      SESSION_SECRET: 'sec03-session-secret-0123456789abcdef',
      ATTEST_API_KEY: 'sec03-backend-api-key-0123456789abcdef',
      CHAIN_ID: '43113',
      BACKEND_URL: 'http://127.0.0.1:8000',
    },
    async () => {
      const token = createSessionToken(WALLET_A, 43113);
      const validCookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
      const verifyBody = JSON.stringify({
        trade_id: 1,
        listing_image_url: 'ipfs://QmListing',
        seller_evidence_url: 'ipfs://QmSeller',
        buyer_evidence_url: 'ipfs://QmBuyer',
      });
      const urisBody = JSON.stringify({
        trade_id: 1,
        role: 'listing',
        uri: 'ipfs://QmListing',
        signature: '0x1234',
      });

      const endpoints = [
        { name: '/api/verify', url: 'http://127.0.0.1:3000/api/verify', handler: verifyRoute.POST, body: verifyBody },
        { name: '/api/uris', url: 'http://127.0.0.1:3000/api/uris', handler: urisRoute.POST, body: urisBody },
      ];

      for (const ep of endpoints) {
        // 1. Foreign Origin -> 403 CSRF_REJECTED
        const rForeign = await ep.handler(
          new Request(ep.url, {
            method: 'POST',
            headers: {
              origin: 'https://evil.example',
              'sec-fetch-site': 'same-origin',
              'content-type': 'application/json',
              cookie: validCookie,
            },
            body: ep.body,
          })
        );
        assert.strictEqual(rForeign.status, 403, `${ep.name} foreign Origin should return 403`);
        assert.strictEqual((await rForeign.json()).error_code, 'CSRF_REJECTED');

        // 2. Cross-site Sec-Fetch-Site -> 403 CSRF_REJECTED
        const rCrossSite = await ep.handler(
          new Request(ep.url, {
            method: 'POST',
            headers: {
              origin: 'http://127.0.0.1:3000',
              'sec-fetch-site': 'cross-site',
              'content-type': 'application/json',
              cookie: validCookie,
            },
            body: ep.body,
          })
        );
        assert.strictEqual(rCrossSite.status, 403, `${ep.name} cross-site should return 403`);
        assert.strictEqual((await rCrossSite.json()).error_code, 'CSRF_REJECTED');

        // 3. Mismatched Referer (when Origin absent) -> 403 CSRF_REJECTED
        const rBadRef = await ep.handler(
          new Request(ep.url, {
            method: 'POST',
            headers: {
              referer: 'https://attacker.test/phish',
              'content-type': 'application/json',
              cookie: validCookie,
            },
            body: ep.body,
          })
        );
        assert.strictEqual(rBadRef.status, 403, `${ep.name} foreign Referer should return 403`);

        // 4. Form / text content-type -> 415 UNSUPPORTED_MEDIA_TYPE
        const rText = await ep.handler(
          new Request(ep.url, {
            method: 'POST',
            headers: {
              origin: 'http://127.0.0.1:3000',
              'sec-fetch-site': 'same-origin',
              'content-type': 'text/plain',
              cookie: validCookie,
            },
            body: ep.body,
          })
        );
        assert.strictEqual(rText.status, 415, `${ep.name} text/plain should return 415`);
      }

      // 5. Same-origin JSON with valid session passes CSRF + auth and forwards upstream cleanly
      const origFetch = global.fetch;
      const seen = [];
      global.fetch = async (url, init) => {
        seen.push({ url: String(url), headers: init.headers });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };
      try {
        for (const ep of endpoints) {
          const rOk = await ep.handler(
            new Request(ep.url, {
              method: 'POST',
              headers: {
                origin: 'http://127.0.0.1:3000',
                'sec-fetch-site': 'same-origin',
                'content-type': 'application/json',
                cookie: validCookie,
              },
              body: ep.body,
            })
          );
          assert.strictEqual(rOk.status, 200, `${ep.name} same-origin valid request should pass`);
        }
        assert.strictEqual(seen.length, 2);
        assert.strictEqual(seen[0].headers['X-API-Key'], 'sec03-backend-api-key-0123456789abcdef');
        assert.strictEqual(seen[1].headers['X-API-Key'], 'sec03-backend-api-key-0123456789abcdef');
      } finally {
        global.fetch = origFetch;
      }
    }
  );
});
