'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || 'test-session-secret-pin-hardening-0123456789abcdef';

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
const {
  MAX_IMAGE_BYTES,
  detectMediaMimeFromBytes,
} = require('@/lib/pin-security');
const { POST: pinPost } = require('@/app/api/pin/route');

const TEST_WALLET = '0x1111111111111111111111111111111111111111';

function sampleJpeg(extraSize = 32) {
  const buf = new Uint8Array(4 + extraSize);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  return buf;
}

function samplePng() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
}

function sampleWebp() {
  const b = new Uint8Array(16);
  b.set(Buffer.from('RIFF'), 0);
  b.set(Buffer.from('WEBP'), 8);
  return b;
}

function sampleMp4(brand = 'isom') {
  const b = new Uint8Array(28);
  // 4-byte big-endian box size = 0x1c (28 bytes)
  b[3] = 0x1c;
  b.set(Buffer.from('ftyp'), 4);
  b.set(Buffer.from(brand), 8);
  return b;
}

function makeCookieHeader(address = TEST_WALLET, chainId = 43113) {
  const token = createSessionToken(address, chainId);
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

function makeUploadRequest({
  bytes,
  fileName = 'photo.jpg',
  declaredType = 'image/jpeg',
  cookie,
  origin = 'http://127.0.0.1:3000',
  secFetchSite = 'same-origin',
  omitFile = false,
}) {
  const form = new FormData();
  if (!omitFile) {
    const blob = new Blob([bytes], { type: declaredType });
    form.append('file', blob, fileName);
  }
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  if (origin) headers.set('origin', origin);
  if (secFetchSite) headers.set('sec-fetch-site', secFetchSite);
  return new Request('http://127.0.0.1:3000/api/pin', {
    method: 'POST',
    headers,
    body: form,
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

test('detectMediaMimeFromBytes identifies real JPEG, PNG, WEBP, MP4 and rejects disguised files', () => {
  assert.equal(detectMediaMimeFromBytes(sampleJpeg()), 'image/jpeg');
  assert.equal(detectMediaMimeFromBytes(samplePng()), 'image/png');
  assert.equal(detectMediaMimeFromBytes(sampleWebp()), 'image/webp');
  assert.equal(detectMediaMimeFromBytes(sampleMp4('isom')), 'video/mp4');
  assert.equal(detectMediaMimeFromBytes(sampleMp4('mp42')), 'video/mp4');

  assert.equal(detectMediaMimeFromBytes(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(detectMediaMimeFromBytes(Buffer.from('<html><script>alert(1)</script></html>')), null);
  assert.equal(detectMediaMimeFromBytes(Buffer.from('GIF89a\x01\x00\x01\x00')), null);
  assert.equal(detectMediaMimeFromBytes(Buffer.from('MZ\x90\x00\x03\x00\x00\x00')), null);

  // Truncated/invalid MP4 ftyp box size
  const invalidMp4 = sampleMp4('isom');
  invalidMp4[3] = 0xff;
  assert.equal(detectMediaMimeFromBytes(invalidMp4), null);
});

test('POST /api/pin enforces wallet auth, CSRF check, empty check, and MIME magic-byte checks', async () => {
  const cookie = makeCookieHeader(TEST_WALLET, 43113);

  await withEnv({ NEXT_PUBLIC_CHAIN_ID: '43113', CHAIN_ID: undefined, PINATA_JWT: 'jwt-test' }, async () => {
    // 1. Unauthenticated -> 401
    const unauthRes = await pinPost(makeUploadRequest({ bytes: sampleJpeg() }));
    assert.equal(unauthRes.status, 401);

    // 2. Cross-site CSRF -> 403
    const csrfRes = await pinPost(
      makeUploadRequest({
        bytes: sampleJpeg(),
        cookie,
        origin: 'https://attacker.example',
        secFetchSite: 'cross-site',
      })
    );
    assert.equal(csrfRes.status, 403);
    const csrfBody = await csrfRes.json();
    assert.equal(csrfBody.error_code, 'CSRF_REJECTED');

    // 3. Missing file -> 400
    const missingRes = await pinPost(makeUploadRequest({ omitFile: true, cookie }));
    assert.equal(missingRes.status, 400);

    // 4. Empty file -> 400 EMPTY_FILE
    const emptyRes = await pinPost(
      makeUploadRequest({ bytes: new Uint8Array(0), fileName: 'empty.jpg', declaredType: 'image/jpeg', cookie })
    );
    assert.equal(emptyRes.status, 400);
    assert.equal((await emptyRes.json()).error_code, 'EMPTY_FILE');

    // 5. Disguised HTML/SVG with fake image/jpeg MIME -> 415
    const svgDisguised = await pinPost(
      makeUploadRequest({
        bytes: Buffer.from('<svg onload="alert(1)"></svg>'),
        fileName: 'evil.jpg',
        declaredType: 'image/jpeg',
        cookie,
      })
    );
    assert.equal(svgDisguised.status, 415);
    assert.equal((await svgDisguised.json()).error_code, 'UNSUPPORTED_MEDIA_TYPE');

    // 6. Real PNG bytes claiming image/jpeg -> 415 MIME_MISMATCH
    const mismatchRes = await pinPost(
      makeUploadRequest({
        bytes: samplePng(),
        fileName: 'wrong.jpg',
        declaredType: 'image/jpeg',
        cookie,
      })
    );
    assert.equal(mismatchRes.status, 415);
    assert.equal((await mismatchRes.json()).error_code, 'MIME_MISMATCH');

    // 7. Image > 10 MB -> 413 FILE_TOO_LARGE
    const oversizedJpeg = sampleJpeg(MAX_IMAGE_BYTES + 16);
    const bigRes = await pinPost(
      makeUploadRequest({
        bytes: oversizedJpeg,
        fileName: 'huge.jpg',
        declaredType: 'image/jpeg',
        cookie,
      })
    );
    assert.equal(bigRes.status, 413);
    assert.equal((await bigRes.json()).error_code, 'FILE_TOO_LARGE');
  });
});

test('POST /api/pin fails closed (503) without PINATA_JWT on Fuji 43113 and never returns mock CID', async () => {
  const fujiCookie = makeCookieHeader(TEST_WALLET, 43113);
  const anvilCookie = makeCookieHeader(TEST_WALLET, 31337);

  // Fuji session + Fuji config + no JWT -> 503
  await withEnv({ NEXT_PUBLIC_CHAIN_ID: '43113', CHAIN_ID: undefined, PINATA_JWT: '' }, async () => {
    const res = await pinPost(
      makeUploadRequest({ bytes: sampleJpeg(), fileName: 'card.jpg', declaredType: 'image/jpeg', cookie: fujiCookie })
    );
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.error_code, 'IPFS_PROVIDER_UNCONFIGURED');
    assert.equal(data.cid, undefined);
    assert.equal(data.mock, undefined);

    // Even if cookie claims 31337 while server config is 43113 -> 503
    const mismatchChainRes = await pinPost(
      makeUploadRequest({ bytes: sampleJpeg(), fileName: 'card.jpg', declaredType: 'image/jpeg', cookie: anvilCookie })
    );
    assert.equal(mismatchChainRes.status, 503);
  });

  // Both server & session are 31337 and JWT is empty -> mock CID allowed for local Anvil MP4
  await withEnv({ NEXT_PUBLIC_CHAIN_ID: '31337', CHAIN_ID: '31337', PINATA_JWT: '' }, async () => {
    const res = await pinPost(
      makeUploadRequest({
        bytes: sampleMp4('isom'),
        fileName: 'proof.mp4',
        declaredType: 'video/mp4',
        cookie: anvilCookie,
      })
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.mock, true);
    assert.match(data.cid, /^mock[a-f0-9]{46}$/);
    assert.equal(data.uri, `ipfs://${data.cid}`);
    assert.equal(data.mime_type, 'video/mp4');
  });
});

test('POST /api/pin uploads sanitized Blob to Pinata with randomized filename and hides JWT/upstream secrets', async () => {
  const fujiCookie = makeCookieHeader(TEST_WALLET, 43113);
  const originalFetch = global.fetch;

  await withEnv(
    {
      NEXT_PUBLIC_CHAIN_ID: '43113',
      CHAIN_ID: '43113',
      PINATA_JWT: 'secret-pinata-jwt-value-do-not-leak',
    },
    async () => {
      try {
        // Success path
        let capturedHeaders = null;
        let capturedFile = null;
        global.fetch = async (url, init) => {
          assert.equal(url, 'https://api.pinata.cloud/pinning/pinFileToIPFS');
          capturedHeaders = init.headers;
          capturedFile = init.body.get('file');
          return new Response(JSON.stringify({ IpfsHash: 'QmRealPinataCid1234567890' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        };

        const okRes = await pinPost(
          makeUploadRequest({
            bytes: samplePng(),
            fileName: '../../etc/passwd.png',
            declaredType: 'image/png',
            cookie: fujiCookie,
          })
        );
        assert.equal(okRes.status, 200);
        const okData = await okRes.json();
        assert.equal(okData.cid, 'QmRealPinataCid1234567890');
        assert.equal(okData.uri, 'ipfs://QmRealPinataCid1234567890');
        assert.equal(okData.mock, false);
        assert.equal(okData.mime_type, 'image/png');
        assert.equal(capturedHeaders.Authorization, 'Bearer secret-pinata-jwt-value-do-not-leak');
        assert.match(capturedFile.name, /^marketplace-[a-f0-9]{12}\.png$/);
        assert.equal(capturedFile.type, 'image/png');

        // Upstream error sanitization path
        global.fetch = async () =>
          new Response('Upstream token secret-pinata-jwt-value-do-not-leak rejected stacktrace', {
            status: 401,
          });

        const errRes = await pinPost(
          makeUploadRequest({
            bytes: samplePng(),
            fileName: 'lego.png',
            declaredType: 'image/png',
            cookie: fujiCookie,
          })
        );
        assert.equal(errRes.status, 502);
        const errText = await errRes.text();
        assert.ok(!errText.includes('secret-pinata-jwt-value-do-not-leak'));
        assert.ok(!errText.includes('stacktrace'));
        const errJson = JSON.parse(errText);
        assert.equal(errJson.error_code, 'IPFS_PROVIDER_ERROR');
      } finally {
        global.fetch = originalFetch;
      }
    }
  );
});
