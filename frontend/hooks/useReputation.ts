'use client';

import { useReadContract } from 'wagmi';
import { escrowAddress, escrowAbi } from '@/lib/contracts';
import { isAddress } from 'viem';

export function useReputation(address?: string | null) {
  const validAddress = Boolean(address && isAddress(address));

  const { data, isLoading, isError, refetch } = useReadContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: 'reputationOf',
    args: validAddress ? [address as `0x${string}`] : undefined,
    query: {
      enabled: validAddress && escrowAddress !== '0x0000000000000000000000000000000000000000',
      staleTime: 10000,
    },
  });

  const score = data !== undefined ? Number(data) : 50; // Initial default is 50

  return {
    score,
    isLoading,
    isError,
    refetch,
  };
}
