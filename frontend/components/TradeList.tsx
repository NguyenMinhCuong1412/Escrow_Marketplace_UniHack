'use client';

import React from 'react';
import Link from 'next/link';
import { TradeData } from '@/types/trade';
import { StateBadge } from '@/components/StateBadge';
import { AddressDisplay } from '@/components/AddressDisplay';
import { AvaxAmount } from '@/components/AvaxAmount';
import { CountdownTimer } from '@/components/CountdownTimer';
import { PlusCircle, ArrowRight, PackageOpen } from 'lucide-react';
import { useAccount } from 'wagmi';

interface TradeListProps {
  trades: TradeData[];
  isLoading?: boolean;
  filterAddress?: string;
  emptyMessage?: string;
}

export const TradeList: React.FC<TradeListProps> = ({
  trades,
  isLoading,
  filterAddress,
  emptyMessage = 'Bạn chưa có giao dịch nào được tạo.',
}) => {
  const { address } = useAccount();
  const currentAddress = (filterAddress || address || '').toLowerCase();

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center space-y-3">
        <div className="inline-block w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Đang tải danh sách giao dịch từ Smart Contract...</p>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 p-10 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto">
          <PackageOpen className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h4 className="text-base font-semibold text-white">Chưa có giao dịch</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">{emptyMessage}</p>
        </div>
        <Link
          href="/trade/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-semibold shadow-md active:scale-95 transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          Tạo giao dịch mới
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800">
          <tr>
            <th className="py-3.5 px-4 font-semibold">#ID</th>
            <th className="py-3.5 px-4 font-semibold">Vai trò</th>
            <th className="py-3.5 px-4 font-semibold">Đối tác</th>
            <th className="py-3.5 px-4 font-semibold">Giá trị món hàng</th>
            <th className="py-3.5 px-4 font-semibold">Cọc yêu cầu (30%)</th>
            <th className="py-3.5 px-4 font-semibold">Trạng thái</th>
            <th className="py-3.5 px-4 font-semibold">Thời hạn</th>
            <th className="py-3.5 px-4 font-semibold text-right">Chi tiết</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80">
          {trades.map((trade) => {
            const isSeller = trade.seller.toLowerCase() === currentAddress;
            const isBuyer = trade.buyer.toLowerCase() === currentAddress;
            const partnerAddress = isSeller ? trade.buyer : isBuyer ? trade.seller : trade.seller;

            // Relevant deadline
            let activeDeadline: bigint | null = null;
            let deadlineLabel = '';
            if (trade.state === 1 && trade.evidenceDeadline > 0n) {
              activeDeadline = trade.evidenceDeadline;
              deadlineLabel = 'Hạn bằng chứng';
            } else if (trade.state === 2 && trade.disputeDeadline > 0n) {
              activeDeadline = trade.disputeDeadline;
              deadlineLabel = 'Hạn khiếu nại';
            }

            return (
              <tr
                key={trade.id.toString()}
                className="hover:bg-slate-800/40 transition-colors group"
              >
                <td className="py-3.5 px-4 font-mono font-bold text-white">
                  #{trade.id.toString()}
                </td>
                <td className="py-3.5 px-4">
                  {isSeller ? (
                    <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Người bán
                    </span>
                  ) : isBuyer ? (
                    <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      Người mua
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
                      Khách xem
                    </span>
                  )}
                </td>
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-1.5">
                    <AddressDisplay address={partnerAddress} copyable={false} />
                    <Link
                      href={`/profile/${partnerAddress}`}
                      className="text-[10px] text-indigo-400 hover:underline"
                    >
                      (Hồ sơ)
                    </Link>
                  </div>
                </td>
                <td className="py-3.5 px-4 font-medium">
                  <AvaxAmount amountWei={trade.itemValue} size="sm" />
                </td>
                <td className="py-3.5 px-4 font-medium">
                  <AvaxAmount amountWei={trade.depositRequired} size="sm" />
                </td>
                <td className="py-3.5 px-4">
                  <StateBadge state={trade.state} flagged={trade.flagged} />
                </td>
                <td className="py-3.5 px-4">
                  {activeDeadline ? (
                    <CountdownTimer deadline={activeDeadline} label={deadlineLabel} />
                  ) : (
                    <span className="text-slate-500">--</span>
                  )}
                </td>
                <td className="py-3.5 px-4 text-right">
                  <Link
                    href={`/trade/${trade.id.toString()}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium transition-all group-hover:border-slate-600 border border-transparent"
                  >
                    Xem
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default TradeList;
