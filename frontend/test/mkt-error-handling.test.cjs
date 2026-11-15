'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const { ContractFunctionExecutionError, UserRejectedRequestError } = require('viem');

const FRONTEND_ROOT = path.resolve(__dirname, '..');

function registerTsLoader(extraMocks = {}) {
  const origResolve = Module._resolveFilename;
  const origLoad = Module._load;

  Module._resolveFilename = function patchedResolve(request, parent, isMain, options) {
    if (Object.prototype.hasOwnProperty.call(extraMocks, request)) {
      return request;
    }
    if (typeof request === 'string' && request.startsWith('@/')) {
      const base = path.join(FRONTEND_ROOT, request.slice(2));
      for (const ext of ['.ts', '.tsx', '.js', '']) {
        const candidate = base + ext;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return origResolve.call(this, candidate, parent, isMain, options);
        }
      }
    }
    return origResolve.call(this, request, parent, isMain, options);
  };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(extraMocks, request)) {
      return extraMocks[request];
    }
    return origLoad.call(this, request, parent, isMain);
  };

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

  return () => {
    Module._resolveFilename = origResolve;
    Module._load = origLoad;
  };
}

const restoreLoader = registerTsLoader();
const { parseTradeIdParam, safeParseTradeId } = require('@/lib/trade-id');
const {
  classifyContractError,
  getReadableError,
  isTxUserRejected,
} = require('@/lib/errors');
restoreLoader();

test('P2 Trade ID validation: accepts valid positive integers and rejects malformed URL params cleanly', () => {
  assert.strictEqual(parseTradeIdParam('2'), 2n);
  assert.strictEqual(parseTradeIdParam('1'), 1n);
  assert.strictEqual(parseTradeIdParam('999999999999'), 999999999999n);
  assert.strictEqual(parseTradeIdParam(['2']), 2n);

  const invalidParams = [
    '2**',
    '2%2A%2A',
    'abc',
    '0',
    '00',
    '02',
    '-1',
    '1.5',
    '0x2',
    ' 2',
    '2 ',
    '',
    undefined,
    null,
    '%E0%A4%A',
    ['2', '3'],
    ['2**'],
  ];

  for (const input of invalidParams) {
    assert.strictEqual(parseTradeIdParam(input), null, `Expected null for ${String(input)}`);
  }
});

test('P2 safeParseTradeId: normalizes valid inputs and falls back to 0n without throwing', () => {
  assert.strictEqual(safeParseTradeId(2n), 2n);
  assert.strictEqual(safeParseTradeId(2), 2n);
  assert.strictEqual(safeParseTradeId('2'), 2n);

  for (const bad of [0n, -5n, 0, -1, 1.5, NaN, Infinity, '2**', '0', '', undefined, null]) {
    assert.strictEqual(safeParseTradeId(bad), 0n, `Expected 0n for ${String(bad)}`);
  }
});

test('P3 Error classification: distinguishes Core Wallet rejection in Viem ContractFunctionExecutionError', () => {
  const rejectedCause = new UserRejectedRequestError(new Error('User rejected the request.'));
  const viemErr = new ContractFunctionExecutionError(rejectedCause, {
    abi: [],
    address: '0x0000000000000000000000000000000000000001',
    functionName: 'deposit',
    args: [2n],
  });

  assert.strictEqual(isTxUserRejected(viemErr), true);
  const classified = classifyContractError(viemErr);
  assert.strictEqual(classified.category, 'user_rejected');
  assert.strictEqual(classified.isUserRejected, true);
  assert.ok(classified.message.includes('Bạn đã từ chối ký giao dịch trên ví'));
  assert.strictEqual(getReadableError(viemErr), classified.message);

  // Additional provider variants
  assert.strictEqual(classifyContractError({ code: 4001, message: 'User denied transaction signature.' }).category, 'user_rejected');
  assert.strictEqual(classifyContractError({ details: 'Action rejected by user' }).category, 'user_rejected');
  assert.strictEqual(classifyContractError({ message: 'Transaction declined in Core Wallet' }).category, 'user_rejected');
  assert.strictEqual(classifyContractError({ message: 'User canceled request' }).category, 'user_rejected');
});

test('P3 Error classification: distinguishes Smart Contract reverts from RPC/network failures', () => {
  const revertErr = new ContractFunctionExecutionError(
    new Error('Execution reverted with reason: wrong deposit amount'),
    {
      abi: [],
      address: '0x0000000000000000000000000000000000000001',
      functionName: 'deposit',
      args: [2n],
    }
  );
  const classifiedRevert = classifyContractError(revertErr);
  assert.strictEqual(classifiedRevert.category, 'contract_revert');
  assert.strictEqual(classifiedRevert.isUserRejected, false);
  assert.strictEqual(classifiedRevert.message, 'Số tiền nạp cọc không khớp với số tiền yêu cầu.');

  const genericRevert = { name: 'ContractFunctionRevertedError', message: 'execution reverted' };
  assert.strictEqual(classifyContractError(genericRevert).category, 'contract_revert');

  const rpcHttpErr = new ContractFunctionExecutionError(
    Object.assign(new Error('HTTP request failed. Status: 503'), { name: 'HttpRequestError' }),
    {
      abi: [],
      address: '0x0000000000000000000000000000000000000001',
      functionName: 'deposit',
      args: [2n],
    }
  );
  const classifiedRpc = classifyContractError(rpcHttpErr);
  assert.strictEqual(classifiedRpc.category, 'rpc');
  assert.strictEqual(classifiedRpc.isUserRejected, false);
  assert.ok(classifiedRpc.message.includes('RPC'));

  const insufficientFunds = {
    name: 'ContractFunctionExecutionError',
    cause: { message: 'insufficient funds for intrinsic transaction cost' },
  };
  assert.strictEqual(classifyContractError(insufficientFunds).category, 'rpc');
});

test('P3 notifyWalletActionError: shows friendly toast.info with zero console.error on wallet rejection', () => {
  const calls = { info: [], error: [], consoleError: [], consoleWarn: [] };
  const mockSonner = {
    toast: {
      info: (msg, opts) => calls.info.push({ msg, opts }),
      error: (msg, opts) => calls.error.push({ msg, opts }),
    },
  };

  const restore = registerTsLoader({ sonner: mockSonner });
  const origConsoleError = console.error;
  const origConsoleWarn = console.warn;
  console.error = (...args) => calls.consoleError.push(args);
  console.warn = (...args) => calls.consoleWarn.push(args);

  try {
    delete require.cache[require.resolve('@/lib/wallet-toast')];
    const { notifyWalletActionError } = require('@/lib/wallet-toast');

    const rejected = new ContractFunctionExecutionError(
      new UserRejectedRequestError(new Error('User rejected the request.')),
      {
        abi: [],
        address: '0x0000000000000000000000000000000000000001',
        functionName: 'deposit',
        args: [2n],
      }
    );

    const resRejected = notifyWalletActionError(rejected, 'Thao tác thất bại', {
      toastId: 't-1',
      context: 'deposit',
    });

    assert.strictEqual(resRejected.isUserRejected, true);
    assert.strictEqual(calls.info.length, 1);
    assert.strictEqual(calls.error.length, 0);
    assert.strictEqual(calls.consoleError.length, 0);
    assert.strictEqual(calls.consoleWarn.length, 0);

    const reverted = { shortMessage: 'wrong deposit amount' };
    const resReverted = notifyWalletActionError(reverted, 'Thao tác thất bại', {
      toastId: 't-2',
      context: 'deposit',
    });

    assert.strictEqual(resReverted.category, 'contract_revert');
    assert.strictEqual(calls.error.length, 1);
    assert.strictEqual(
      calls.error[0].msg,
      'Thao tác thất bại: Số tiền nạp cọc không khớp với số tiền yêu cầu.'
    );
    assert.strictEqual(calls.consoleError.length, 0);
    assert.strictEqual(calls.consoleWarn.length, 1);
  } finally {
    console.error = origConsoleError;
    console.warn = origConsoleWarn;
    restore();
  }
});

test('Static regression: trade route pages validate route ID and tx catches avoid console.error overlays', () => {
  const tradePage = fs.readFileSync(path.join(FRONTEND_ROOT, 'app/trade/[id]/page.tsx'), 'utf8');
  const reportPage = fs.readFileSync(path.join(FRONTEND_ROOT, 'app/trade/[id]/report/page.tsx'), 'utf8');
  const useTradeHook = fs.readFileSync(path.join(FRONTEND_ROOT, 'hooks/useTrade.ts'), 'utf8');

  assert.ok(tradePage.includes('parseTradeIdParam(params?.id)'), 'trade/[id]/page.tsx must parse route ID safely');
  assert.ok(!/BigInt\(\s*tradeIdStr/.test(tradePage), 'trade/[id]/page.tsx must not pass raw tradeIdStr to BigInt()');
  assert.ok(reportPage.includes('parseTradeIdParam(params?.id)'), 'trade/[id]/report/page.tsx must parse route ID safely');
  assert.ok(!/BigInt\(\s*tradeIdStr/.test(reportPage), 'trade/[id]/report/page.tsx must not pass raw tradeIdStr to BigInt()');
  assert.ok(useTradeHook.includes('safeParseTradeId('), 'hooks/useTrade.ts must normalize tradeId safely');
  assert.ok(!/BigInt\(\s*tradeId/.test(useTradeHook), 'hooks/useTrade.ts must not pass unguarded tradeId to BigInt()');

  const txFiles = [
    'app/trade/[id]/page.tsx',
    'components/EvidenceUploader.tsx',
    'components/PendingWithdrawalBanner.tsx',
    'components/AgentStatusCard.tsx',
    'app/trade/new/page.tsx',
    'app/sell/page.tsx',
    'app/admin/page.tsx',
  ];

  for (const rel of txFiles) {
    const src = fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
    assert.ok(src.includes('notifyWalletActionError'), `${rel} must route wallet tx/sign errors through notifyWalletActionError`);
    assert.ok(!src.includes('console.error('), `${rel} must not use console.error (prevents Next.js Runtime Error overlay on wallet rejections)`);
  }
});
