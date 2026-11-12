import { http } from 'viem';
import { avalancheFuji, foundry } from 'viem/chains';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

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

export const wagmiConfig = getDefaultConfig({
  appName: 'Escrow Marketplace',
  projectId: walletConnectProjectId,
  chains: [avalancheFuji, anvilChain],
  transports: {
    [avalancheFuji.id]: http('https://api.avax-test.network/ext/bc/C/rpc'),
    [anvilChain.id]: http('http://127.0.0.1:8545'),
  },
  ssr: true,
});
