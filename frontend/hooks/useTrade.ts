'use client';

import { useAccount, useReadContract } from 'wagmi';
import { escrowAddress, escrowAbi } from '@/lib/contracts';
import { TradeData, TradeRole } from '@/types/trade';
import { formatNonceShort } from '@/lib/format';

export function useTrade(tradeId: bigint | number | string) {
  const { address } = useAccount();
  const idBigInt = BigInt(tradeId || 0);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useReadContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: 'getTrade',
    args: [idBigInt],
    query: {
      enabled: idBigInt > 0n && escrowAddress !== '0x0000000000000000000000000000000000000000',
      refetchInterval: (query) => {
        const raw = query.state.data as any;
        if (!raw) return 4000;
        const state = typeof raw.state === 'number' ? raw.state : raw[15];
        return state !== undefined && state < 4 ? 4000 : false;
      },
    },
  });

  let trade: TradeData | null = null;

  if (data) {
    const raw = data as any;
    // Viem returns object with named properties or tuple
    const seller = (raw.seller || raw[0] || '0x0000000000000000000000000000000000000000') as `0x${string}`;
    const buyer = (raw.buyer || raw[1] || '0x0000000000000000000000000000000000000000') as `0x${string}`;

    trade = {
      id: idBigInt,
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
  }

  const exists = Boolean(
    trade &&
    trade.seller !== '0x0000000000000000000000000000000000000000' &&
    trade.seller !== '0x'
  );

  let role: TradeRole = 'viewer';
  if (address && trade) {
    const current = address.toLowerCase();
    if (trade.seller.toLowerCase() === current) {
      role = 'seller';
    } else if (trade.buyer.toLowerCase() === current) {
      role = 'buyer';
    }
  }

  const nonceShort = trade?.nonce ? formatNonceShort(trade.nonce) : '';

  return {
    trade,
    role,
    exists,
    isLoading,
    isError,
    error,
    nonceShort,
    refetch,
  };
}
