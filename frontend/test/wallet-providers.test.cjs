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
