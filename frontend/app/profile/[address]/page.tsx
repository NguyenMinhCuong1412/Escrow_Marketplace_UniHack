'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { isAddress } from 'viem';
import { useReputation } from '@/hooks/useReputation';
import { useMyTrades } from '@/hooks/useMyTrades';
import { AddressDisplay } from '@/components/AddressDisplay';
import { TradeList } from '@/components/TradeList';
import {
  User,
  ShieldCheck,
  Award,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { clsx } from 'clsx';

export default function ProfilePage() {
  const params = useParams();
  const addressParam = (params?.address as string) || '';
  const isValid = isAddress(addressParam);

  const { score: reputationScore, isLoading: isLoadingRep } = useReputation(
    isValid ? addressParam : undefined
  );
  const { trades, isLoading: isLoadingTrades } = useMyTrades(
    isValid ? addressParam : undefined
  );

  if (!isValid) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#F0B44D]/20 border border-[#F0B44D]/40 text-[#925E09] flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6 text-[#925E09]" />
        </div>
        <h2 className="text-xl font-bold text-[#17191F]">Địa chỉ ví không hợp lệ</h2>
        <p className="text-xs text-[#525866]">
          Vui lòng kiểm tra lại địa chỉ ví trên đường dẫn ({addressParam}).
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FFFFFF] hover:bg-[#F7F8FA] border border-[#E5E7EB] text-[#17191F] text-xs font-semibold shadow-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Về trang chủ
        </Link>
      </div>
    );
  }

  // Reputation tier label and colors
  let tierLabel = 'Uy tín bình thường';
  let tierBg = 'bg-[#3458D4]/10 border-[#3458D4]/25 text-[#3458D4]';
  let tierDesc = 'Người dùng tham gia giao dịch bình thường trên nền tảng.';
  if (reputationScore >= 70) {
    tierLabel = 'Uy tín rất cao';
    tierBg = 'bg-emerald-50 border-emerald-200 text-emerald-700';
    tierDesc = 'Có lịch sử hoàn tất nhiều giao dịch thành công, tỷ lệ tranh chấp thấp.';
  } else if (reputationScore < 40) {
    tierLabel = 'Cảnh báo rủi ro';
    tierBg = 'bg-red-50 border-red-200 text-red-700';
    tierDesc = 'Từng bị trọng tài xử phạt do vi phạm cam kết giao dịch.';
  }

  // Summary counts
  const totalCount = trades.length;
  const completedCount = trades.filter((t) => t.state === 4).length;
  const activeCount = trades.filter((t) => t.state < 4).length;

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-10">
      {/* Back button */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-[#525866] hover:text-[#17191F] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Quay lại trang chủ
        </Link>
      </div>

      {/* Profile Header & Reputation Card (AC-07) */}
      <div className="rounded-3xl border border-[#E5E7EB] bg-[#FFFFFF] p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-[#3458D4]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#3458D4] flex items-center justify-center text-white shadow-md shadow-[#3458D4]/20 flex-shrink-0">
              <User className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-[#17191F] tracking-tight">
                  Hồ Sơ Thành Viên Escrow
                </h1>
                <span className={clsx('text-xs font-semibold px-2.5 py-0.5 rounded-full border', tierBg)}>
                  {tierLabel}
                </span>
              </div>
              <div>
                <AddressDisplay address={addressParam} copyable explorerLink />
              </div>
              <p className="text-xs text-[#525866] pt-0.5">{tierDesc}</p>
            </div>
          </div>

          {/* Reputation Gauge Box */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#F7F8FA] border border-[#E5E7EB] flex items-center gap-5 sm:min-w-[240px]">
            <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-[#E5E7EB]"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className={clsx(
                    reputationScore >= 70
                      ? 'text-emerald-600'
                      : reputationScore >= 40
                      ? 'text-[#3458D4]'
                      : 'text-red-600'
                  )}
                  strokeDasharray={`${reputationScore}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-mono text-base font-extrabold text-[#17191F]">
                  {isLoadingRep ? '--' : reputationScore}
                </span>
              </div>
            </div>

            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold text-[#525866] flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-[#B47814]" />
                Điểm uy tín on-chain
              </span>
              <div className="text-base font-bold text-[#17191F] font-mono">
                {reputationScore} / 100
              </div>
              <span className="text-[10px] text-[#525866]">Mặc định ban đầu: 50</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 pt-6 border-t border-[#E5E7EB]">
          <div className="p-4 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] space-y-1">
            <span className="text-xs text-[#525866] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#3458D4]" />
              Tổng giao dịch tham gia
            </span>
            <div className="text-xl font-bold font-mono text-[#17191F]">{totalCount}</div>
          </div>

          <div className="p-4 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] space-y-1">
            <span className="text-xs text-[#525866] flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Giao dịch hoàn tất
            </span>
            <div className="text-xl font-bold font-mono text-emerald-700">{completedCount}</div>
          </div>

          <div className="p-4 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] space-y-1">
            <span className="text-xs text-[#525866] flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#B47814]" />
              Giao dịch đang diễn ra
            </span>
            <div className="text-xl font-bold font-mono text-[#925E09]">{activeCount}</div>
          </div>
        </div>
      </div>

      {/* Trade History Section (AC-07) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#17191F] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#3458D4]" />
            Lịch Sử Giao Dịch Liên Quan
          </h2>
          <span className="text-xs font-mono text-[#525866]">
            {trades.length} giao dịch
          </span>
        </div>

        <TradeList
          trades={trades}
          isLoading={isLoadingTrades}
          filterAddress={addressParam}
          emptyMessage="Địa chỉ ví này chưa có giao dịch nào được ghi nhận trên hợp đồng."
        />
      </div>
    </div>
  );
}
