import {
  createConnector,
  type Connector,
} from 'wagmi';
import {
  type Address,
  type Hex,
  createWalletClient,
  custom,
  fromHex,
  getAddress,
  http,
  numberToHex,
  stringToHex,
  UserRejectedRequestError,
  RpcRequestError,
  type EIP1193RequestFn,
} from 'viem';
import { avalancheFuji, foundry } from 'viem/chains';
import {
  getActiveLocalAccount,
  lockLocalWallet,
  requestUserConfirmation,
  subscribeLocalWalletSession,
} from './session';
import type { ConfirmationRequest } from './types';

export const LOCAL_WALLET_CONNECTOR_ID = 'local-wallet';

export function localWalletConnector() {
  return createConnector<any>((config) => {
    let connectedChainId = config.chains[0]?.id || 43113;

    function getRpcUrl(chainId: number): string {
      const chain = config.chains.find((c) => c.id === chainId);
      if (chain?.rpcUrls?.default?.http?.[0]) {
        return chain.rpcUrls.default.http[0];
      }
      return chainId === 31337
        ? 'http://127.0.0.1:8545'
        : 'https://api.avax-test.network/ext/bc/C/rpc';
    }

    // Subscribe to in-memory session changes (e.g. lock/unlock)
    subscribeLocalWalletSession(() => {
      const account = getActiveLocalAccount();
      if (!account) {
        config.emitter.emit('disconnect');
      } else {
        config.emitter.emit('change', {
          accounts: [getAddress(account.address)],
        });
      }
    });

    return {
      id: LOCAL_WALLET_CONNECTOR_ID,
      name: 'Ví thiết bị (Local Wallet)',
      type: 'localWallet',

      async setup() {
        connectedChainId = config.chains[0]?.id || 43113;
      },

      async connect({ chainId } = {}) {
        const account = getActiveLocalAccount();
        if (!account) {
          throw new UserRejectedRequestError(
            new Error('Ví thiết bị chưa được mở khóa. Vui lòng mở khóa ví bằng mật khẩu.')
          );
        }

        if (chainId && config.chains.some((c) => c.id === chainId)) {
          connectedChainId = chainId;
        }

        const address = getAddress(account.address);
        return {
          accounts: [address] as any,
          chainId: connectedChainId,
        };
      },

      async disconnect() {
        lockLocalWallet();
        config.emitter.emit('disconnect');
      },

      async getAccounts() {
        const account = getActiveLocalAccount();
        if (!account) return [];
        return [getAddress(account.address)];
      },

      async getChainId() {
        return connectedChainId;
      },

      async isAuthorized() {
        return !!getActiveLocalAccount();
      },

      async switchChain({ chainId }) {
        const targetChain = config.chains.find((c) => c.id === chainId);
        if (!targetChain) {
          throw new UserRejectedRequestError(new Error(`Mạng ${chainId} chưa được cấu hình.`));
        }
        connectedChainId = chainId;
        config.emitter.emit('change', { chainId: connectedChainId });
        return targetChain;
      },

      onAccountsChanged(accounts) {
        if (!accounts || accounts.length === 0) {
          this.onDisconnect();
        } else {
          config.emitter.emit('change', {
            accounts: accounts.map((x) => getAddress(x)),
          });
        }
      },

      onChainChanged(chain) {
        connectedChainId = Number(chain);
        config.emitter.emit('change', { chainId: connectedChainId });
      },

      async onDisconnect() {
        lockLocalWallet();
        config.emitter.emit('disconnect');
      },

      async getProvider() {
        const rpcUrl = getRpcUrl(connectedChainId);
        const currentChain = config.chains.find((c) => c.id === connectedChainId) || config.chains[0];

        const request: EIP1193RequestFn = async ({ method, params }: { method: string; params?: any }) => {
          const account = getActiveLocalAccount();

          // 1. Account queries
          if (method === 'eth_accounts') {
            return account ? [getAddress(account.address)] : [];
          }

          if (method === 'eth_requestAccounts') {
            if (!account) {
              throw new UserRejectedRequestError(
                new Error('Ví thiết bị chưa được mở khóa. Vui lòng mở khóa ví bằng mật khẩu.')
              );
            }
            return [getAddress(account.address)];
          }

          // 2. Chain queries
          if (method === 'eth_chainId') {
            return numberToHex(connectedChainId);
          }

          if (method === 'net_version') {
            return connectedChainId.toString();
          }

          // 3. Chain switching
          if (method === 'wallet_switchEthereumChain') {
            const targetHex = params?.[0]?.chainId;
            if (targetHex) {
              const targetId = fromHex(targetHex, 'number');
              const found = config.chains.find((c) => c.id === targetId);
              if (found) {
                connectedChainId = targetId;
                config.emitter.emit('change', { chainId: connectedChainId });
                return null;
              }
            }
            throw new UserRejectedRequestError(new Error('Chuyển mạng thất bại.'));
          }

          // 4. Message signature - REQUIRE EXPLICIT USER CONFIRMATION (Requirement 8)
          if (method === 'personal_sign' || method === 'eth_sign') {
            if (!account) {
              throw new UserRejectedRequestError(new Error('Ví thiết bị chưa được mở khóa.'));
            }

            const rawMsg = (method === 'personal_sign' ? params?.[0] : params?.[1]) || '';
            let readableMsg = String(rawMsg);
            if (typeof rawMsg === 'string' && rawMsg.startsWith('0x')) {
              try {
                const dec = new TextDecoder();
                readableMsg = dec.decode(hexToBytes(rawMsg as Hex));
              } catch {
                readableMsg = rawMsg;
              }
            }

            const confirmed = await new Promise<boolean>((resolve) => {
              const req: ConfirmationRequest = {
                id: `sig-${Date.now()}`,
                type: 'personal_sign',
                chainId: connectedChainId,
                from: getAddress(account.address),
                message: readableMsg,
                rawMessage: rawMsg,
                createdAt: Date.now(),
                resolve,
              };
              requestUserConfirmation(req).then(resolve);
            });

            if (!confirmed) {
              throw new UserRejectedRequestError(new Error('Người dùng đã từ chối ký thông điệp.'));
            }

            return account.signMessage({
              message: typeof rawMsg === 'string' && rawMsg.startsWith('0x') ? { raw: rawMsg as Hex } : readableMsg,
            });
          }

          // 5. Typed Data signature - REQUIRE EXPLICIT USER CONFIRMATION (Requirement 8)
          if (method === 'eth_signTypedData_v4' || method === 'eth_signTypedData') {
            if (!account) {
              throw new UserRejectedRequestError(new Error('Ví thiết bị chưa được mở khóa.'));
            }

            const typedDataRaw = params?.[1];
            const parsedData = typeof typedDataRaw === 'string' ? JSON.parse(typedDataRaw) : typedDataRaw;

            const confirmed = await new Promise<boolean>((resolve) => {
              const req: ConfirmationRequest = {
                id: `td-${Date.now()}`,
                type: 'signTypedData',
                chainId: connectedChainId,
                from: getAddress(account.address),
                typedData: parsedData,
                createdAt: Date.now(),
                resolve,
              };
              requestUserConfirmation(req).then(resolve);
            });

            if (!confirmed) {
              throw new UserRejectedRequestError(new Error('Người dùng đã từ chối ký typed data.'));
            }

            return account.signTypedData(parsedData);
          }

          // 6. Send transaction - REQUIRE EXPLICIT USER CONFIRMATION (Requirement 8)
          if (method === 'eth_sendTransaction') {
            if (!account) {
              throw new UserRejectedRequestError(new Error('Ví thiết bị chưa được mở khóa.'));
            }

            const txParams = params?.[0] || {};
            const toAddress = txParams.to ? getAddress(txParams.to) : undefined;
            const valueBigInt = txParams.value ? fromHex(txParams.value, 'bigint') : undefined;
            const dataHex = txParams.data as Hex | undefined;

            const confirmed = await new Promise<boolean>((resolve) => {
              const req: ConfirmationRequest = {
                id: `tx-${Date.now()}`,
                type: 'sendTransaction',
                chainId: connectedChainId,
                from: getAddress(account.address),
                to: toAddress,
                value: valueBigInt,
                data: dataHex,
                gas: txParams.gas ? fromHex(txParams.gas, 'bigint') : undefined,
                maxFeePerGas: txParams.maxFeePerGas ? fromHex(txParams.maxFeePerGas, 'bigint') : undefined,
                maxPriorityFeePerGas: txParams.maxPriorityFeePerGas
                  ? fromHex(txParams.maxPriorityFeePerGas, 'bigint')
                  : undefined,
                createdAt: Date.now(),
                resolve,
              };
              requestUserConfirmation(req).then(resolve);
            });

            if (!confirmed) {
              throw new UserRejectedRequestError(new Error('Người dùng đã từ chối giao dịch.'));
            }

            // Create temporary wallet client to sign and broadcast transaction
            const client = createWalletClient({
              account,
              chain: currentChain,
              transport: http(rpcUrl),
            });

            const txHash = await client.sendTransaction({
              to: toAddress,
              value: valueBigInt,
              data: dataHex,
              gas: txParams.gas ? fromHex(txParams.gas, 'bigint') : undefined,
              maxFeePerGas: txParams.maxFeePerGas ? fromHex(txParams.maxFeePerGas, 'bigint') : undefined,
              maxPriorityFeePerGas: txParams.maxPriorityFeePerGas
                ? fromHex(txParams.maxPriorityFeePerGas, 'bigint')
                : undefined,
            });

            return txHash;
          }

          // 7. Proxy all other RPC methods to RPC endpoint
          const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method,
              params: params || [],
            }),
          });

          const result = await response.json();
          if (result.error) {
            throw new RpcRequestError({
              body: { method, params },
              error: result.error,
              url: rpcUrl,
            });
          }

          return result.result;
        };

        return { request };
      },
    };
  });
}

function hexToBytes(hex: Hex): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * RainbowKit wallet integration object
 */
export const rainbowKitLocalWallet = () => ({
  id: LOCAL_WALLET_CONNECTOR_ID,
  name: 'Ví thiết bị (Local Wallet)',
  iconUrl: '/favicon.ico',
  iconBackground: '#4f46e5',
  createConnector: (_walletDetails: any) => localWalletConnector(),
});
