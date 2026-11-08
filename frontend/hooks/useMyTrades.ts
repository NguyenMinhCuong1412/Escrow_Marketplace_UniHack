'use client';

import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { escrowAddress, escrowAbi } from '@/lib/contracts';
import { TradeData } from '@/types/trade';
import { useMemo } from 'react';

export function useMyTrades(targetAddress?: string | null) {
  const { address: connectedAddress } = useAccount();
  const filterAddress = (targetAddress || connectedAddress || '').toLowerCase();

  // 1. Read nextTradeId
  const {
    data: rawNextTradeId,
    isLoading: isLoadingNextId,
    refetch: refetchNextId,
  } = useReadContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: 'nextTradeId',
    query: {
      enabled: escrowAddress !== '0x0000000000000000000000000000000000000000',
      staleTime: 5000,
      refetchInterval: 5000,
    },
  });

  const nextTradeId = rawNextTradeId ? Number(rawNextTradeId) : 1;

  // 2. Prepare contracts array for all trade IDs: 1 .. nextTradeId - 1
  const contracts = useMemo(() => {
    const list = [];
    for (let id = 1; id < nextTradeId; id++) {
      list.push({
        address: escrowAddress,
        abi: escrowAbi as any,
        functionName: 'getTrade',
        args: [BigInt(id)],
      });
    }
    return list;
  }, [nextTradeId]);

  // 3. Batch read trades
  const {
    data: rawTrades,
    isLoading: isLoadingTrades,
    refetch: refetchTrades,
  } = useReadContracts({
    contracts,
    query: {
      enabled: contracts.length > 0,
      staleTime: 5000,
    },
  });

  // 4. Parse & filter trades
  const trades = useMemo(() => {
    if (!rawTrades || rawTrades.length === 0) return [];

    const parsed: TradeData[] = [];
    rawTrades.forEach((res, index) => {
      if (res.status === 'success' && res.result) {
        const raw = res.result as any;
        const id = BigInt(index + 1);
        const seller = (raw.seller || raw[0] || '0x0000000000000000000000000000000000000000') as `0x${string}`;
        const buyer = (raw.buyer || raw[1] || '0x0000000000000000000000000000000000000000') as `0x${string}`;

        // Verify trade exists
        if (seller === '0x0000000000000000000000000000000000000000' || seller === '0x') {
          return;
        }

        const tradeObj: TradeData = {
          id,
          seller,
          buyer,
          itemValue: BigInt(raw.itemValue || raw[2] || 0),
          depositRequired: BigInt(raw.depositRequired || raw[3] || 0),
          sellerDeposit: BigInt(raw.sellerDeposit || raw[4] || 0),
          buyerDeposit: BigInt(raw.buyerDeposit || raw[5] || 0),
          nonce: (raw.nonce || raw[6] || '0x') as `0x${string}`,
          sellerEvidenceHash: (raw.sellerEvidenceHash || raw[7] || '0x') as `0x${string}`,
          buyerEvidenceHash: (raw.buyerEvidenceHash || raw[8] || '0x') as `0x${string}`,
          reportHash: (raw.reportHash || raw[9] || '0x') as `0x${string}`,
          riskScore: Number(raw.riskScore || raw[10] || 0),
          flagged: Boolean(raw.flagged !== undefined ? raw.flagged : raw[11]),
          createdAt: BigInt(raw.createdAt || raw[12] || 0),
          evidenceDeadline: BigInt(raw.evidenceDeadline || raw[13] || 0),
          disputeDeadline: BigInt(raw.disputeDeadline || raw[14] || 0),
          state: Number(raw.state !== undefined ? raw.state : raw[15] || 0),
        };

        // Filter if address is specified
        if (filterAddress) {
          if (
            seller.toLowerCase() === filterAddress ||
            buyer.toLowerCase() === filterAddress
          ) {
            parsed.push(tradeObj);
          }
        } else {
          parsed.push(tradeObj);
        }
      }
    });

    // Sort descending by ID (newest first)
    return parsed.sort((a, b) => (b.id > a.id ? 1 : -1));
  }, [rawTrades, filterAddress]);

  const refetch = () => {
    refetchNextId();
    refetchTrades();
  };

  return {
    trades,
    totalCreated: nextTradeId - 1,
    isLoading: isLoadingNextId || isLoadingTrades,
    refetch,
  };
}
