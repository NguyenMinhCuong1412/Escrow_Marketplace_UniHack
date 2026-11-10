'use client';

import React, { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi';
import { escrowAddress, escrowAbi } from '@/lib/contracts';
import { formatAvax } from '@/lib/format';
import { getReadableError } from '@/lib/errors';
import { Coins, ArrowDownToLine, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export const PendingWithdrawalBanner: React.FC = () => {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [isPending, setIsPending] = useState(false);

  const { data: rawPending, refetch } = useReadContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: 'pendingWithdrawals',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(isConnected && address && escrowAddress !== '0x0000000000000000000000000000000000000000'),
      refetchInterval: 6000,
    },
  });

  const pendingAmount = rawPending ? BigInt(rawPending as any) : 0n;

  if (!isConnected || pendingAmount <= 0n) {
    return null;
  }

  const handleWithdraw = async () => {
    setIsPending(true);
    const toastId = toast.loading('Đang chuẩn bị rút tiền về ví...');
    try {
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'withdraw',
      } as any);

      toast.loading('Đang chờ xác nhận giao dịch rút tiền...', { id: toastId });

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== 'success') {
          throw new Error('Giao dịch rút tiền bị revert.');
        }
      }

      toast.success(`Đã rút thành công ${formatAvax(pendingAmount)} AVAX về ví!`, { id: toastId });
      await refetch();
    } catch (err) {
      console.error('Withdraw error:', err);
      toast.error(`Rút tiền thất bại: ${getReadableError(err)}`, { id: toastId });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-amber-600 to-rose-600 text-white px-4 py-2.5 shadow-lg border-b border-amber-400/30 animate-in slide-in-from-top">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2 font-medium">
          <Coins className="w-5 h-5 flex-shrink-0 text-amber-200" />
          <span>
            Bạn có <strong className="underline underline-offset-2">{formatAvax(pendingAmount)} AVAX</strong> đang chờ rút từ các khoản hoàn cọc hoặc giải ngân!
          </span>
        </div>
        <button
          type="button"
          onClick={handleWithdraw}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white text-rose-700 font-bold text-xs hover:bg-amber-50 active:scale-95 transition-all shadow-md disabled:opacity-50 flex-shrink-0"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownToLine className="w-3.5 h-3.5" />}
          {isPending ? 'Đang rút...' : 'Rút tiền ngay'}
        </button>
      </div>
    </div>
  );
};

export default PendingWithdrawalBanner;
