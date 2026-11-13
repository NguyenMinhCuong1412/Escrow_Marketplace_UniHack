'use client';

import React, { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi';
import { escrowAddress, escrowAbi } from '@/lib/contracts';
import { formatAvax } from '@/lib/format';
import { getReadableError } from '@/lib/errors';
import { Coins, ArrowDownToLine, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export const PendingWithdrawalBanner: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: rawPending, refetch } = useReadContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: 'pendingWithdrawals',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(mounted && isConnected && address && escrowAddress !== '0x0000000000000000000000000000000000000000'),
      refetchInterval: 6000,
    },
  });

  const pendingAmount = rawPending ? BigInt(rawPending as any) : 0n;

  if (!mounted || !isConnected || pendingAmount <= 0n) {
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
    <div className="bg-[#3458D4] text-white px-4 py-2.5 shadow-md border-b border-[#2947B5] animate-in slide-in-from-top">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2 font-medium">
          <Coins className="w-5 h-5 flex-shrink-0 text-[#F0B44D]" />
          <span>
            Bạn có <strong className="underline underline-offset-2">{formatAvax(pendingAmount)} AVAX</strong> đang chờ rút từ các khoản hoàn cọc hoặc tiền bồi thường!
          </span>
        </div>
        <button
          type="button"
          onClick={handleWithdraw}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white text-[#3458D4] hover:bg-[#F7F8FA] font-bold text-xs active:scale-95 transition-all shadow-sm disabled:opacity-50 flex-shrink-0"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownToLine className="w-3.5 h-3.5" />}
          {isPending ? 'Đang rút...' : 'Rút tiền ngay'}
        </button>
      </div>
    </div>
  );
};

export default PendingWithdrawalBanner;
