const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTsModule(relPath) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });
  const mod = new Module(fullPath, module);
  mod.filename = fullPath;
  mod.paths = Module._nodeModulePaths(path.dirname(fullPath));
  mod._compile(transpiled.outputText, fullPath);
  return mod.exports;
}

const walletProviders = loadTsModule('lib/wallet-providers.ts');

test('Wallet UI Option List: Contains exact 5 wallets in order (Core, MetaMask, Rainbow, Base, WalletConnect)', () => {
  const { WALLET_OPTIONS } = walletProviders;
  assert.strictEqual(WALLET_OPTIONS.length, 5);
  assert.deepStrictEqual(
    WALLET_OPTIONS.map((w) => ({ id: w.id, name: w.name })),
    [
      { id: 'core', name: 'Core' },
      { id: 'metaMask', name: 'MetaMask' },
      { id: 'rainbow', name: 'Rainbow' },
      { id: 'base', name: 'Base' },
      { id: 'walletConnect', name: 'WalletConnect' },
    ]
  );

  for (const w of WALLET_OPTIONS) {
    assert.ok(w.iconUrl.startsWith('data:image/svg+xml,'), `${w.name} must have official SVG logo`);
    assert.ok(w.downloadUrl.startsWith('https://'), `${w.name} must have official download URL`);
  }
});

test('Multi-Extension EIP-6963 Discovery: Core + MetaMask installed simultaneously do not collide', () => {
  const {
    clearAnnouncedProviders,
    registerAnnouncedProvider,
    findWalletProvider,
  } = walletProviders;

  clearAnnouncedProviders();

  const mockCoreProvider = {
    isAvalanche: true,
    isMetaMask: true, // Core sets isMetaMask=true for legacy dApps
    request: async () => [],
  };
  const mockMetaMaskProvider = {
    isMetaMask: true,
    request: async () => [],
  };

  // Even when window.ethereum is hijacked by Core (the exact root cause of the MetaMask bug),
  // EIP-6963 announcement resolves both Core and MetaMask accurately.
  const mockWin = {
    ethereum: mockCoreProvider,
    avalanche: mockCoreProvider,
  };

  registerAnnouncedProvider({
    info: { uuid: '1', name: 'Core', icon: '', rdns: 'app.core.extension' },
    provider: mockCoreProvider,
  });
  registerAnnouncedProvider({
    info: { uuid: '2', name: 'MetaMask', icon: '', rdns: 'io.metamask' },
    provider: mockMetaMaskProvider,
  });

  assert.strictEqual(findWalletProvider('core', mockWin), mockCoreProvider);
  assert.strictEqual(findWalletProvider('metaMask', mockWin), mockMetaMaskProvider);

  clearAnnouncedProviders();
});

test('Window Providers Array Discovery: Resolves MetaMask, Core, Rainbow, Base from window.ethereum.providers', () => {
  const { clearAnnouncedProviders, findWalletProvider } = walletProviders;
  clearAnnouncedProviders();

  const coreProv = { isAvalanche: true, isMetaMask: true, request: async () => [] };
  const mmProv = { isMetaMask: true, request: async () => [] };
  const rainbowProv = { isRainbow: true, isMetaMask: true, request: async () => [] };
  const baseProv = { isCoinbaseWallet: true, isMetaMask: true, request: async () => [] };

  const mockWin = {
    ethereum: {
      isAvalanche: true,
      isMetaMask: true,
      providers: [coreProv, mmProv, rainbowProv, baseProv],
    },
  };

  assert.strictEqual(findWalletProvider('core', mockWin), coreProv);
  assert.strictEqual(findWalletProvider('metaMask', mockWin), mmProv);
  assert.strictEqual(findWalletProvider('rainbow', mockWin), rainbowProv);
  assert.strictEqual(findWalletProvider('base', mockWin), baseProv);
});

test('Strict Provider Separation: Core alone does not masquerade as MetaMask', () => {
  const { clearAnnouncedProviders, findWalletProvider } = walletProviders;
  clearAnnouncedProviders();

  const coreOnlyWin = {
    avalanche: { isAvalanche: true, isMetaMask: true, request: async () => [] },
    ethereum: { isAvalanche: true, isMetaMask: true, request: async () => [] },
  };

  assert.strictEqual(findWalletProvider('core', coreOnlyWin), coreOnlyWin.avalanche);
  assert.strictEqual(findWalletProvider('metaMask', coreOnlyWin), undefined);
  assert.strictEqual(findWalletProvider('rainbow', coreOnlyWin), undefined);
  assert.strictEqual(findWalletProvider('base', coreOnlyWin), undefined);
});

test('Multi-Account Switching: Core & MetaMask Account 1 -> Account 2 selection reorders active account to index 0', async () => {
  const {
    selectWalletAccount,
    requestWalletAccountSelection,
    setSelectedWalletAccount,
  } = walletProviders;

  const account1 = '0x1111111111111111111111111111111111111111';
  const account2 = '0x2222222222222222222222222222222222222222';

  setSelectedWalletAccount('core', null);

  let emittedAccounts = [];
  // Simulate Core Wallet behavior where eth_accounts always returns [Account 1, Account 2] in fixed order
  const mockCoreConnector = {
    id: 'core',
    getProvider: async () => ({
      request: async ({ method }) => {
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
          return [account1, account2];
        }
        if (method === 'wallet_requestPermissions') {
          // Simulate Core Wallet not reordering eth_accounts on permission request
          return [{ parentCapability: 'eth_accounts', caveats: [{ value: [account1, account2] }] }];
        }
        return [];
      },
    }),
    onAccountsChanged: (accs) => {
      emittedAccounts = accs;
    },
  };

  // 1. Direct switch to Account 2 via UI account selector
  const orderedAfterSelect = await selectWalletAccount(mockCoreConnector, account2);
  assert.strictEqual(orderedAfterSelect[0].toLowerCase(), account2.toLowerCase());
  assert.strictEqual(orderedAfterSelect[1].toLowerCase(), account1.toLowerCase());
  assert.strictEqual(emittedAccounts[0].toLowerCase(), account2.toLowerCase());

  // 2. Switch back to Account 1
  await selectWalletAccount(mockCoreConnector, account1);
  assert.strictEqual(emittedAccounts[0].toLowerCase(), account1.toLowerCase());

  // 3. Request account selection via wallet permission dialog while on Account 1 -> switches to Account 2
  const permResult = await requestWalletAccountSelection(mockCoreConnector, account1);
  assert.strictEqual(permResult.activeAddress.toLowerCase(), account2.toLowerCase());
  assert.strictEqual(emittedAccounts[0].toLowerCase(), account2.toLowerCase());
});

test('Core Provider Hardening: isCore / window.avalanche do not leak into MetaMask', () => {
  const { clearAnnouncedProviders, findWalletProvider } = walletProviders;
  clearAnnouncedProviders();

  const customCore = { request: async () => [] };
  const coreOnlyWin = {
    avalanche: customCore,
    ethereum: { isCore: true, isMetaMask: true, request: async () => [] },
  };

  assert.strictEqual(findWalletProvider('core', coreOnlyWin), customCore);
  assert.strictEqual(findWalletProvider('metaMask', coreOnlyWin), undefined);
});

test('Core -32002 Pending Handling: deduplicates concurrent connect, recovers via eth_accounts, and throws WalletPendingApprovalError when still pending', async () => {
  const {
    WALLET_OPTIONS,
    WalletPendingApprovalError,
    clearAnnouncedProviders,
    createBrowserWalletConnector,
    isPendingRequestError,
    registerAnnouncedProvider,
    setSelectedWalletAccount,
  } = walletProviders;

  const coreMeta = WALLET_OPTIONS.find((w) => w.id === 'core');
  const dummyConfig = {
    chains: [{ id: 43113, name: 'Avalanche Fuji', rpcUrls: { default: { http: ['https://api.avax-test.network/ext/bc/C/rpc'] } } }],
    emitter: { emit: () => {} },
  };

  // Case A: Concurrent connect calls while Core is waiting for user approval share ONE eth_requestAccounts call
  clearAnnouncedProviders();
  setSelectedWalletAccount('core', null);
  let requestAccountsCount = 0;
  const account1 = '0x1111111111111111111111111111111111111111';
  let authorized = false;

  const delayedCoreProvider = {
    isAvalanche: true,
    on: () => {},
    removeListener: () => {},
    request: async ({ method }) => {
      if (method === 'eth_chainId') return '0xa869';
      if (method === 'eth_accounts') return authorized ? [account1] : [];
      if (method === 'eth_requestAccounts') {
        requestAccountsCount += 1;
        await new Promise((r) => setTimeout(r, 30));
        authorized = true;
        return [account1];
      }
      return [];
    },
  };

  registerAnnouncedProvider({
    info: { uuid: 'core-test-1', name: 'Core', icon: '', rdns: 'app.core.extension' },
    provider: delayedCoreProvider,
  });

  const connectorA = createBrowserWalletConnector(coreMeta, {})(dummyConfig);
  const [res1, res2] = await Promise.all([connectorA.connect(), connectorA.connect()]);
  assert.strictEqual(requestAccountsCount, 1, 'Concurrent connects must send only 1 eth_requestAccounts call');
  assert.strictEqual(res1.accounts[0].toLowerCase(), account1.toLowerCase());
  assert.strictEqual(res2.accounts[0].toLowerCase(), account1.toLowerCase());

  // Case B: Once eth_accounts has authorized account, connect() skips eth_requestAccounts completely
  const postApprovalRes = await connectorA.connect();
  assert.strictEqual(requestAccountsCount, 1, 'Authorized eth_accounts must bypass eth_requestAccounts');
  assert.strictEqual(postApprovalRes.accounts[0].toLowerCase(), account1.toLowerCase());

  // Case C: If Core already holds a pending popup (-32002) and eth_accounts is empty -> throw WalletPendingApprovalError
  clearAnnouncedProviders();
  setSelectedWalletAccount('core', null);
  const pendingCoreProvider = {
    isAvalanche: true,
    on: () => {},
    removeListener: () => {},
    request: async ({ method }) => {
      if (method === 'eth_chainId') return '0xa869';
      if (method === 'eth_accounts') return [];
      if (method === 'eth_requestAccounts') {
        const err = new Error('Request of type eth_requestAccounts already pending for origin. Please wait.');
        err.code = -32002;
        throw err;
      }
      return [];
    },
  };

  registerAnnouncedProvider({
    info: { uuid: 'core-test-2', name: 'Core', icon: '', rdns: 'app.core.extension' },
    provider: pendingCoreProvider,
  });

  const connectorB = createBrowserWalletConnector(coreMeta, {})(dummyConfig);
  await assert.rejects(
    () => connectorB.connect(),
    (err) => err instanceof WalletPendingApprovalError && isPendingRequestError(err)
  );

  clearAnnouncedProviders();
});

test('Core Account Selection: does not call eth_requestAccounts when eth_accounts already holds accounts', async () => {
  const { requestWalletAccountSelection, setSelectedWalletAccount } = walletProviders;
  const account1 = '0x1111111111111111111111111111111111111111';
  const account2 = '0x2222222222222222222222222222222222222222';
  setSelectedWalletAccount('core', account1);

  let ethRequestAccountsCalled = 0;
  const mockCoreConnector = {
    id: 'core',
    getProvider: async () => ({
      request: async ({ method }) => {
        if (method === 'wallet_requestPermissions') {
          const err = new Error('Method not found');
          err.code = -32601;
          throw err;
        }
        if (method === 'eth_requestAccounts') {
          ethRequestAccountsCalled += 1;
          return [account1, account2];
        }
        if (method === 'eth_accounts') {
          return [account1, account2];
        }
        return [];
      },
    }),
    onAccountsChanged: () => {},
  };

  const result = await requestWalletAccountSelection(mockCoreConnector, account1);
  assert.strictEqual(ethRequestAccountsCalled, 0, 'Must not call eth_requestAccounts when eth_accounts is populated');
  assert.strictEqual(result.activeAddress.toLowerCase(), account2.toLowerCase());
});

test('Core Rejection Handling: handles empty resolution, hanging popup after focus return, retry unlock, and explicit cancel', async () => {
  const {
    WALLET_OPTIONS,
    cancelPendingConnectRequest,
    clearAnnouncedProviders,
    createBrowserWalletConnector,
    isUserRejectedError,
    registerAnnouncedProvider,
    setSelectedWalletAccount,
  } = walletProviders;

  const coreMeta = WALLET_OPTIONS.find((w) => w.id === 'core');
  const dummyConfig = {
    chains: [{ id: 43113, name: 'Avalanche Fuji', rpcUrls: { default: { http: ['https://api.avax-test.network/ext/bc/C/rpc'] } } }],
    emitter: { emit: () => {} },
  };
  const account1 = '0x1111111111111111111111111111111111111111';

  const createMockWin = (provider) => {
    const listeners = new Map();
    let focused = true;
    return {
      avalanche: provider,
      document: {
        visibilityState: 'visible',
        hasFocus: () => focused,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      addEventListener: (type, fn) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
      },
      removeEventListener: (type, fn) => {
        listeners.get(type)?.delete(fn);
      },
      dispatchEvent: () => true,
      simulateBlur: () => {
        focused = false;
        for (const fn of listeners.get('blur') || []) fn();
      },
      simulateFocus: () => {
        focused = true;
        for (const fn of listeners.get('focus') || []) fn();
      },
    };
  };

  // Subcase A: Core resolves eth_requestAccounts with [] -> throws UserRejectedRequestError
  clearAnnouncedProviders();
  setSelectedWalletAccount('core', null);
  const emptyCoreProvider = {
    isAvalanche: true,
    on: () => {},
    removeListener: () => {},
    request: async ({ method }) => {
      if (method === 'eth_chainId') return '0xa869';
      return [];
    },
  };
  const connectorEmpty = createBrowserWalletConnector(coreMeta, createMockWin(emptyCoreProvider))(dummyConfig);
  await assert.rejects(() => connectorEmpty.connect(), (err) => isUserRejectedError(err));

  // Subcase B: Core hangs on eth_requestAccounts after popup close (blur -> focus) with eth_accounts: [], then Retry succeeds
  clearAnnouncedProviders();
  setSelectedWalletAccount('core', null);
  let callCount = 0;
  let approvedOnRetry = false;
  const hangingThenRetryProvider = {
    isAvalanche: true,
    on: () => {},
    removeListener: () => {},
    request: ({ method }) => {
      if (method === 'eth_chainId') return Promise.resolve('0xa869');
      if (method === 'eth_accounts') return Promise.resolve(approvedOnRetry ? [account1] : []);
      if (method === 'eth_requestAccounts') {
        callCount += 1;
        if (callCount === 1) {
          // Simulate Core MV3 dropping the rejection callback when user rejects
          return new Promise(() => {});
        }
        approvedOnRetry = true;
        return Promise.resolve([account1]);
      }
      return Promise.resolve([]);
    },
  };

  const mockWinB = createMockWin(hangingThenRetryProvider);
  const connectorHanging = createBrowserWalletConnector(coreMeta, mockWinB)(dummyConfig);
  const firstAttempt = connectorHanging.connect();
  setTimeout(() => {
    mockWinB.simulateBlur();
    setTimeout(() => mockWinB.simulateFocus(), 20);
  }, 20);

  await assert.rejects(
    () => firstAttempt,
    (err) => isUserRejectedError(err),
    'Must reject with UserRejectedRequestError when Core popup closes without authorizing'
  );
  assert.strictEqual(callCount, 1);

  const retryResult = await connectorHanging.connect();
  assert.strictEqual(callCount, 2, 'Retry after focus-return rejection must not reuse hung promise');
  assert.strictEqual(retryResult.accounts[0].toLowerCase(), account1.toLowerCase());

  // Subcase C: Focus returns while user actually approved (eth_accounts populated) -> resolves cleanly instead of rejecting
  clearAnnouncedProviders();
  setSelectedWalletAccount('core', null);
  let lateApproved = false;
  const lateApprovedProvider = {
    isAvalanche: true,
    on: () => {},
    removeListener: () => {},
    request: ({ method }) => {
      if (method === 'eth_chainId') return Promise.resolve('0xa869');
      if (method === 'eth_accounts') return Promise.resolve(lateApproved ? [account1] : []);
      if (method === 'eth_requestAccounts') {
        return new Promise(() => {});
      }
      return Promise.resolve([]);
    },
  };

  const mockWinC = createMockWin(lateApprovedProvider);
  const connectorLateApprove = createBrowserWalletConnector(coreMeta, mockWinC)(dummyConfig);
  const lateAttempt = connectorLateApprove.connect();
  setTimeout(() => {
    mockWinC.simulateBlur();
    lateApproved = true;
    setTimeout(() => mockWinC.simulateFocus(), 20);
  }, 20);

  const lateResult = await lateAttempt;
  assert.strictEqual(lateResult.accounts[0].toLowerCase(), account1.toLowerCase());

  // Subcase D: Explicit cancelPendingConnectRequest cancels hung call immediately and wrapped Core errors classify properly
  clearAnnouncedProviders();
  setSelectedWalletAccount('core', null);
  let cancelCalls = 0;
  const neverSettleProvider = {
    isAvalanche: true,
    on: () => {},
    removeListener: () => {},
    request: ({ method }) => {
      if (method === 'eth_chainId') return Promise.resolve('0xa869');
      if (method === 'eth_accounts') return Promise.resolve([]);
      if (method === 'eth_requestAccounts') {
        cancelCalls += 1;
        return new Promise(() => {});
      }
      return Promise.resolve([]);
    },
  };
  registerAnnouncedProvider({
    info: { uuid: 'core-test-cancel', name: 'Core', icon: '', rdns: 'app.core.extension' },
    provider: neverSettleProvider,
  });
  const connectorCancel = createBrowserWalletConnector(coreMeta, createMockWin(neverSettleProvider))(dummyConfig);
  const pendingAttempt = connectorCancel.connect();
  setTimeout(() => cancelPendingConnectRequest('core'), 25);
  await assert.rejects(() => pendingAttempt, (err) => isUserRejectedError(err));
  assert.strictEqual(cancelCalls, 1);

  assert.strictEqual(isUserRejectedError({ error: { code: 4001 }, message: 'Failed' }), true);
  assert.strictEqual(isUserRejectedError({ message: 'User declined connection' }), true);
  assert.strictEqual(isUserRejectedError({ message: 'Request cancelled by user' }), true);
  assert.strictEqual(isUserRejectedError({ code: -32002, message: 'already pending' }), false);

  clearAnnouncedProviders();
});
