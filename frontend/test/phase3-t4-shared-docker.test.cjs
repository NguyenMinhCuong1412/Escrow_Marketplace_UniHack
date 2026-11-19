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
  if (!Module._resolveFilename.__phase3T4Patched) {
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
    Module._resolveFilename.__phase3T4Patched = true;
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
const listingsRoute = require('@/app/api/listings/route');
const tradesIndexRoute = require('@/app/api/trades/index/route');
const backendProxyRoute = require('@/app/api/backend-proxy/[...path]/route');
const marketplace = require('@/lib/marketplace');

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
    'TRUST_PROXY_HEADERS',
    'TRUST_PROXY_FORWARDED_FOR',
    'COOKIE_SECURE',
    'ALLOWED_ORIGINS',
    'CODESPACE_NAME',
    'NODE_ENV',
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

test('TC-T4-FE-01: Pre-Phase-4 Shared Mode fails with explicit 503 SHARED_BACKEND_UNCONFIGURED and never falls back to localhost or /_backend', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const sessionSecret = 't4-client-session-secret-0123456789abcdef';

  await withEnv(
    {
      BFF_AUTH_MODE: 'shared',
      SHARED_API_URL: '',
      BACKEND_URL: 'http://backend:8000',
      NEXT_PUBLIC_BACKEND_URL: '/_backend',
      SESSION_SECRET: sessionSecret,
      ATTEST_API_KEY: undefined,
      CHAIN_ID: '43113',
      NEXT_PUBLIC_CHAIN_ID: '43113',
    },
    async () => {
      const origFetch = global.fetch;
      let upstreamCalls = 0;
      global.fetch = async () => {
        upstreamCalls += 1;
        throw new Error('Must never invoke fetch when SHARED_API_URL is unconfigured');
      };
      try {
        // Passive auth check remains 200 and indicates sharedBackendConfigured=false
        const passive = await sessionRoute.GET(new Request('http://127.0.0.1:3000/api/auth/session'));
        assert.equal(passive.status, 200);
        const passiveJson = await passive.json();
        assert.equal(passiveJson.authenticated, false);
        assert.equal(passiveJson.mode, 'shared');
        assert.equal(passiveJson.sharedBackendConfigured, false);

        // Challenge & Verify fail explicitly with 503 SHARED_BACKEND_UNCONFIGURED
        const ch = await sessionRoute.GET(
          new Request(`http://127.0.0.1:3000/api/auth/session?address=${account.address}&chainId=43113`)
        );
        assert.equal(ch.status, 503);
        const chJson = await ch.json();
        assert.equal(chJson.error_code, 'SHARED_BACKEND_UNCONFIGURED');

        const vr = await sessionRoute.POST(
          new Request('http://127.0.0.1:3000/api/auth/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3000' },
            body: JSON.stringify({
              address: account.address,
              chainId: 43113,
              nonce: 'n',
              signature: '0x1234',
              challengeToken: 'tok',
            }),
          })
        );
        assert.equal(vr.status, 503);
        assert.equal((await vr.json()).error_code, 'SHARED_BACKEND_UNCONFIGURED');

        // Marketplace browse fails explicitly with 503 SHARED_BACKEND_UNCONFIGURED
        const listRes = await listingsRoute.GET(new Request('http://127.0.0.1:3000/api/listings'));
        assert.equal(listRes.status, 503);
        const listJson = await listRes.json();
        assert.equal(listJson.error_code, 'SHARED_BACKEND_UNCONFIGURED');

        // Frontend error normalization provides actionable message
        const normalized = marketplace.normalizeMarketplaceErrorResponse(listRes.status, listJson);
        assert.equal(normalized.errorCode, 'SHARED_BACKEND_UNCONFIGURED');
        assert.match(normalized.message, /SHARED_API_URL/);

        // Authenticated Trade Index also fails cleanly without hitting localhost
        const tok = createSessionToken(account.address, 43113, 'ops.jwt.token');
        const idxRes = await tradesIndexRoute.GET(
          new Request('http://127.0.0.1:3000/api/trades/index', {
            headers: { cookie: `${SESSION_COOKIE_NAME}=${tok}` },
          })
        );
        assert.equal(idxRes.status, 503);
        assert.equal((await idxRes.json()).error_code, 'SHARED_BACKEND_UNCONFIGURED');

        // /_backend/health also returns 503 SHARED_BACKEND_UNCONFIGURED
        const proxyRes = await backendProxyRoute.GET(
          new Request('http://127.0.0.1:3000/_backend/health'),
          { params: Promise.resolve({ path: ['health'] }) }
        );
        assert.equal(proxyRes.status, 503);
        assert.equal((await proxyRes.json()).error_code, 'SHARED_BACKEND_UNCONFIGURED');

        // Malformed SHARED_API_URL returns 503 SHARED_BACKEND_INVALID_URL
        process.env.SHARED_API_URL = '/relative-not-allowed';
        const badRes = await listingsRoute.GET(new Request('http://127.0.0.1:3000/api/listings'));
        assert.equal(badRes.status, 503);
        assert.equal((await badRes.json()).error_code, 'SHARED_BACKEND_INVALID_URL');

        assert.equal(upstreamCalls, 0);
      } finally {
        global.fetch = origFetch;
      }
    }
  );
});

test('TC-T4-FE-02: /_backend/[...path] runtime proxy enforces strict 5-route GET whitelist and switches SHARED_API_URL at runtime without rebuild', async () => {
  await withEnv(
    {
      BFF_AUTH_MODE: 'shared',
      SHARED_API_URL: 'https://ops-alpha.example.com',
      NEXT_PUBLIC_BACKEND_URL: '/_backend',
    },
    async () => {
      const origFetch = global.fetch;
      const calls = [];
      global.fetch = async (url, init) => {
        const u = String(url);
        calls.push({ url: u, method: init?.method });
        if (u.endsWith('/nonce-qr.png?size=640')) {
          return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), {
            status: 200,
            headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' },
          });
        }
        return new Response(JSON.stringify({ ok: true, target: u }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };

      try {
        const rHealth = await backendProxyRoute.GET(
          new Request('http://127.0.0.1:3000/_backend/health'),
          { params: Promise.resolve({ path: ['health'] }) }
        );
        assert.equal(rHealth.status, 200);
        assert.equal((await rHealth.json()).target, 'https://ops-alpha.example.com/health');

        // Runtime switch WITHOUT reloading modules
        process.env.SHARED_API_URL = 'https://ops-beta.example.com';

        const rReport = await backendProxyRoute.GET(
          new Request('http://127.0.0.1:3000/_backend/report/42'),
          { params: Promise.resolve({ path: ['report', '42'] }) }
        );
        assert.equal(rReport.status, 200);
        assert.equal((await rReport.json()).target, 'https://ops-beta.example.com/report/42');

        const rAgent = await backendProxyRoute.GET(
          new Request('http://127.0.0.1:3000/_backend/agent/status/42'),
          { params: Promise.resolve({ path: ['agent', 'status', '42'] }) }
        );
        assert.equal(rAgent.status, 200);
        assert.equal((await rAgent.json()).target, 'https://ops-beta.example.com/agent/status/42');

        const rUris = await backendProxyRoute.GET(
          new Request('http://127.0.0.1:3000/_backend/trade/42/uris'),
          { params: Promise.resolve({ path: ['trade', '42', 'uris'] }) }
        );
        assert.equal(rUris.status, 200);
        assert.equal((await rUris.json()).target, 'https://ops-beta.example.com/trade/42/uris');

        const rQr = await backendProxyRoute.GET(
          new Request('http://127.0.0.1:3000/_backend/trade/42/nonce-qr.png?size=640'),
          { params: Promise.resolve({ path: ['trade', '42', 'nonce-qr.png'] }) }
        );
        assert.equal(rQr.status, 200);
        assert.equal(rQr.headers.get('content-type'), 'image/png');
        const qrBuf = new Uint8Array(await rQr.arrayBuffer());
        assert.deepEqual(Array.from(qrBuf.slice(0, 4)), [0x89, 0x50, 0x4e, 0x47]);

        // Disallowed paths & traversal blocked cleanly BEFORE upstream fetch
        const beforeBlockedCount = calls.length;
        for (const badSegments of [
          ['listings'],
          ['verify-evidence'],
          ['pin'],
          ['auth', 'session'],
          ['report', 'abc'],
          ['report', '1', 'extra'],
          ['..', 'health'],
          ['trade', '1', 'nonce-qr.png', 'extra'],
        ]) {
          const rBad = await backendProxyRoute.GET(
            new Request('http://127.0.0.1:3000/_backend/' + badSegments.join('/')),
            { params: Promise.resolve({ path: badSegments }) }
          );
          assert.equal(rBad.status, 404);
        }

        // Non-GET methods rejected with 405
        const rPost = await backendProxyRoute.POST();
        assert.equal(rPost.status, 405);
        assert.equal(calls.length, beforeBlockedCount);
      } finally {
        global.fetch = origFetch;
      }
    }
  );
});

test('TC-T4-FE-03: Trusted proxy gating blocks spoofed X-Forwarded-* headers when TRUST_PROXY_HEADERS=false', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const secret = 't4-proxy-spoof-secret-0123456789abcdef';

  await withEnv(
    {
      BFF_AUTH_MODE: 'shared',
      SHARED_API_URL: 'https://ops.marketplace.test',
      SESSION_SECRET: secret,
      TRUST_PROXY_HEADERS: 'false',
      TRUST_PROXY_FORWARDED_FOR: 'false',
      ALLOWED_ORIGINS: undefined,
      COOKIE_SECURE: undefined,
      CHAIN_ID: '43113',
      NEXT_PUBLIC_CHAIN_ID: '43113',
      NODE_ENV: 'production',
    },
    async () => {
      const origFetch = global.fetch;
      const upstreamCalls = [];
      global.fetch = async (url, init) => {
        upstreamCalls.push({ url: String(url), headers: init?.headers || {}, body: init?.body });
        if (String(url).endsWith('/auth/challenge')) {
          return new Response(
            JSON.stringify({
              nonce: 'nonce_1234567890abcdef',
              message: `Sign ${account.address}`,
              challenge_token: 'ch.jwt',
              domain: 'http://127.0.0.1:3000',
              expires_at: Math.floor(Date.now() / 1000) + 300,
              chain_id: 43113,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ items: [], total: 0, total_pages: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };

      try {
        // 1. Spoofed X-Forwarded-Host must NOT bypass CSRF check
        const tok = createSessionToken(account.address, 43113, 'ops.jwt.token');
        const spoofCsrf = await listingsRoute.POST(
          new Request('http://127.0.0.1:3000/api/listings', {
            method: 'POST',
            headers: {
              host: '127.0.0.1:3000',
              origin: 'https://evil-attacker.example.com',
              'x-forwarded-host': 'evil-attacker.example.com',
              'x-forwarded-proto': 'https',
              'content-type': 'application/json',
              cookie: `${SESSION_COOKIE_NAME}=${tok}`,
            },
            body: JSON.stringify({ title: 'spoof' }),
          })
        );
        assert.equal(spoofCsrf.status, 403);
        assert.equal((await spoofCsrf.json()).error_code, 'CSRF_REJECTED');

        // 2. Spoofed X-Forwarded-For must NOT be forwarded upstream
        await listingsRoute.GET(
          new Request('http://127.0.0.1:3000/api/listings', {
            headers: {
              'x-forwarded-for': '203.0.113.99',
              'x-real-ip': '203.0.113.99',
            },
          })
        );
        const listCall = upstreamCalls.find((c) => c.url.includes('/listings'));
        assert.ok(listCall);
        assert.equal(listCall.headers['X-Forwarded-For'], undefined);

        // 3. Spoofed X-Forwarded-Host/Proto in /api/auth/session challenge must be ignored
        await sessionRoute.GET(
          new Request(`http://127.0.0.1:3000/api/auth/session?address=${account.address}&chainId=43113`, {
            headers: {
              host: '127.0.0.1:3000',
              'x-forwarded-host': 'evil.example.com',
              'x-forwarded-proto': 'https',
            },
          })
        );
        const chCall = upstreamCalls.find((c) => c.url.endsWith('/auth/challenge'));
        assert.ok(chCall);
        const parsedBody = JSON.parse(chCall.body);
        assert.equal(parsedBody.domain, 'http://127.0.0.1:3000');

        // 4. With TRUST_PROXY_HEADERS=true, valid proxy headers ARE honored
        process.env.TRUST_PROXY_HEADERS = 'true';
        await listingsRoute.GET(
          new Request('http://127.0.0.1:3000/api/listings', {
            headers: {
              'x-forwarded-for': '198.51.100.7',
            },
          })
        );
        const trustedCall = upstreamCalls[upstreamCalls.length - 1];
        assert.equal(trustedCall.headers['X-Forwarded-For'], '198.51.100.7');
      } finally {
        global.fetch = origFetch;
      }
    }
  );
});

test('TC-T4-FE-04: Cookie Secure attribute matches HTTP vs HTTPS accurately and blocks COOKIE_SECURE=false downgrade on HTTPS', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const secret = 't4-cookie-secure-secret-0123456789abcdef';

  const runHandshake = async (requestOrigin, extraHeaders = {}) => {
    const origFetch = global.fetch;
    global.fetch = async (url, init) => {
      if (String(url).endsWith('/auth/challenge')) {
        const reqBody = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            nonce: 'nonce_1234567890abcdef',
            message: `Sign ${reqBody.domain}`,
            challenge_token: 'ch.jwt',
            domain: reqBody.domain,
            expires_at: Math.floor(Date.now() / 1000) + 300,
            chain_id: 43113,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (String(url).endsWith('/auth/verify')) {
        return new Response(
          JSON.stringify({ ok: true, ops_token: 'ops.jwt.signed', address: account.address, chain_id: 43113 }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    };

    try {
      const chRes = await sessionRoute.GET(
        new Request(`${requestOrigin}/api/auth/session?address=${account.address}&chainId=43113`, {
          headers: extraHeaders,
        })
      );
      const ch = await chRes.json();
      const sig = await account.signMessage({ message: ch.message });
      const postRes = await sessionRoute.POST(
        new Request(`${requestOrigin}/api/auth/session`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: extraHeaders['x-expected-origin'] || requestOrigin, ...extraHeaders },
          body: JSON.stringify({
            address: account.address,
            chainId: 43113,
            nonce: ch.nonce,
            signature: sig,
            challengeToken: ch.challengeToken,
          }),
        })
      );
      const delRes = await sessionRoute.DELETE(
        new Request(`${requestOrigin}/api/auth/session`, { method: 'DELETE', headers: extraHeaders })
      );
      return {
        postStatus: postRes.status,
        postCookie: postRes.headers.get('set-cookie') || '',
        delCookie: delRes.headers.get('set-cookie') || '',
      };
    } finally {
      global.fetch = origFetch;
    }
  };

  // A. Plain HTTP local Docker in production build -> HttpOnly; SameSite=Lax WITHOUT Secure; spoofed X-Forwarded-Proto: https ignored
  await withEnv(
    {
      BFF_AUTH_MODE: 'shared',
      SHARED_API_URL: 'https://ops.marketplace.test',
      SESSION_SECRET: secret,
      TRUST_PROXY_HEADERS: 'false',
      COOKIE_SECURE: undefined,
      NODE_ENV: 'production',
      CHAIN_ID: '43113',
      NEXT_PUBLIC_CHAIN_ID: '43113',
    },
    async () => {
      const httpRun = await runHandshake('http://127.0.0.1:3000', {
        host: '127.0.0.1:3000',
        'x-forwarded-proto': 'https', // spoofed from untrusted client!
      });
      assert.equal(httpRun.postStatus, 200);
      assert.match(httpRun.postCookie, /HttpOnly/i);
      assert.match(httpRun.postCookie, /SameSite=lax/i);
      assert.doesNotMatch(httpRun.postCookie, /;\s*Secure\b/i);
      assert.doesNotMatch(httpRun.delCookie, /;\s*Secure\b/i);
    }
  );

  // B. Direct HTTPS with COOKIE_SECURE=false -> MUST STILL set Secure (downgrade forbidden!)
  await withEnv(
    {
      BFF_AUTH_MODE: 'shared',
      SHARED_API_URL: 'https://ops.marketplace.test',
      SESSION_SECRET: secret,
      TRUST_PROXY_HEADERS: 'false',
      COOKIE_SECURE: 'false',
      NODE_ENV: 'production',
      CHAIN_ID: '43113',
      NEXT_PUBLIC_CHAIN_ID: '43113',
    },
    async () => {
      const httpsRun = await runHandshake('https://client.marketplace.example');
      assert.equal(httpsRun.postStatus, 200);
      assert.match(httpsRun.postCookie, /;\s*Secure\b/i);
      assert.match(httpsRun.delCookie, /;\s*Secure\b/i);
    }
  );

  // C. Trusted TLS reverse proxy (X-Forwarded-Proto: https) even with COOKIE_SECURE=false -> MUST set Secure
  await withEnv(
    {
      BFF_AUTH_MODE: 'shared',
      SHARED_API_URL: 'https://ops.marketplace.test',
      SESSION_SECRET: secret,
      TRUST_PROXY_HEADERS: 'true',
      COOKIE_SECURE: 'false',
      NODE_ENV: 'production',
      CHAIN_ID: '43113',
      NEXT_PUBLIC_CHAIN_ID: '43113',
    },
    async () => {
      const proxiedHttps = await runHandshake('http://127.0.0.1:3000', {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'proxy.marketplace.example',
        'x-expected-origin': 'https://proxy.marketplace.example',
      });
      assert.equal(proxiedHttps.postStatus, 200);
      assert.match(proxiedHttps.postCookie, /;\s*Secure\b/i);
      assert.match(proxiedHttps.delCookie, /;\s*Secure\b/i);
    }
  );
});

test('TC-T4-FE-05: next.config.js rewrites /_backend internally to runtime proxy without baking upstream URLs', async () => {
  const prevShared = process.env.SHARED_API_URL;
  const prevBackend = process.env.BACKEND_URL;
  try {
    process.env.SHARED_API_URL = 'https://should-not-be-baked.example.com';
    process.env.BACKEND_URL = 'http://should-not-be-baked:8000';
    const nextConfig = require(path.join(FRONTEND_ROOT, 'next.config.js'));
    const rules = await nextConfig.rewrites();
    assert.deepEqual(rules, [
      { source: '/_backend/:path*', destination: '/api/backend-proxy/:path*' },
    ]);
    assert.ok(!JSON.stringify(rules).includes('should-not-be-baked'));
  } finally {
    if (prevShared === undefined) delete process.env.SHARED_API_URL;
    else process.env.SHARED_API_URL = prevShared;
    if (prevBackend === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = prevBackend;
  }
});
