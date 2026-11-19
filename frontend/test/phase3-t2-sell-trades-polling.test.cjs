'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const ReactDOMServer = require('react-dom/server');

const FRONTEND_ROOT = path.resolve(__dirname, '..');

const SELLER_WALLET_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BUYER_WALLET_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OTHER_WALLET_C = '0xcccccccccccccccccccccccccccccccccccccccc';
const ESCROW_ADDR = '0x19d053c84941411888f5b9e40c854365fdd4eb00';

// ---------------------------------------------------------------------------
// Deterministic Fake Clock + Document Visibility Environment
// ---------------------------------------------------------------------------

function createFakeEnvironment() {
  let nowMs = 1_700_000_000_000;
  let nextTimerId = 1;
  const timers = new Map();
  let visibilityState = 'visible';
  const docListeners = new Map();

  const fakeSetTimeout = (fn, delay = 0, ...args) => {
    const id = nextTimerId++;
    timers.set(id, {
      id,
      type: 'timeout',
      fn: () => fn(...args),
      runAt: nowMs + Math.max(0, Number(delay) || 0),
      delay: Number(delay) || 0,
    });
    return id;
  };

  const fakeClearTimeout = (id) => {
    timers.delete(id);
  };

  const fakeSetInterval = (fn, delay = 0, ...args) => {
    const id = nextTimerId++;
    const step = Math.max(1, Number(delay) || 1);
    timers.set(id, {
      id,
      type: 'interval',
      fn: () => fn(...args),
      runAt: nowMs + step,
      delay: step,
      intervalMs: step,
    });
    return id;
  };

  const fakeClearInterval = (id) => {
    timers.delete(id);
  };

  const fakeDocument = {
    get visibilityState() {
      return visibilityState;
    },
    addEventListener(event, handler) {
      if (!docListeners.has(event)) docListeners.set(event, new Set());
      docListeners.get(event).add(handler);
    },
    removeEventListener(event, handler) {
      docListeners.get(event)?.delete(handler);
    },
  };

  async function flushMicrotasks() {
    for (let i = 0; i < 4; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  async function advanceTime(ms) {
    await flushMicrotasks();
    const targetTime = nowMs + ms;
    while (true) {
      let earliest = null;
      for (const entry of timers.values()) {
        if (entry.runAt <= targetTime) {
          if (!earliest || entry.runAt < earliest.runAt || (entry.runAt === earliest.runAt && entry.id < earliest.id)) {
            earliest = entry;
          }
        }
      }
      if (!earliest) break;
      nowMs = earliest.runAt;
      if (earliest.type === 'interval') {
        earliest.runAt = nowMs + earliest.intervalMs;
      } else {
        timers.delete(earliest.id);
      }
      earliest.fn();
      await flushMicrotasks();
    }
    nowMs = targetTime;
    await flushMicrotasks();
  }

  function setVisibility(state) {
    visibilityState = state;
    const handlers = Array.from(docListeners.get('visibilitychange') || []);
    for (const h of handlers) {
      h();
    }
  }

  function getPendingTimeoutDelays() {
    return Array.from(timers.values())
      .filter((t) => t.type === 'timeout')
      .map((t) => t.delay);
  }

  return {
    fakeSetTimeout,
    fakeClearTimeout,
    fakeSetInterval,
    fakeClearInterval,
    fakeDocument,
    advanceTime,
    flushMicrotasks,
    setVisibility,
    getPendingTimeoutDelays,
    now: () => nowMs,
  };
}

// ---------------------------------------------------------------------------
// Minimal Faithful React Hook & VDOM Test Harness
// ---------------------------------------------------------------------------

function createHookHarness() {
  let slots = [];
  let hookIdx = 0;
  let pendingEffects = [];
  let mounted = false;
  let currentComponent = null;
  let currentProps = {};
  let latestVdom = null;
  const renderHistory = [];
  let scheduledRender = false;
  let inRender = false;

  function depsEqual(a, b) {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }

  const hooksApi = {
    useState(initial) {
      const idx = hookIdx++;
      if (idx >= slots.length) {
        const val = typeof initial === 'function' ? initial() : initial;
        slots.push({ kind: 'state', value: val });
      }
      const slot = slots[idx];
      const setState = (updater) => {
        const nextVal = typeof updater === 'function' ? updater(slot.value) : updater;
        if (Object.is(nextVal, slot.value)) return;
        slot.value = nextVal;
        if (mounted) {
          scheduleRerender();
        }
      };
      return [slot.value, setState];
    },
    useRef(initial) {
      const idx = hookIdx++;
      if (idx >= slots.length) {
        slots.push({ kind: 'ref', current: initial });
      }
      return slots[idx];
    },
    useMemo(factory, deps) {
      const idx = hookIdx++;
      if (idx >= slots.length || !depsEqual(slots[idx].deps, deps)) {
        const value = factory();
        slots[idx] = { kind: 'memo', deps, value };
      }
      return slots[idx].value;
    },
    useCallback(fn, deps) {
      return hooksApi.useMemo(() => fn, deps);
    },
    useEffect(effect, deps) {
      const idx = hookIdx++;
      const prev = slots[idx];
      const shouldRun = !prev || deps === undefined || !depsEqual(prev.deps, deps);
      if (!prev) {
        slots[idx] = { kind: 'effect', deps, cleanup: null };
      } else {
        prev.deps = deps;
      }
      if (shouldRun) {
        pendingEffects.push({ idx, effect });
      }
    },
  };

  function renderOnce() {
    if (!mounted || !currentComponent) return null;
    inRender = true;
    scheduledRender = false;
    try {
      hookIdx = 0;
      pendingEffects = [];
      latestVdom = currentComponent(currentProps);
      renderHistory.push({
        vdom: latestVdom,
        html: renderTreeToTextHtml(latestVdom),
      });
    } finally {
      inRender = false;
    }

    const toRun = pendingEffects.slice();
    pendingEffects = [];
    inRender = true;
    try {
      for (const item of toRun) {
        const slot = slots[item.idx];
        if (typeof slot.cleanup === 'function') {
          slot.cleanup();
          slot.cleanup = null;
        }
        const cleanup = item.effect();
        if (typeof cleanup === 'function') {
          slot.cleanup = cleanup;
        }
      }
    } finally {
      inRender = false;
    }

    if (scheduledRender && mounted) {
      renderOnce();
    }
    return latestVdom;
  }

  function scheduleRerender() {
    if (!mounted) return;
    if (inRender) {
      scheduledRender = true;
      return;
    }
    renderOnce();
  }

  function mount(Component, props = {}) {
    currentComponent = Component;
    currentProps = props;
    slots = [];
    renderHistory.length = 0;
    mounted = true;
    renderOnce();
  }

  function rerender(nextProps) {
    if (nextProps) currentProps = nextProps;
    renderOnce();
  }

  function unmount() {
    mounted = false;
    for (const slot of slots) {
      if (slot && slot.kind === 'effect' && typeof slot.cleanup === 'function') {
        slot.cleanup();
        slot.cleanup = null;
      }
    }
    slots = [];
  }

  return {
    hooksApi,
    mount,
    rerender,
    unmount,
    getLatestVdom: () => latestVdom,
    getLatestHtml: () => (renderHistory.length > 0 ? renderHistory[renderHistory.length - 1].html : ''),
    getRenderHistory: () => renderHistory,
  };
}

function renderTreeToTextHtml(node) {
  try {
    return ReactDOMServer.renderToStaticMarkup(node);
  } catch {
    return collectText(node);
  }
}

function collectText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (typeof node === 'object' && node.props) {
    return collectText(node.props.children);
  }
  return '';
}

function findElements(node, predicate, out = []) {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, predicate, out);
    return out;
  }
  if (typeof node === 'object') {
    if (predicate(node)) out.push(node);
    if (node.props && node.props.children !== undefined) {
      findElements(node.props.children, predicate, out);
    }
  }
  return out;
}

function findButtonByText(vdom, substr) {
  const buttons = findElements(
    vdom,
    (el) => el.type === 'button' && collectText(el).includes(substr)
  );
  return buttons[0] || null;
}

// ---------------------------------------------------------------------------
// Scoped TSX Loader + Controlled Mock Context
// ---------------------------------------------------------------------------

function makeSampleListing(overrides = {}) {
  return {
    id: overrides.id || 'lst-default',
    chain_id: overrides.chain_id || 31337,
    escrow_address: ESCROW_ADDR,
    seller_wallet: overrides.seller_wallet || SELLER_WALLET_A,
    sku: overrides.sku || 'LEGO-10305',
    sku_norm: overrides.sku_norm || 'LEGO-10305',
    category: overrides.category || 'LEGO',
    title: overrides.title || 'LEGO Lion Knights Castle',
    description: overrides.description || 'Sealed box',
    price_wei: overrides.price_wei || '1000000000000000000',
    deposit_required_wei: overrides.deposit_required_wei || '300000000000000000',
    collateral_asset: 'AVAX',
    accounting_token: 'CDU',
    condition: 'SEALED_NEW',
    quantity_total: overrides.quantity_total ?? 2,
    quantity_reserved: overrides.quantity_reserved ?? 0,
    quantity_sold: overrides.quantity_sold ?? 0,
    quantity_available: overrides.quantity_available ?? 2,
    primary_image_uri: 'ipfs://QmPrimary101',
    primary_image_sha256: 'abc123',
    primary_image_phash: 'def456',
    images: [{ id: 1, cid: 'QmPrimary101', uri: 'ipfs://QmPrimary101', sort_order: 0, is_primary: true }],
    review_required: false,
    warnings: [],
    status: overrides.status || 'ACTIVE',
    seller_reputation: 50,
    linked_trades: overrides.linked_trades || [],
    created_at: 1700000000,
    updated_at: overrides.updated_at || 1700000000,
    ...overrides,
  };
}

function makeSampleRequest(overrides = {}) {
  return {
    id: overrides.id || 'req-default',
    listing_id: overrides.listing_id || 'lst-default',
    chain_id: overrides.chain_id || 31337,
    buyer_wallet: overrides.buyer_wallet || BUYER_WALLET_B,
    seller_wallet: overrides.seller_wallet || SELLER_WALLET_A,
    quantity: overrides.quantity ?? 1,
    unit_price_wei: '1000000000000000000',
    total_value_wei: '1000000000000000000',
    deposit_required_wei: '300000000000000000',
    buyer_note: overrides.buyer_note || '',
    seller_note: overrides.seller_note || '',
    status: overrides.status || 'PENDING',
    reservation_expires_at: overrides.reservation_expires_at ?? 1700003600,
    trade_id: overrides.trade_id ?? null,
    synced_state: overrides.synced_state ?? null,
    tx_hash: overrides.tx_hash ?? null,
    created_at: 1700000000,
    updated_at: 1700000000,
    listing: overrides.listing || {
      id: overrides.listing_id || 'lst-default',
      title: 'LEGO Lion Knights Castle',
      sku: 'LEGO-10305',
      primary_image_uri: 'ipfs://QmPrimary101',
      status: 'ACTIVE',
    },
    ...overrides,
  };
}

function makeTrade(overrides = {}) {
  const id = overrides.id ?? 1n;
  return {
    id: typeof id === 'bigint' ? id : BigInt(id),
    seller: overrides.seller || SELLER_WALLET_A,
    buyer: overrides.buyer || BUYER_WALLET_B,
    itemValue: 1000000000000000000n,
    depositRequired: 300000000000000000n,
    sellerDeposit: 300000000000000000n,
    buyerDeposit: 300000000000000000n,
    nonce: '0x00',
    sellerEvidenceHash: '0x00',
    buyerEvidenceHash: '0x00',
    reportHash: '0x00',
    riskScore: 0,
    flagged: false,
    createdAt: 1700000000n,
    evidenceDeadline: 1700086400n,
    disputeDeadline: 0n,
    state: overrides.state ?? 1,
  };
}

function setupTestContext() {
  const env = createFakeEnvironment();
  const harness = createHookHarness();

  const savedGlobals = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    document: globalThis.document,
    window: globalThis.window,
    localStorage: globalThis.localStorage,
  };

  const storageMap = new Map();
  globalThis.setTimeout = env.fakeSetTimeout;
  globalThis.clearTimeout = env.fakeClearTimeout;
  globalThis.setInterval = env.fakeSetInterval;
  globalThis.clearInterval = env.fakeClearInterval;
  globalThis.document = env.fakeDocument;
  globalThis.window = { confirm: () => true };
  globalThis.localStorage = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
  };

  const stableSyncServerSession = (active, verifiedAddr) => {
    authState.syncCalls.push({ active, verifiedAddr });
    const prev = authState.serverSessionActive;
    authState.serverSessionActive = Boolean(active);
    if (prev !== authState.serverSessionActive) {
      harness.rerender();
    }
  };
  const stableAuthenticateWithServer = async () => true;

  const authState = {
    address: SELLER_WALLET_A,
    chain: { id: 31337, name: 'Anvil' },
    targetChain: { id: 31337, name: 'Anvil' },
    isAuthenticated: true,
    isCorrectNetwork: true,
    serverSessionActive: true,
    isSigningIn: false,
    syncCalls: [],
  };

  const myTradesState = {
    trades: [],
    isLoading: false,
    isError: false,
    error: null,
    refetchCount: 0,
    onRefetch: null,
  };

  const routerState = {
    tab: 'listings',
    replaceCalls: [],
  };

  const toasts = [];
  const capturedTradeListProps = [];
  const realMarketplace = requireRealMarketplace();

  const apiMocks = {
    getMyListings: async () => ({ items: [], total: 0, limit: 50, offset: 0 }),
    listPurchaseRequests: async () => ({ items: [], total: 0, limit: 50, offset: 0 }),
    createListing: async (input) => makeSampleListing({ title: input.title, sku: input.sku }),
    updateListing: async (id, input) => makeSampleListing({ id, ...input }),
    decidePurchaseRequest: async (id, input) =>
      makeSampleRequest({ id, status: input.action === 'accept' ? 'ACCEPTED' : 'REJECTED' }),
    cancelPurchaseRequest: async (id) => makeSampleRequest({ id, status: 'CANCELLED' }),
    bindRequestTrade: async (id, input) =>
      makeSampleRequest({ id, status: 'BOUND', trade_id: input.trade_id || 99, synced_state: 'WaitingDeposit' }),
    syncMarketplaceTrade: async (tradeId) => ({
      trade_id: Number(tradeId),
      synced_state: 'AwaitingEvidence',
      onchain_state: 1,
    }),
    getTradeMarketplaceContext: async (tradeId) => ({
      trade_id: Number(tradeId),
      bound: false,
      listing: null,
      purchase_request: null,
    }),
  };

  const wagmiMocks = {
    publicClient: {
      waitForTransactionReceipt: async () => ({ status: 'success', logs: [] }),
      simulateContract: async () => ({}),
    },
    writeContractAsync: async () => '0x' + 'ab'.repeat(32),
    signMessageAsync: async () => '0xsig',
    switchChain: () => {},
  };

  function requireRealMarketplace() {
    registerTsExtension();
    const mktPath = path.join(FRONTEND_ROOT, 'lib', 'marketplace.ts');
    delete require.cache[mktPath];
    return loadWithResolver(mktPath);
  }

  function registerTsExtension() {
    const compileTsx = (mod, filename) => {
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
    require.extensions['.ts'] = compileTsx;
    require.extensions['.tsx'] = compileTsx;
  }

  const origResolve = Module._resolveFilename;
  const origLoad = Module._load;

  function loadWithResolver(targetPath) {
    delete require.cache[targetPath];
    return require(targetPath);
  }

  Module._resolveFilename = function patchedResolve(request, parent, isMain, options) {
    if (typeof request === 'string' && request.startsWith('@/')) {
      const base = path.join(FRONTEND_ROOT, request.slice(2));
      for (const ext of ['.ts', '.tsx', '.js', '.cjs', '']) {
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

  const reactShim = {
    ...React,
    default: React,
    Suspense: React.Suspense,
    Fragment: React.Fragment,
    createElement: React.createElement,
    useState: (...args) => harness.hooksApi.useState(...args),
    useRef: (...args) => harness.hooksApi.useRef(...args),
    useMemo: (...args) => harness.hooksApi.useMemo(...args),
    useCallback: (...args) => harness.hooksApi.useCallback(...args),
    useEffect: (...args) => harness.hooksApi.useEffect(...args),
  };

  const lucideProxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === '__esModule') return true;
        return function IconMock(props) {
          return React.createElement('span', { 'data-icon': String(prop), className: props?.className });
        };
      },
    }
  );

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'react') {
      return reactShim;
    }
    if (request === 'next/navigation') {
      return {
        useRouter: () => ({
          replace: (url) => {
            routerState.replaceCalls.push(url);
            const q = url.split('?')[1] || '';
            const params = new URLSearchParams(q);
            const tab = params.get('tab');
            if (tab) routerState.tab = tab;
          },
        }),
        useSearchParams: () => ({
          get: (k) => (k === 'tab' ? routerState.tab : null),
          toString: () => (routerState.tab ? `tab=${routerState.tab}` : ''),
        }),
      };
    }
    if (request === 'next/link') {
      return {
        __esModule: true,
        default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children),
      };
    }
    if (request === 'sonner') {
      return {
        toast: {
          success: (m) => toasts.push({ level: 'success', message: m }),
          error: (m) => toasts.push({ level: 'error', message: m }),
          warning: (m) => toasts.push({ level: 'warning', message: m }),
        },
      };
    }
    if (request === 'lucide-react') {
      return lucideProxy;
    }
    if (request === 'wagmi') {
      return {
        usePublicClient: () => wagmiMocks.publicClient,
        useWriteContract: () => ({ writeContractAsync: (...a) => wagmiMocks.writeContractAsync(...a) }),
        useSignMessage: () => ({ signMessageAsync: (...a) => wagmiMocks.signMessageAsync(...a) }),
        useSwitchChain: () => ({ switchChain: (...a) => wagmiMocks.switchChain(...a) }),
      };
    }
    if (request === '@/hooks/useAuthSession') {
      return {
        useAuthSession: () => ({
          address: authState.address,
          chain: authState.chain,
          targetChain: authState.targetChain,
          isAuthenticated: authState.isAuthenticated,
          isCorrectNetwork: authState.isCorrectNetwork,
          serverSessionActive: authState.serverSessionActive,
          isSigningIn: authState.isSigningIn,
          authenticateWithServer: stableAuthenticateWithServer,
          syncServerSession: stableSyncServerSession,
        }),
      };
    }
    if (request === '@/hooks/useMyTrades') {
      return {
        useMyTrades: () => ({
          trades: myTradesState.trades,
          totalCreated: myTradesState.trades.length,
          isLoading: myTradesState.isLoading,
          isError: myTradesState.isError,
          error: myTradesState.error,
          refetch: () => {
            myTradesState.refetchCount += 1;
            if (typeof myTradesState.onRefetch === 'function') {
              return myTradesState.onRefetch();
            }
          },
        }),
      };
    }
    if (request === '@/components/MultiImageUploader') {
      return {
        MultiImageUploader: (props) =>
          React.createElement('div', {
            'data-testid': 'multi-image-uploader',
            'data-count': props.images?.length ?? 0,
            'data-disabled': String(Boolean(props.disabled)),
          }),
      };
    }
    if (request === '@/components/TradeList') {
      return {
        TradeList: (props) => {
          capturedTradeListProps.push({
            trades: props.trades,
            isLoading: props.isLoading,
            contextsByTradeId: props.contextsByTradeId,
          });
          return React.createElement(
            'div',
            { 'data-testid': 'trade-list-stub' },
            (props.trades || []).map((t) => {
              const ctx = props.contextsByTradeId?.[t.id.toString()];
              return React.createElement(
                'div',
                { key: t.id.toString(), 'data-trade-id': t.id.toString() },
                `trade-${t.id.toString()}:${ctx?.listing?.title || 'unbound'}:${ctx?.listing?.sku || ''}`
              );
            })
          );
        },
      };
    }
    if (request === '@/lib/contracts') {
      return {
        escrowAbi: [],
        escrowAddress: ESCROW_ADDR,
        chainId: 31337,
      };
    }
    if (request === '@/lib/backend') {
      return {
        listingMessage: (cid, addr, tid, uri) => `${cid}:${addr}:${tid}:${uri}`,
        registerUri: async () => ({ ok: true }),
      };
    }
    if (request === '@/lib/wallet-toast') {
      return {
        notifyWalletActionError: (err, msg) => toasts.push({ level: 'error', message: `${msg}: ${err?.message || ''}` }),
      };
    }
    if (request === '@/lib/marketplace') {
      return {
        ...realMarketplace,
        getMyListings: (...a) => apiMocks.getMyListings(...a),
        listPurchaseRequests: (...a) => apiMocks.listPurchaseRequests(...a),
        createListing: (...a) => apiMocks.createListing(...a),
        updateListing: (...a) => apiMocks.updateListing(...a),
        decidePurchaseRequest: (...a) => apiMocks.decidePurchaseRequest(...a),
        cancelPurchaseRequest: (...a) => apiMocks.cancelPurchaseRequest(...a),
        bindRequestTrade: (...a) => apiMocks.bindRequestTrade(...a),
        syncMarketplaceTrade: (...a) => apiMocks.syncMarketplaceTrade(...a),
        getTradeMarketplaceContext: (...a) => apiMocks.getTradeMarketplaceContext(...a),
      };
    }
    return origLoad.call(this, request, parent, isMain);
  };

  registerTsExtension();

  function loadPageInnerComponent(relPath) {
    const abs = path.join(FRONTEND_ROOT, relPath);
    delete require.cache[abs];
    const mod = require(abs);
    const PageWrapper = mod.default;
    const suspenseTree = PageWrapper();
    return suspenseTree.props.children.type;
  }

  function cleanup() {
    harness.unmount();
    Module._load = origLoad;
    Module._resolveFilename = origResolve;
    globalThis.setTimeout = savedGlobals.setTimeout;
    globalThis.clearTimeout = savedGlobals.clearTimeout;
    globalThis.setInterval = savedGlobals.setInterval;
    globalThis.clearInterval = savedGlobals.clearInterval;
    globalThis.document = savedGlobals.document;
    globalThis.window = savedGlobals.window;
    globalThis.localStorage = savedGlobals.localStorage;
  }

  return {
    env,
    harness,
    authState,
    myTradesState,
    routerState,
    toasts,
    apiMocks,
    capturedTradeListProps,
    realMarketplace,
    loadPageInnerComponent,
    cleanup,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
// TC-T2-01: /sell 10s non-overlapping poll, transient 503 preservation & backoff
// ---------------------------------------------------------------------------

test('TC-T2-01 /sell: 10s non-overlapping polling, transient 503 preserves data & backs off 10s->20s->30s', async (t) => {
  const ctx = setupTestContext();
  t.after(() => ctx.cleanup());

  let pollMode = 'ok';
  let slowPollDeferred = null;
  let callCount = 0;

  ctx.apiMocks.getMyListings = async (_q, opts) => {
    callCount += 1;
    assert.ok(opts && opts.signal, 'getMyListings must receive AbortSignal');
    if (pollMode === 'slow') {
      slowPollDeferred = deferred();
      return slowPollDeferred.promise;
    }
    if (pollMode === 'fail503') {
      throw new ctx.realMarketplace.MarketplaceApiError(503, 'UPSTREAM', 'Database temporarily unavailable');
    }
    return {
      items: [makeSampleListing({ id: 'lst-1', title: `Castle v${callCount}` })],
      total: 1,
      limit: 50,
      offset: 0,
    };
  };

  ctx.apiMocks.listPurchaseRequests = async () => ({
    items: [makeSampleRequest({ id: 'req-1', seller_note: '' })],
    total: 1,
    limit: 50,
    offset: 0,
  });

  const SellerStudio = ctx.loadPageInnerComponent('app/sell/page.tsx');
  ctx.harness.mount(SellerStudio);
  await ctx.env.flushMicrotasks();

  assert.equal(callCount, 1);
  assert.ok(ctx.harness.getLatestHtml().includes('Castle v1'));

  // Next scheduled poll timer must be 10,000 ms
  assert.ok(ctx.env.getPendingTimeoutDelays().includes(10_000));

  // Verify non-overlapping while poll is slow
  pollMode = 'slow';
  await ctx.env.advanceTime(10_000);
  assert.equal(callCount, 2);
  assert.ok(slowPollDeferred);

  await ctx.env.advanceTime(25_000);
  assert.equal(callCount, 2, 'must not overlap while previous poll is still in flight');

  pollMode = 'ok';
  slowPollDeferred.resolve({
    items: [makeSampleListing({ id: 'lst-1', title: 'Castle SlowDone' })],
    total: 1,
    limit: 50,
    offset: 0,
  });
  await ctx.env.flushMicrotasks();
  assert.ok(ctx.harness.getLatestHtml().includes('Castle SlowDone'));

  // Transient 503 preserves valid data, shows subtle role="status", backs off 10s -> 20s -> 30s
  pollMode = 'fail503';
  await ctx.env.advanceTime(10_000);
  assert.equal(callCount, 3);
  const htmlAfterFail1 = ctx.harness.getLatestHtml();
  assert.ok(htmlAfterFail1.includes('Castle SlowDone'), 'must preserve valid listing on transient poll error');
  assert.ok(htmlAfterFail1.includes('role="status"'), 'must render subtle role="status" banner');
  assert.ok(!htmlAfterFail1.includes('role="alert"'), 'must not wipe view with destructive alert on silent poll error');

  // consecutiveFailures = 1 => delay should be 20,000 ms (no call at +10,000ms)
  await ctx.env.advanceTime(10_000);
  assert.equal(callCount, 3, 'backoff must wait 20s after 1st failure');
  await ctx.env.advanceTime(10_000);
  assert.equal(callCount, 4, '2nd failure retry fires at 20s');

  // consecutiveFailures = 2 => capped at 30,000 ms (10s * 2^2 = 40s -> capped 30s)
  await ctx.env.advanceTime(20_000);
  assert.equal(callCount, 4, 'backoff must wait 30s after 2nd failure');
  await ctx.env.advanceTime(10_000);
  assert.equal(callCount, 5, '3rd failure retry fires at 30s');

  // Recovery clears banner and resets interval back to 10s
  pollMode = 'ok';
  await ctx.env.advanceTime(30_000);
  assert.equal(callCount, 6);
  const recoveredHtml = ctx.harness.getLatestHtml();
  assert.ok(!recoveredHtml.includes('role="status"'), 'status banner clears on recovery');
  assert.ok(ctx.env.getPendingTimeoutDelays().includes(10_000), 'delay resets to 10s after recovery');
});

// ---------------------------------------------------------------------------
// TC-T2-02: /sell Pause/Resume Matrix & Visibility + Form/Input/Modal Preservation
// ---------------------------------------------------------------------------

test('TC-T2-02 /sell: pauses on tab=create, edit modal, manual tx box, visibility=hidden & mutations; preserves inputs', async (t) => {
  const ctx = setupTestContext();
  t.after(() => ctx.cleanup());

  let getCount = 0;
  let acceptDeferred = null;

  ctx.apiMocks.getMyListings = async () => {
    getCount += 1;
    return {
      items: [makeSampleListing({ id: 'lst-1', title: `Item #${getCount}`, sku: 'SKU-1' })],
      total: 1,
      limit: 50,
      offset: 0,
    };
  };
  ctx.apiMocks.listPurchaseRequests = async () => ({
    items: [makeSampleRequest({ id: 'req-1', status: 'ACCEPTED', reservation_expires_at: 1700003600 })],
    total: 1,
    limit: 50,
    offset: 0,
  });
  ctx.apiMocks.decidePurchaseRequest = async () => {
    acceptDeferred = deferred();
    return acceptDeferred.promise;
  };

  const SellerStudio = ctx.loadPageInnerComponent('app/sell/page.tsx');
  ctx.harness.mount(SellerStudio);
  await ctx.env.flushMicrotasks();
  assert.equal(getCount, 1);

  // 1) Pause when visibilityState === 'hidden'
  ctx.env.setVisibility('hidden');
  ctx.harness.rerender();
  await ctx.env.advanceTime(40_000);
  assert.equal(getCount, 1, 'no polling while tab is hidden');

  ctx.env.setVisibility('visible');
  await ctx.env.flushMicrotasks();
  assert.equal(getCount, 2, 'resuming visibility refreshes immediately');

  // 2) Pause when Edit Listing Modal is open and preserve edited title input
  const editBtn = findButtonByText(ctx.harness.getLatestVdom(), 'Sửa');
  assert.ok(editBtn);
  editBtn.props.onClick();
  ctx.harness.rerender();
  assert.ok(ctx.harness.getLatestHtml().includes('role="dialog"'));

  const titleInput = findElements(
    ctx.harness.getLatestVdom(),
    (el) => el.type === 'input' && el.props?.id === 'edit-title'
  )[0];
  assert.ok(titleInput);
  titleInput.props.onChange({ target: { value: 'Unsaved Draft Edit Title' } });

  await ctx.env.advanceTime(50_000);
  assert.equal(getCount, 2, 'no polling while edit modal is open');
  assert.ok(ctx.harness.getLatestHtml().includes('Unsaved Draft Edit Title'));

  const cancelEditBtn = findElements(
    ctx.harness.getLatestVdom(),
    (el) => el.type === 'button' && el.props?.['aria-label'] === 'Đóng hộp thoại chỉnh sửa'
  )[0];
  cancelEditBtn.props.onClick();
  await ctx.env.flushMicrotasks();
  assert.equal(getCount, 3, 'closing edit modal resumes polling');

  // 3) Pause on tab === 'create' with typed SKU/title preserved
  ctx.routerState.tab = 'create';
  ctx.harness.rerender();
  const skuInput = findElements(
    ctx.harness.getLatestVdom(),
    (el) => el.type === 'input' && el.props?.id === 'create-sku'
  )[0];
  skuInput.props.onChange({ target: { value: 'draft-sku-99' } });
  await ctx.env.advanceTime(50_000);
  assert.equal(getCount, 3, 'no polling while Seller is on create tab');
  assert.ok(ctx.harness.getLatestHtml().includes('DRAFT-SKU-99'));

  // 4) Pause on requests tab when manual tx recovery box is open + preserve typed hash
  ctx.routerState.tab = 'requests';
  ctx.harness.rerender();
  await ctx.env.flushMicrotasks();
  const baselineBeforeManual = getCount;

  const manualToggle = findButtonByText(ctx.harness.getLatestVdom(), 'Khôi phục bằng tx_hash có sẵn');
  assert.ok(manualToggle);
  manualToggle.props.onClick();
  ctx.harness.rerender();

  const manualInput = findElements(
    ctx.harness.getLatestVdom(),
    (el) => el.type === 'input' && el.props?.id === 'manual-tx-req-1'
  )[0];
  assert.ok(manualInput);
  manualInput.props.onChange({ target: { value: '0xdeadbeef' } });

  await ctx.env.advanceTime(40_000);
  assert.equal(getCount, baselineBeforeManual, 'no polling while manual tx recovery input is open');
  assert.ok(ctx.harness.getLatestHtml().includes('0xdeadbeef'));

  // Closing manual box resumes, then mutatingListingId ('Tạm ẩn') pauses polling until settled
  manualToggle.props.onClick();
  await ctx.env.flushMicrotasks();
  const afterManualClose = getCount;
  assert.ok(afterManualClose > baselineBeforeManual, 'closing manual tx recovery resumes polling');

  let mutateDeferred = null;
  ctx.apiMocks.updateListing = async () => {
    mutateDeferred = deferred();
    return mutateDeferred.promise;
  };
  ctx.routerState.tab = 'listings';
  ctx.harness.rerender();
  await ctx.env.flushMicrotasks();
  const beforePauseBtn = getCount;
  const pauseButtons = findElements(
    ctx.harness.getLatestVdom(),
    (el) => el.type === 'button' && collectText(el) === 'Tạm ẩn'
  );
  assert.equal(pauseButtons.length, 2);
  const pauseBtn = pauseButtons[1];
  pauseBtn.props.onClick();
  await ctx.env.flushMicrotasks();
  assert.ok(mutateDeferred);
  await ctx.env.advanceTime(30_000);
  assert.equal(getCount, beforePauseBtn, 'no polling while mutatingListingId is active');

  mutateDeferred.resolve(makeSampleListing({ id: 'lst-1', status: 'PAUSED' }));
  await ctx.env.flushMicrotasks();
  assert.equal(getCount, beforePauseBtn + 1, 'completing listing mutation resumes polling');

  // 5) sellerNote preservation across background poll & processingReqId pause/resume
  ctx.apiMocks.listPurchaseRequests = async () => ({
    items: [makeSampleRequest({ id: 'req-pend', status: 'PENDING' })],
    total: 1,
    limit: 50,
    offset: 0,
  });
  ctx.routerState.tab = 'requests';
  ctx.harness.rerender();
  await ctx.env.advanceTime(10_000);

  const noteInput = findElements(
    ctx.harness.getLatestVdom(),
    (el) => el.type === 'input' && el.props?.id === 'seller-note-req-pend'
  )[0];
  assert.ok(noteInput);
  noteInput.props.onChange({ target: { value: 'Ship Friday careful packaging' } });
  await ctx.env.advanceTime(10_000);
  assert.ok(ctx.harness.getLatestHtml().includes('Ship Friday careful packaging'), 'seller note preserved across background poll');

  let decisionDeferred = null;
  ctx.apiMocks.decidePurchaseRequest = async () => {
    decisionDeferred = deferred();
    return decisionDeferred.promise;
  };
  const beforeDecisionCount = getCount;
  const acceptBtn = findButtonByText(ctx.harness.getLatestVdom(), 'Xác nhận & Giữ chỗ (30p)');
  assert.ok(acceptBtn);
  acceptBtn.props.onClick();
  await ctx.env.flushMicrotasks();
  assert.ok(decisionDeferred);
  await ctx.env.advanceTime(30_000);
  assert.equal(getCount, beforeDecisionCount, 'no polling while processingReqId is handling decision');

  decisionDeferred.resolve(makeSampleRequest({ id: 'req-pend', status: 'ACCEPTED' }));
  await ctx.env.flushMicrotasks();
  assert.equal(getCount, beforeDecisionCount + 1, 'completing decision resumes polling');
});

// ---------------------------------------------------------------------------
// TC-T2-03: /sell Session Isolation (0 cross-wallet render frames), 401 Loop Prevention & Unauth Guard
// ---------------------------------------------------------------------------

test('TC-T2-03 /sell: zero cross-wallet render leak, aborts & rejects late responses, 401 prevents loop', async (t) => {
  const ctx = setupTestContext();
  t.after(() => ctx.cleanup());

  let apiCalls = 0;
  let slowWalletADeferred = null;
  let abortCount = 0;

  ctx.apiMocks.getMyListings = async (_q, opts) => {
    apiCalls += 1;
    if (opts?.signal) {
      opts.signal.addEventListener('abort', () => {
        abortCount += 1;
      });
    }
    if (ctx.authState.address === SELLER_WALLET_A && apiCalls === 1) {
      return {
        items: [makeSampleListing({ id: 'lst-walletA', title: 'SECRET_WALLET_A_ITEM' })],
        total: 1,
        limit: 50,
        offset: 0,
      };
    }
    if (ctx.authState.address === SELLER_WALLET_A && apiCalls === 2) {
      // Simulate slow in-flight poll that tries to resolve AFTER wallet switched (even ignoring abort)
      slowWalletADeferred = deferred();
      return slowWalletADeferred.promise;
    }
    return {
      items: [makeSampleListing({ id: 'lst-walletB', title: 'PUBLIC_WALLET_B_ITEM', seller_wallet: BUYER_WALLET_B })],
      total: 1,
      limit: 50,
      offset: 0,
    };
  };

  ctx.apiMocks.listPurchaseRequests = async () => {
    if (ctx.authState.address === SELLER_WALLET_A) {
      return {
        items: [makeSampleRequest({ id: 'req-A', listing: { id: 'lst-walletA', title: 'SECRET_REQ_A', sku: 'A-1', status: 'ACTIVE' } })],
        total: 1,
        limit: 50,
        offset: 0,
      };
    }
    return { items: [], total: 0, limit: 50, offset: 0 };
  };

  // Unauthenticated / !serverSessionActive / isSigningIn -> 0 API calls
  ctx.authState.serverSessionActive = false;
  const SellerStudio = ctx.loadPageInnerComponent('app/sell/page.tsx');
  ctx.harness.mount(SellerStudio);
  await ctx.env.advanceTime(30_000);
  assert.equal(apiCalls, 0, 'zero API calls when serverSessionActive is false');

  ctx.authState.serverSessionActive = true;
  ctx.authState.isSigningIn = true;
  ctx.harness.rerender();
  await ctx.env.advanceTime(20_000);
  assert.equal(apiCalls, 0, 'zero API calls while signing in');

  // Sign in as Wallet A
  ctx.authState.isSigningIn = false;
  ctx.harness.rerender();
  await ctx.env.flushMicrotasks();
  assert.equal(apiCalls, 1);
  assert.ok(ctx.harness.getLatestHtml().includes('SECRET_WALLET_A_ITEM'));

  // Trigger slow poll #2 on Wallet A
  await ctx.env.advanceTime(10_000);
  assert.equal(apiCalls, 2);
  assert.ok(slowWalletADeferred);

  // Switch immediately to Wallet B & track render index right at switch!
  const renderCountBeforeSwitch = ctx.harness.getRenderHistory().length;
  ctx.authState.address = BUYER_WALLET_B;
  ctx.harness.rerender();

  // Assert ZERO Wallet A data rendered even on the VERY FIRST render frame after address switch
  const postSwitchFrames = ctx.harness.getRenderHistory().slice(renderCountBeforeSwitch);
  assert.ok(postSwitchFrames.length >= 1);
  for (let i = 0; i < postSwitchFrames.length; i += 1) {
    assert.ok(
      !postSwitchFrames[i].html.includes('SECRET_WALLET_A_ITEM'),
      `Render frame #${i} after switching to Wallet B leaked SECRET_WALLET_A_ITEM`
    );
    assert.ok(
      !postSwitchFrames[i].html.includes('SECRET_REQ_A'),
      `Render frame #${i} after switching to Wallet B leaked SECRET_REQ_A`
    );
  }
  assert.ok(abortCount >= 1, 'old in-flight request for Wallet A must be aborted on wallet switch');

  await ctx.env.flushMicrotasks();
  assert.ok(ctx.harness.getLatestHtml().includes('PUBLIC_WALLET_B_ITEM'));

  // Resolve Wallet A's slow promise late with poisoned data -> MUST be rejected!
  slowWalletADeferred.resolve({
    items: [makeSampleListing({ id: 'lst-poison', title: 'POISON_LATE_WALLET_A' })],
    total: 1,
    limit: 50,
    offset: 0,
  });
  await ctx.env.flushMicrotasks();
  assert.ok(!ctx.harness.getLatestHtml().includes('POISON_LATE_WALLET_A'));
  assert.ok(ctx.harness.getLatestHtml().includes('PUBLIC_WALLET_B_ITEM'));

  // Chain switch wipes old session data & fetches fresh chain state
  const renderCountBeforeChain = ctx.harness.getRenderHistory().length;
  ctx.authState.chain = { id: 43113, name: 'Fuji' };
  ctx.harness.rerender();
  const chainFrame0 = ctx.harness.getRenderHistory()[renderCountBeforeChain];
  assert.ok(!chainFrame0.html.includes('PUBLIC_WALLET_B_ITEM'), 'chain switch immediately hides previous chain data');
  await ctx.env.flushMicrotasks();

  // 401 Expiry on poll stops polling and calls syncServerSession(false) without 401 loop
  const callsBefore401 = apiCalls;
  ctx.apiMocks.getMyListings = async () => {
    apiCalls += 1;
    throw new ctx.realMarketplace.MarketplaceApiError(401, 'UNAUTHORIZED', 'Session expired');
  };
  await ctx.env.advanceTime(10_000);
  assert.equal(apiCalls, callsBefore401 + 1);
  assert.equal(ctx.authState.serverSessionActive, false);
  assert.deepEqual(ctx.authState.syncCalls, [{ active: false, verifiedAddr: undefined }]);

  await ctx.env.advanceTime(60_000);
  assert.equal(apiCalls, callsBefore401 + 1, 'no 401 polling loop after session invalidated');
  assert.ok(!ctx.harness.getLatestHtml().includes('PUBLIC_WALLET_B_ITEM'), '401 clears displayed listings');

  // Re-authenticate then test explicit logout clears immediately & makes 0 calls
  ctx.apiMocks.getMyListings = async () => {
    apiCalls += 1;
    return { items: [makeSampleListing({ id: 'lst-reauth', title: 'AFTER_REAUTH_ITEM' })], total: 1, limit: 50, offset: 0 };
  };
  ctx.authState.serverSessionActive = true;
  ctx.harness.rerender();
  await ctx.env.flushMicrotasks();
  assert.ok(ctx.harness.getLatestHtml().includes('AFTER_REAUTH_ITEM'));

  const callsBeforeLogout = apiCalls;
  const idxBeforeLogout = ctx.harness.getRenderHistory().length;
  ctx.authState.isAuthenticated = false;
  ctx.authState.address = null;
  ctx.authState.serverSessionActive = false;
  ctx.harness.rerender();
  assert.ok(!ctx.harness.getRenderHistory()[idxBeforeLogout].html.includes('AFTER_REAUTH_ITEM'), 'logout hides session data on frame 0');
  await ctx.env.advanceTime(40_000);
  assert.equal(apiCalls, callsBeforeLogout, 'zero API calls after logout');
});

// ---------------------------------------------------------------------------
// TC-T2-04: /trades 10s Non-Overlapping Poll, busyId Pause, Transient Error & Backoff
// ---------------------------------------------------------------------------

test('TC-T2-04 /trades: 10s non-overlapping poll, busyId/visibility pause, transient 503 preserves data & backoff 10->20->30', async (t) => {
  const ctx = setupTestContext();
  t.after(() => ctx.cleanup());

  ctx.authState.address = BUYER_WALLET_B;
  ctx.myTradesState.trades = [makeTrade({ id: 10n, seller: SELLER_WALLET_A, buyer: BUYER_WALLET_B, state: 1 })];

  let reqCallCount = 0;
  let reqMode = 'ok';
  let slowReqDeferred = null;
  let cancelDeferred = null;

  ctx.apiMocks.listPurchaseRequests = async ({ role }) => {
    if (role === 'buyer') reqCallCount += 1;
    if (reqMode === 'slow' && role === 'buyer') {
      slowReqDeferred = deferred();
      return slowReqDeferred.promise;
    }
    if (reqMode === 'fail503') {
      throw new ctx.realMarketplace.MarketplaceApiError(503, 'UPSTREAM', 'Temporary 503');
    }
    return {
      items: role === 'buyer'
        ? [makeSampleRequest({ id: 'breq-1', status: 'PENDING', listing: { id: 'l1', title: `BuyReq v${reqCallCount}`, sku: 'B-1', status: 'ACTIVE' } })]
        : [],
      total: role === 'buyer' ? 1 : 0,
      limit: 50,
      offset: 0,
    };
  };
  ctx.apiMocks.getTradeMarketplaceContext = async (tid) => ({
    trade_id: Number(tid),
    bound: true,
    listing: { id: 'l1', title: 'Trade #10 Context', sku: 'T-10' },
    purchase_request: null,
  });
  ctx.apiMocks.cancelPurchaseRequest = async () => {
    cancelDeferred = deferred();
    return cancelDeferred.promise;
  };

  const MyTrades = ctx.loadPageInnerComponent('app/trades/page.tsx');
  ctx.harness.mount(MyTrades);
  await ctx.env.flushMicrotasks();

  assert.equal(reqCallCount, 1);
  assert.ok(ctx.harness.getLatestHtml().includes('BuyReq v1'));

  // Busy cancel pauses polling
  const cancelBtn = findButtonByText(ctx.harness.getLatestVdom(), 'Hủy yêu cầu');
  assert.ok(cancelBtn);
  cancelBtn.props.onClick();
  await ctx.env.flushMicrotasks();
  assert.ok(cancelDeferred);

  await ctx.env.advanceTime(30_000);
  assert.equal(reqCallCount, 1, 'no polling while busyId is cancelling request');

  cancelDeferred.resolve(makeSampleRequest({ id: 'breq-1', status: 'CANCELLED', listing: { id: 'l1', title: 'BuyReq v1 Cancelled', sku: 'B-1', status: 'ACTIVE' } }));
  await ctx.env.flushMicrotasks();
  assert.equal(reqCallCount, 2, 'resuming after cancel triggers refresh cleanly');

  // Non-overlapping during slow poll
  reqMode = 'slow';
  await ctx.env.advanceTime(10_000);
  assert.equal(reqCallCount, 3);
  await ctx.env.advanceTime(25_000);
  assert.equal(reqCallCount, 3, 'no overlapping poll on /trades');

  reqMode = 'ok';
  slowReqDeferred.resolve({
    items: [makeSampleRequest({ id: 'breq-1', status: 'PENDING', listing: { id: 'l1', title: 'BuyReq Stable', sku: 'B-1', status: 'ACTIVE' } })],
    total: 1,
    limit: 50,
    offset: 0,
  });
  await ctx.env.flushMicrotasks();
  assert.ok(ctx.harness.getLatestHtml().includes('BuyReq Stable'));

  // Transient 503 preserves BuyReq Stable, shows status banner, backs off 10->20->30
  reqMode = 'fail503';
  await ctx.env.advanceTime(10_000);
  assert.equal(reqCallCount, 4);
  const failHtml = ctx.harness.getLatestHtml();
  assert.ok(failHtml.includes('BuyReq Stable'));
  assert.ok(failHtml.includes('role="status"'));

  await ctx.env.advanceTime(10_000);
  assert.equal(reqCallCount, 4, 'wait 20s after 1st failure');
  await ctx.env.advanceTime(10_000);
  assert.equal(reqCallCount, 5);

  await ctx.env.advanceTime(20_000);
  assert.equal(reqCallCount, 5, 'wait 30s after 2nd failure');
  await ctx.env.advanceTime(10_000);
  assert.equal(reqCallCount, 6);

  reqMode = 'ok';
  await ctx.env.advanceTime(30_000);
  assert.equal(reqCallCount, 7);
  assert.ok(!ctx.harness.getLatestHtml().includes('role="status"'));

  // Visibility pause/resume on /trades
  ctx.env.setVisibility('hidden');
  ctx.harness.rerender();
  await ctx.env.advanceTime(40_000);
  assert.equal(reqCallCount, 7, 'no polling on /trades while tab is hidden');
  ctx.env.setVisibility('visible');
  await ctx.env.flushMicrotasks();
  assert.equal(reqCallCount, 8, 'returning to visible refreshes /trades cleanly');
});

// ---------------------------------------------------------------------------
// TC-T2-05: Supplemental QA #2 — Concurrent contextsByTradeId Safety, Stale Rejection,
// Partial Errors, and Marketplace DB Change with Unchanged On-Chain Trade.state
// ---------------------------------------------------------------------------

test('TC-T2-05 /trades Supplemental QA #2: concurrent contextsByTradeId never cancels siblings, rejects stale, preserves partial errors & refreshes active unchanged trades', async (t) => {
  const ctx = setupTestContext();
  t.after(() => ctx.cleanup());

  ctx.authState.address = BUYER_WALLET_B;
  ctx.routerState.tab = 'escrow';
  // Trade #1: Active (state=1), Trade #2: Terminal (state=4, bound=true), Trade #3: Terminal (state=4, initially unbound)
  ctx.myTradesState.trades = [
    makeTrade({ id: 1n, seller: SELLER_WALLET_A, buyer: BUYER_WALLET_B, state: 1 }),
    makeTrade({ id: 2n, seller: SELLER_WALLET_A, buyer: BUYER_WALLET_B, state: 4 }),
    makeTrade({ id: 3n, seller: SELLER_WALLET_A, buyer: BUYER_WALLET_B, state: 4 }),
  ];

  let t1Title = 'Trade 1 Initial';
  let t2Fail = false;
  const ctxCallsByTrade = { 1: 0, 2: 0, 3: 0 };
  const pendingT1Requests = [];

  ctx.apiMocks.listPurchaseRequests = async () => ({ items: [], total: 0, limit: 50, offset: 0 });
  ctx.apiMocks.getTradeMarketplaceContext = async (tid, opts) => {
    const id = Number(tid);
    ctxCallsByTrade[id] = (ctxCallsByTrade[id] || 0) + 1;
    if (id === 1 && pendingT1RequestsMode === 'queue') {
      const d = deferred();
      pendingT1Requests.push({ seqNum: ctxCallsByTrade[1], d, signal: opts?.signal });
      return d.promise;
    }
    if (id === 2) {
      if (t2Fail) throw new Error('Single-trade 500 error');
      return { trade_id: 2, bound: true, listing: { id: 'l2', title: 'Trade 2 Terminal Valid', sku: 'T2' } };
    }
    if (id === 3) {
      return {
        trade_id: 3,
        bound: ctxCallsByTrade[3] >= 2,
        listing: ctxCallsByTrade[3] >= 2 ? { id: 'l3', title: 'Trade 3 Newly Bound', sku: 'T3' } : null,
      };
    }
    return { trade_id: 1, bound: true, listing: { id: 'l1', title: t1Title, sku: 'T1' } };
  };

  let pendingT1RequestsMode = 'direct';

  const MyTrades = ctx.loadPageInnerComponent('app/trades/page.tsx');
  ctx.harness.mount(MyTrades);
  await ctx.env.flushMicrotasks();

  const html0 = ctx.harness.getLatestHtml();
  assert.ok(html0.includes('Trade 1 Initial'));
  assert.ok(html0.includes('Trade 2 Terminal Valid'));
  assert.ok(html0.includes('trade-3:unbound'));

  // 1) Marketplace DB edits listing title while Trade #1's on-chain state remains state=1 (unchanged),
  // AND Trade #3 becomes bound, WHILE terminal bound Trade #2 is NOT unnecessarily re-polled in background
  // unless manual refresh! Also simulate partial error on Trade #2 during manual refresh.
  t1Title = 'Trade 1 Updated In Marketplace DB';
  const prevT2Calls = ctxCallsByTrade[2];
  await ctx.env.advanceTime(10_000);
  const htmlAfterPoll = ctx.harness.getLatestHtml();
  assert.ok(htmlAfterPoll.includes('Trade 1 Updated In Marketplace DB'), 'active trade context refreshes even if Trade.state stays 1');
  assert.ok(htmlAfterPoll.includes('Trade 3 Newly Bound'), 'previously unbound trade context refreshes on poll');
  assert.equal(ctxCallsByTrade[2], prevT2Calls, 'terminal already-bound Trade #2 skipped during silent background poll');

  // 2) Manual refresh triggers mode='all' (including Trade #2), Trade #2 throws 500 error -> MUST preserve Trade 2 Terminal Valid!
  t2Fail = true;
  t1Title = 'Trade 1 Manual Fresh';
  const refreshBtn = findButtonByText(ctx.harness.getLatestVdom(), 'Làm mới');
  assert.ok(refreshBtn);
  refreshBtn.props.onClick();
  await ctx.env.flushMicrotasks();
  const htmlPartialErr = ctx.harness.getLatestHtml();
  assert.ok(htmlPartialErr.includes('Trade 1 Manual Fresh'));
  assert.ok(htmlPartialErr.includes('Trade 2 Terminal Valid'), 'partial single-trade error must preserve existing valid Trade #2 context');

  // 3) Stale out-of-order response rejection + non-cancellation of sibling calls:
  // Trigger Poll #1 (slow T1 request A) and Manual Refresh #2 (T1 request B + T2 ok) concurrently!
  t2Fail = false;
  pendingT1RequestsMode = 'queue';

  // Poll starts T1 request A
  await ctx.env.advanceTime(10_000);
  assert.equal(pendingT1Requests.length, 1);

  // Immediately trigger Manual Refresh (T1 request B + T2) while T1 request A hasn't finished
  refreshBtn.props.onClick();
  await ctx.env.flushMicrotasks();
  assert.equal(pendingT1Requests.length, 2);

  // Resolve Request B FIRST (newer) with 'Newest Title B', then Request A SECOND (stale) with 'Stale Title A'
  pendingT1Requests[1].d.resolve({
    trade_id: 1,
    bound: true,
    listing: { id: 'l1', title: 'Newest Title B', sku: 'T1-B' },
  });
  await ctx.env.flushMicrotasks();
  assert.ok(ctx.harness.getLatestHtml().includes('Newest Title B'));

  pendingT1Requests[0].d.resolve({
    trade_id: 1,
    bound: true,
    listing: { id: 'l1', title: 'Stale Title A', sku: 'T1-A' },
  });
  await ctx.env.flushMicrotasks();
  assert.ok(!ctx.harness.getLatestHtml().includes('Stale Title A'), 'late older context response must never overwrite newer committed context');
  assert.ok(ctx.harness.getLatestHtml().includes('Newest Title B'));
  assert.ok(ctx.harness.getLatestHtml().includes('Trade 2 Terminal Valid'), 'sibling Trade #2 remains valid');

  // 4) 401 inside getTradeMarketplaceContext triggers handleExpiredSession -> syncServerSession(false) & stops polling
  pendingT1RequestsMode = 'direct';
  ctx.apiMocks.getTradeMarketplaceContext = async () => {
    throw new ctx.realMarketplace.MarketplaceApiError(401, 'UNAUTHORIZED', 'Expired inside context');
  };
  await ctx.env.advanceTime(10_000);
  assert.equal(ctx.authState.serverSessionActive, false);
  assert.deepEqual(ctx.authState.syncCalls, [{ active: false, verifiedAddr: undefined }]);
  const callsAfter401 = ctxCallsByTrade[1];
  await ctx.env.advanceTime(40_000);
  assert.equal(ctxCallsByTrade[1], callsAfter401, 'no 401 loop after context 401');
});

// ---------------------------------------------------------------------------
// TC-T2-06: /trades Supplemental QA #1 & #3 — Zero Cross-Wallet Render Frame Leak
// (including stale useMyTrades trades for 1 frame) + Late Abort + Unauth Guard
// ---------------------------------------------------------------------------

test('TC-T2-06 /trades Supplemental QA #1 & #3: zero Wallet A render frames on Wallet B switch, aborts old fetches, 0 calls unauth', async (t) => {
  const ctx = setupTestContext();
  t.after(() => ctx.cleanup());

  let apiCalls = 0;
  let abortedSignals = 0;

  ctx.authState.address = SELLER_WALLET_A;
  ctx.authState.serverSessionActive = false;
  ctx.myTradesState.trades = [makeTrade({ id: 501n, seller: SELLER_WALLET_A, buyer: BUYER_WALLET_B, state: 1 })];

  ctx.apiMocks.listPurchaseRequests = async ({ role }, opts) => {
    apiCalls += 1;
    if (opts?.signal) opts.signal.addEventListener('abort', () => { abortedSignals += 1; });
    return {
      items: [
        makeSampleRequest({
          id: `req-${ctx.authState.address}-${role}`,
          listing: { id: 'l501', title: ctx.authState.address === SELLER_WALLET_A ? 'WALLET_A_SECRET_REQ' : 'WALLET_B_REQ', sku: 'S501', status: 'ACTIVE' },
        }),
      ],
      total: 1,
      limit: 50,
      offset: 0,
    };
  };

  ctx.apiMocks.getTradeMarketplaceContext = async (tid, opts) => {
    apiCalls += 1;
    if (opts?.signal) opts.signal.addEventListener('abort', () => { abortedSignals += 1; });
    return {
      trade_id: Number(tid),
      bound: true,
      listing: { id: 'l501', title: 'WALLET_A_SECRET_CONTEXT', sku: 'CTX501' },
    };
  };

  const MyTrades = ctx.loadPageInnerComponent('app/trades/page.tsx');
  ctx.harness.mount(MyTrades);
  await ctx.env.advanceTime(30_000);
  assert.equal(apiCalls, 0, 'zero marketplace API calls when serverSessionActive is false');

  // Activate Wallet A session
  ctx.authState.serverSessionActive = true;
  ctx.harness.rerender();
  await ctx.env.flushMicrotasks();
  ctx.routerState.tab = 'buyer';
  ctx.harness.rerender();
  assert.ok(ctx.harness.getLatestHtml().includes('WALLET_A_SECRET_REQ'));

  ctx.routerState.tab = 'escrow';
  ctx.harness.rerender();
  assert.ok(ctx.harness.getLatestHtml().includes('WALLET_A_SECRET_CONTEXT'));
  assert.ok(ctx.harness.getLatestHtml().includes('trade-501:'));

  // Hang Wallet A request before switching to OTHER_WALLET_C (neither buyer nor seller of trade 501)
  const slowReq = deferred();
  ctx.apiMocks.listPurchaseRequests = async (_q, opts) => {
    apiCalls += 1;
    if (opts?.signal) opts.signal.addEventListener('abort', () => { abortedSignals += 1; });
    if (ctx.authState.address === SELLER_WALLET_A) return slowReq.promise;
    return { items: [], total: 0, limit: 50, offset: 0 };
  };
  await ctx.env.advanceTime(10_000);

  // Switch address to OTHER_WALLET_C while myTradesState.trades STILL temporarily holds Trade 501 (worst case)!
  const beforeSwitchIdx = ctx.harness.getRenderHistory().length;
  ctx.authState.address = OTHER_WALLET_C;
  ctx.harness.rerender();

  const switchFrames = ctx.harness.getRenderHistory().slice(beforeSwitchIdx);
  for (let i = 0; i < switchFrames.length; i += 1) {
    assert.ok(!switchFrames[i].html.includes('WALLET_A_SECRET_CONTEXT'), 'frame 0+ must never show Wallet A context');
    assert.ok(!switchFrames[i].html.includes('WALLET_A_SECRET_REQ'), 'frame 0+ must never show Wallet A request');
    assert.ok(!switchFrames[i].html.includes('trade-501:'), 'frame 0+ must filter out trades not owned by Wallet C');
  }
  assert.ok(abortedSignals >= 1, 'in-flight Wallet A fetch aborted on switch');

  slowReq.resolve({
    items: [makeSampleRequest({ id: 'late-A', listing: { id: 'x', title: 'LATE_LEAK_A', sku: 'LA', status: 'ACTIVE' } })],
    total: 1,
    limit: 50,
    offset: 0,
  });
  await ctx.env.flushMicrotasks();
  assert.ok(!ctx.harness.getLatestHtml().includes('LATE_LEAK_A'));
});

// ---------------------------------------------------------------------------
// TC-T2-07: Two-Session Seller A + Buyer B Synchronization & P3-T1 ETag Regression Combo
// ---------------------------------------------------------------------------

test('TC-T2-07 Two-session Seller A + Buyer B background sync & P3-T1 ETag cache compatibility', async (t) => {
  const ctx = setupTestContext();
  t.after(() => ctx.cleanup());

  // Shared mock backend DB state between Seller A and Buyer B
  const db = {
    requests: [
      makeSampleRequest({
        id: 'req-shared-1',
        listing_id: 'lst-shared-1',
        status: 'PENDING',
        trade_id: null,
        listing: { id: 'lst-shared-1', title: 'Rare Gundam PG', sku: 'PG-01', status: 'ACTIVE' },
      }),
    ],
    listings: [makeSampleListing({ id: 'lst-shared-1', title: 'Rare Gundam PG', sku: 'PG-01' })],
  };

  ctx.apiMocks.getMyListings = async () => ({ items: db.listings.map((x) => ({ ...x })), total: db.listings.length, limit: 50, offset: 0 });
  ctx.apiMocks.listPurchaseRequests = async () => ({ items: db.requests.map((r) => ({ ...r, listing: { ...r.listing } })), total: db.requests.length, limit: 50, offset: 0 });

  // Mount Buyer B view on /trades
  ctx.authState.address = BUYER_WALLET_B;
  ctx.routerState.tab = 'buyer';
  const MyTrades = ctx.loadPageInnerComponent('app/trades/page.tsx');
  ctx.harness.mount(MyTrades);
  await ctx.env.flushMicrotasks();

  assert.ok(ctx.harness.getLatestHtml().includes('Rare Gundam PG'));
  assert.ok(ctx.harness.getLatestHtml().includes('Chờ xác nhận'));

  // Seller A accepts and binds trade #77 in backend DB (and updates listing title)
  db.requests[0] = makeSampleRequest({
    ...db.requests[0],
    status: 'ESCROW_CREATED',
    trade_id: 77,
    synced_state: 'WaitingDeposit',
    listing: { id: 'lst-shared-1', title: 'Rare Gundam PG (Final Box)', sku: 'PG-01', status: 'RESERVED' },
  });

  // Next 10s poll on Buyer B automatically picks up ESCROW_CREATED status + Escrow #77 link
  await ctx.env.advanceTime(10_000);
  const buyerUpdatedHtml = ctx.harness.getLatestHtml();
  assert.ok(buyerUpdatedHtml.includes('Đã tạo Escrow'), 'Buyer B automatically sees ESCROW_CREATED status after 10s poll');
  assert.ok(buyerUpdatedHtml.includes('Mở Escrow #77'), 'Buyer B sees link to /trade/77');

  // Verify P3-T1 ETag cache helper still works properly alongside P3-T2 mutations
  ctx.realMarketplace.clearListingsEtagCache();
  assert.equal(ctx.realMarketplace.computePollDelayMs(0, 10_000, 30_000), 10_000);
  assert.equal(ctx.realMarketplace.computePollDelayMs(1, 10_000, 30_000), 20_000);
  assert.equal(ctx.realMarketplace.computePollDelayMs(2, 10_000, 30_000), 30_000);
});
