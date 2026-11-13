import { http } from 'viem';
import { avalancheFuji, foundry } from 'viem/chains';
import { createConfig } from 'wagmi';
import { walletConnect } from 'wagmi/connectors';
import { localWalletConnector } from './local-wallet/connector';
import {
  createBrowserWalletConnector,
  WALLET_OPTIONS,
} from './wallet-providers';

// Anvil / Foundry local testnet chain (31337)
export const anvilChain = {
  ...foundry,
  name: 'Anvil Local',
  nativeCurrency: {
    decimals: 18,
    name: 'Avalanche',
    symbol: 'AVAX',
  },
} as const;

export const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 43113);
export const isAnvil = configuredChainId === 31337;
export const targetChain = isAnvil ? anvilChain : avalancheFuji;

const envProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
if (!envProjectId && typeof window !== 'undefined') {
  console.warn(
    '[wagmi] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not configured in .env.local; using fallback project ID for development.'
  );
}
export const walletConnectProjectId = envProjectId || '3a8170812b534d0ff9d794f19a901d64';

const browserWalletConnectors = WALLET_OPTIONS.filter(
  (w) => w.id !== 'walletConnect'
).map((w) => createBrowserWalletConnector(w));

export const wagmiConfig = createConfig({
  chains: [avalancheFuji, anvilChain],
  connectors: [
    ...browserWalletConnectors,
    walletConnect({
      projectId: walletConnectProjectId,
      showQrModal: false,
      metadata: {
        name: 'Escrow Marketplace',
        description: 'AI-Assisted Smart Contract Escrow Platform on Avalanche Fuji',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://escrow-marketplace.local',
        icons: [],
      },
    }),
    localWalletConnector(),
  ],
  multiInjectedProviderDiscovery: false,
  transports: {
    [avalancheFuji.id]: http('https://api.avax-test.network/ext/bc/C/rpc'),
    [anvilChain.id]: http('http://127.0.0.1:8545'),
  },
  ssr: true,
});
