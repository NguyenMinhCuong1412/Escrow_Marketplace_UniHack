'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const { encodeEventTopics, parseAbi } = require('viem');

const FRONTEND_ROOT = path.resolve(__dirname, '..');

function registerTsLoader() {
  const origResolve = Module._resolveFilename;
  if (!Module._resolveFilename.__mktUiTsPatched) {
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
    Module._resolveFilename.__mktUiTsPatched = true;
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
  isPublicMarketplaceRoute,
  sanitizeReturnUrl,
  buildAuthRedirectUrl,
} = require('@/lib/auth-routes');
const {
  CATEGORY_LABELS,
  CATEGORY_TABS,
  CONDITION_LABELS,
  LISTING_STATUS_BADGES,
  REQUEST_STATUS_BADGES,
  buildSellableAvaxPreview,
  extractTradeCreatedIdFromReceipt,
  getPendingBindTrade,
  setPendingBindTrade,
  clearPendingBindTrade,
} = require('@/lib/marketplace-ui');
const {
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  LISTING_STATUSES,
  REQUEST_STATUSES,
} = require('@/lib/marketplace');

test('auth-routes: allows guests on / and /listings/[id] but protects private routes', () => {
  assert.equal(isPublicMarketplaceRoute('/'), true);
  assert.equal(isPublicMarketplaceRoute('/listings/abc-123'), true);
  assert.equal(isPublicMarketplaceRoute('/auth'), true);
  assert.equal(isPublicMarketplaceRoute('/auth/local'), true);

  assert.equal(isPublicMarketplaceRoute('/sell'), false);
  assert.equal(isPublicMarketplaceRoute('/trades'), false);
  assert.equal(isPublicMarketplaceRoute('/trade/new'), false);
  assert.equal(isPublicMarketplaceRoute('/trade/42'), false);
  assert.equal(isPublicMarketplaceRoute('/admin'), false);
  assert.equal(isPublicMarketplaceRoute('/profile/0x1234'), false);
  assert.equal(isPublicMarketplaceRoute(''), false);
  assert.equal(isPublicMarketplaceRoute(null), false);
});

test('auth-routes: sanitizeReturnUrl and buildAuthRedirectUrl prevent open redirect and preserve returnUrl', () => {
  assert.equal(sanitizeReturnUrl('/sell?tab=requests'), '/sell?tab=requests');
  assert.equal(sanitizeReturnUrl('/listings/xyz-1'), '/listings/xyz-1');
  assert.equal(sanitizeReturnUrl('https://evil.example/steal'), '/');
  assert.equal(sanitizeReturnUrl('//evil.example/steal'), '/');
  assert.equal(sanitizeReturnUrl('/auth?returnUrl=/sell'), '/');
  assert.equal(sanitizeReturnUrl(undefined), '/');

  assert.equal(buildAuthRedirectUrl('/', ''), '/auth');
  assert.equal(
    buildAuthRedirectUrl('/sell', '?tab=create'),
    '/auth?returnUrl=%2Fsell%3Ftab%3Dcreate'
  );
  assert.equal(
    buildAuthRedirectUrl('/listings/item-99', ''),
    '/auth?returnUrl=%2Flistings%2Fitem-99'
  );
});

test('marketplace-ui: buildSellableAvaxPreview computes exact BigInt wei & 30% deposit without float drift', () => {
  assert.deepEqual(buildSellableAvaxPreview('   '), { valid: false });

  const twoHalf = buildSellableAvaxPreview('2.5');
  assert.equal(twoHalf.valid, true);
  assert.equal(twoHalf.wei, '2500000000000000000');
  assert.equal(twoHalf.depositWei, '750000000000000000');
  assert.equal(twoHalf.depositAvax, '0.75');

  // High precision 18-decimal decimal value (IEEE-754 float would lose last digits)
  const highPrec = buildSellableAvaxPreview('10.000000000000000010');
  assert.equal(highPrec.valid, true);
  assert.equal(highPrec.wei, '10000000000000000010');
  assert.equal(highPrec.depositWei, '3000000000000000003');

  // 1 wei -> 30% deposit is 0 -> rejected
  const dust = buildSellableAvaxPreview('0.000000000000000001');
  assert.equal(dust.valid, false);
  assert.match(dust.error, /lớn hơn 0 wei/);

  assert.equal(buildSellableAvaxPreview('-1').valid, false);
  assert.equal(buildSellableAvaxPreview('abc').valid, false);
});

test('marketplace-ui: extractTradeCreatedIdFromReceipt decodes TradeCreated from target escrow contract', () => {
  const ESCROW_ADDR = '0x1111111111111111111111111111111111111111';
  const OTHER_ADDR = '0x9999999999999999999999999999999999999999';
  const abi = parseAbi([
    'event TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, uint256 itemValue, uint256 depositRequired)',
  ]);

  const topics = encodeEventTopics({
    abi,
    eventName: 'TradeCreated',
    args: {
      tradeId: 42n,
      seller: '0x2222222222222222222222222222222222222222',
      buyer: '0x3333333333333333333333333333333333333333',
    },
  });

  // 0x... itemValue + depositRequired encoded (unused by topics extraction but realistic 64 bytes)
  const data =
    '0x00000000000000000000000000000000000000000000000022b1c8c1227a00000000000000000000000000000000000000000000000000000a688906bd8b0000';

  const id = extractTradeCreatedIdFromReceipt(
    [
      { address: OTHER_ADDR, topics: [topics[0], '0x00000000000000000000000000000000000000000000000000000000000003e7'], data },
      { address: ESCROW_ADDR, topics, data },
    ],
    ESCROW_ADDR,
    abi
  );
  assert.equal(id, 42);

  const missing = extractTradeCreatedIdFromReceipt(
    [{ address: OTHER_ADDR, topics, data }],
    ESCROW_ADDR,
    abi
  );
  assert.equal(missing, null);
});

test('marketplace-ui: pendingBindTrade helpers persist and clear recovery txHash safely', () => {
  const store = new Map();
  const prevWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };

  try {
    const validHash = '0x' + 'ab'.repeat(32);
    setPendingBindTrade(43113, 'req-1', {
      txHash: validHash,
      tradeId: 17,
      buyerWallet: '0x3333333333333333333333333333333333333333',
      totalValueWei: '2500000000000000000',
      savedAt: 1700000000000,
    });

    const loaded = getPendingBindTrade(43113, 'req-1');
    assert.equal(loaded.txHash, validHash);
    assert.equal(loaded.tradeId, 17);
    assert.equal(getPendingBindTrade(31337, 'req-1'), null);

    // Corrupted hash in storage must return null instead of unsafe bind input
    store.set('mkt:pending-bind:43113:req-bad', JSON.stringify({ txHash: 'not-a-hash', buyerWallet: '0x1', totalValueWei: '1' }));
    assert.equal(getPendingBindTrade(43113, 'req-bad'), null);

    clearPendingBindTrade(43113, 'req-1');
    assert.equal(getPendingBindTrade(43113, 'req-1'), null);
  } finally {
    globalThis.window = prevWindow;
  }
});

test('marketplace-ui: badge & label dictionaries cover all DTO enums cleanly', () => {
  for (const cat of LISTING_CATEGORIES) {
    assert.ok(CATEGORY_LABELS[cat], `Missing label for category ${cat}`);
    assert.ok(
      CATEGORY_TABS.some((t) => t.value === cat),
      `Missing tab for category ${cat}`
    );
  }
  for (const cond of LISTING_CONDITIONS) {
    assert.ok(CONDITION_LABELS[cond], `Missing label for condition ${cond}`);
  }
  for (const st of LISTING_STATUSES) {
    assert.ok(LISTING_STATUS_BADGES[st]?.label, `Missing badge for listing status ${st}`);
  }
  for (const reqSt of REQUEST_STATUSES) {
    assert.ok(REQUEST_STATUS_BADGES[reqSt]?.label, `Missing badge for request status ${reqSt}`);
  }
});

test('MKT-004 marketplace pages preserve zero-float wei conversion & no Mua ngay bypass', () => {
  const filesToCheck = [
    path.join(FRONTEND_ROOT, 'app', 'page.tsx'),
    path.join(FRONTEND_ROOT, 'app', 'listings', '[id]', 'page.tsx'),
    path.join(FRONTEND_ROOT, 'app', 'sell', 'page.tsx'),
    path.join(FRONTEND_ROOT, 'app', 'trades', 'page.tsx'),
    path.join(FRONTEND_ROOT, 'components', 'ProductCard.tsx'),
  ];
  for (const filePath of filesToCheck) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(
      content.includes('parseFloat('),
      false,
      `${path.relative(FRONTEND_ROOT, filePath)} must not use parseFloat for AVAX/wei math`
    );
  }

  const detailSrc = fs.readFileSync(
    path.join(FRONTEND_ROOT, 'app', 'listings', '[id]', 'page.tsx'),
    'utf8'
  );
  assert.equal(
    detailSrc.includes('Mua ngay'),
    false,
    '/listings/[id] must not offer instant "Mua ngay" bypass without Seller acceptance + Escrow'
  );
  assert.ok(detailSrc.includes('Gửi yêu cầu mua'));
});
