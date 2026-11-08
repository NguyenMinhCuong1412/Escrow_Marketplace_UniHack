'use client';

import React from 'react';
import Link from 'next/link';
import { StateBadge } from '@/components/StateBadge';
import { AddressDisplay } from '@/components/AddressDisplay';
import { AvaxAmount } from '@/components/AvaxAmount';
import { escrowAddress, tokenAddress, chainId, deployBlock } from '@/lib/contracts';
import { targetChain } from '@/lib/wagmi';
import {
  ShieldCheck,
  PlusCircle,
  Lock,
  Camera,
  Cpu,
  ArrowRight,
  Layers,
  Sparkles,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="space-y-16 py-4">
      {/* Hero Section */}
      <section className="text-center space-y-6 pt-6 pb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Bảo vệ giao dịch vật phẩm sưu tầm với AI & Smart Contract</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-tight">
          Mua bán đồ sưu tầm <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-rose-500 via-red-400 to-amber-300 bg-clip-text text-transparent">
            không cần trung gian
          </span>
        </h1>

        <p className="text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
          AI xác thực bằng chứng, hợp đồng tự giải ngân. Đảm bảo an toàn tài sản cho cả người mua và người bán trên mạng Avalanche.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link
            href="/trade/new"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold shadow-lg shadow-red-500/25 active:scale-95 transition-all text-sm"
          >
            <PlusCircle className="w-4 h-4" />
            Tạo giao dịch
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium border border-slate-700 text-sm transition-all"
          >
            Tìm hiểu cách hoạt động
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* 3 "Cách hoạt động" feature cards */}
      <section id="how-it-works" className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white tracking-tight">Cách hoạt động</h2>
          <p className="text-sm text-slate-400">
            Quy trình giao dịch an toàn 3 bước bảo vệ cả hai bên thông qua ký quỹ và thị giác máy tính
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">1. Cọc 30% hai bên</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Cả người mua và người bán đều đặt cọc ký quỹ (escrow deposit) để đảm bảo cam kết, ngăn chặn hủy kèo hoặc tráo hàng.
            </p>
          </div>

          {/* Card 2 */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors space-y-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <Camera className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">2. Chụp ảnh kèm nonce</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Bằng chứng đóng gói và mở hộp bắt buộc kèm mã nonce ngẫu nhiên hiển thị cùng vật phẩm, chống giả mạo và tái sử dụng ảnh.
            </p>
          </div>

          {/* Card 3 */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">3. AI kiểm tra &amp; giải ngân</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              AI thị giác đối chiếu ngoại quan sản phẩm với listing niêm yết trên IPFS; hợp đồng tự động release tiền và hoàn cọc khi hợp lệ.
            </p>
          </div>
        </div>
      </section>

      {/* Component Showcase & Design System Section (AC-08) */}
      <section className="space-y-6 pt-4 border-t border-slate-800/80">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-rose-500" />
              Design System &amp; Thành phần cốt lõi
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Xác nhận các UI components hiển thị trạng thái hợp đồng, địa chỉ và giá trị AVAX
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* State Badges Showcase */}
          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
            <div className="text-sm font-semibold text-slate-300">
              Trạng thái hợp đồng ký quỹ (StateBadge — 6 states):
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <StateBadge state={0} />
              <StateBadge state={1} />
              <StateBadge state={2} />
              <StateBadge state={3} />
              <StateBadge state={4} />
              <StateBadge state={5} />
              <StateBadge state={5} flagged />
            </div>
          </div>

          {/* Address & Currency Showcase */}
          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-300">Hiển thị địa chỉ (AddressDisplay):</div>
              <div className="flex flex-wrap items-center gap-3">
                <AddressDisplay address="0x70997970C51812dc3A010C7d01b50e0d17dc79C8" />
                <AddressDisplay address={escrowAddress} />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <div className="text-sm font-semibold text-slate-300">Hiển thị số tiền (AvaxAmount):</div>
              <div className="flex items-baseline gap-4">
                <AvaxAmount amountWei={BigInt('500000000000000000')} size="sm" />
                <AvaxAmount amountWei={BigInt('1250000000000000000')} size="md" />
                <AvaxAmount amountWei={BigInt('10000000000000000000')} size="lg" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Network & Contract Deployment Info */}
      <section className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5 text-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Cấu hình Mạng &amp; Smart Contract Ký Quỹ
          </span>
          <span className="text-slate-400 font-mono">
            Chain ID: {chainId} ({targetChain.name})
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
          <div>
            <div className="text-slate-500 mb-1">Escrow Address:</div>
            <AddressDisplay address={escrowAddress} copyable explorerLink />
          </div>
          <div>
            <div className="text-slate-500 mb-1">Token Address:</div>
            <AddressDisplay address={tokenAddress} copyable explorerLink />
          </div>
          <div>
            <div className="text-slate-500 mb-1">Deploy Block:</div>
            <div className="text-slate-300 py-1">{deployBlock.toString()}</div>
          </div>
          <div>
            <div className="text-slate-500 mb-1">Target Network:</div>
            <div className="text-emerald-400 py-1 font-semibold">{targetChain.name}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
