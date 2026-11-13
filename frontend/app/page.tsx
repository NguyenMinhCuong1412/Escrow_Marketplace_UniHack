'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useMyTrades } from '@/hooks/useMyTrades';
import { TradeList } from '@/components/TradeList';
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
  Layers,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const { isConnected, status } = useAccount();
  const { trades, isLoading: isLoadingTrades } = useMyTrades();

  useEffect(() => {
    setMounted(true);
  }, []);

  // AUTH-01 Requirement 3: Không hiển thị giao diện Marketplace trước khi hoàn tất luồng xác thực
  useEffect(() => {
    if (mounted && status === 'disconnected') {
      router.replace('/auth');
    }
  }, [mounted, status, router]);

  if (!mounted || !isConnected) {
    return (
      <div className="min-h-[55vh] flex flex-col items-center justify-center text-center space-y-5 py-16 animate-in fade-in duration-200">
        <div className="w-14 h-14 rounded-2xl bg-[#3458D4] text-white flex items-center justify-center shadow-md shadow-[#3458D4]/20">
          <ShieldCheck className="w-8 h-8 animate-pulse" />
        </div>
        <div className="space-y-1.5 max-w-md">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-[#F0B44D]/20 text-[#8A5A00] border border-[#F0B44D]/50 mb-1">
            <span>Cần xác thực ví để truy cập</span>
          </div>
          <h2 className="text-xl font-bold text-[#17191F]">
            Chào mừng đến với Escrow Marketplace
          </h2>
          <p className="text-xs sm:text-sm text-[#525866] leading-relaxed">
            Vui lòng xác thực ví tại Cổng xác thực để bắt đầu tạo hoặc quản lý các giao dịch ký quỹ bảo vệ bởi AI.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white font-bold text-xs sm:text-sm shadow-md shadow-[#3458D4]/20 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] focus-visible:ring-offset-2"
          >
            <span>Đến Cổng xác thực (/auth)</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-16 py-4">
      {/* Hero Section */}
      <section className="text-center space-y-6 pt-6 pb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#F0B44D]/20 text-[#8A5A00] border border-[#F0B44D]/50">
          <Sparkles className="w-3.5 h-3.5 text-[#B47814]" />
          <span>Bảo vệ giao dịch vật phẩm sưu tầm với AI & Smart Contract</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#17191F] max-w-4xl mx-auto leading-tight">
          Mua bán đồ sưu tầm <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-[#3458D4] via-[#2947B5] to-[#D9901A] bg-clip-text text-transparent">
            bảo vệ bằng tiền cọc
          </span>
        </h1>

        <p className="text-lg text-[#525866] max-w-2xl mx-auto leading-relaxed">
          Ký quỹ cọc hai bên. AI chỉ xác thực bằng chứng và ghi kết quả on-chain (attest). Khi hết thời gian khiếu nại, giao dịch không bị gắn cờ và không có khiếu nại, bất kỳ ai cũng có thể kích hoạt hoàn cọc; tranh chấp do trọng tài xử lý.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link
            href="/trade/new"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white font-semibold shadow-md shadow-[#3458D4]/20 active:scale-95 transition-all text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] focus-visible:ring-offset-2"
          >
            <PlusCircle className="w-4 h-4" />
            Tạo giao dịch
          </Link>
        </div>
      </section>

      {/* 3 "Cách hoạt động" feature cards */}
      <section id="how-it-works" className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-[#17191F] tracking-tight">Cách hoạt động</h2>
          <p className="text-sm text-[#525866]">
            Quy trình giao dịch an toàn 3 bước bảo vệ cả hai bên thông qua ký quỹ và thị giác máy tính
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#3458D4]/40 shadow-sm transition-colors space-y-4">
            <div className="w-12 h-12 rounded-xl bg-[#F0B44D]/20 border border-[#F0B44D]/40 text-[#925E09] flex items-center justify-center">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-[#17191F]">1. Cọc 30% hai bên</h3>
            <p className="text-sm text-[#525866] leading-relaxed">
              Cả người mua và người bán đều đặt cọc ký quỹ (escrow deposit) để đảm bảo cam kết, ngăn chặn hủy kèo hoặc tráo hàng.
            </p>
          </div>

          {/* Card 2 */}
          <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#3458D4]/40 shadow-sm transition-colors space-y-4">
            <div className="w-12 h-12 rounded-xl bg-[#3458D4]/10 border border-[#3458D4]/25 text-[#3458D4] flex items-center justify-center">
              <Camera className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-[#17191F]">2. Chụp ảnh kèm nonce</h3>
            <p className="text-sm text-[#525866] leading-relaxed">
              Bằng chứng đóng gói và mở hộp bắt buộc kèm mã nonce ngẫu nhiên hiển thị cùng vật phẩm, chống giả mạo và tái sử dụng ảnh.
            </p>
          </div>

          {/* Card 3 */}
          <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#3458D4]/40 shadow-sm transition-colors space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-[#17191F]">3. AI xác thực bằng chứng</h3>
            <p className="text-sm text-[#525866] leading-relaxed">
              AI thị giác đối chiếu ngoại quan sản phẩm với listing niêm yết trên IPFS và ký attest on-chain; khi hết thời gian khiếu nại mà giao dịch không bị gắn cờ và không có khiếu nại thì bất kỳ ai cũng có thể kích hoạt hoàn cọc hai bên (tiền hàng thanh toán ngoài chuỗi).
            </p>
          </div>
        </div>
      </section>

      {/* My Trades Section (AC-06) */}
      <section className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#17191F] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#3458D4]" />
              Giao Dịch Của Tôi
            </h2>
            <p className="text-xs text-[#525866] mt-1">
              Danh sách các hợp đồng ký quỹ gắn liền với ví của bạn trên mạng {targetChain.name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/trade/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs font-semibold shadow-sm active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] focus-visible:ring-offset-2"
            >
              <PlusCircle className="w-4 h-4" />
              Tạo giao dịch mới
            </Link>
          </div>
        </div>

        {isConnected ? (
          <TradeList
            trades={trades}
            isLoading={isLoadingTrades}
            emptyMessage="Ví của bạn chưa tạo hoặc tham gia giao dịch nào trên hợp đồng Escrow."
          />
        ) : (
          <div className="p-8 rounded-2xl border border-dashed border-[#E5E7EB] bg-[#FFFFFF] text-center space-y-3 shadow-sm">
            <p className="text-sm text-[#525866]">
              Vui lòng kết nối ví ở góc phải Navbar để xem danh sách giao dịch của bạn.
            </p>
          </div>
        )}
      </section>

      {/* Component Showcase & Design System Section (AC-08) */}
      <section className="space-y-6 pt-4 border-t border-[#E5E7EB]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#17191F] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#3458D4]" />
              Design System &amp; Thành phần cốt lõi
            </h2>
            <p className="text-xs text-[#525866] mt-1">
              Xác nhận các UI components hiển thị trạng thái hợp đồng, địa chỉ và giá trị AVAX
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* State Badges Showcase */}
          <div className="p-5 rounded-2xl bg-[#FFFFFF] border border-[#E5E7EB] shadow-sm space-y-3">
            <div className="text-sm font-semibold text-[#17191F]">
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
          <div className="p-5 rounded-2xl bg-[#FFFFFF] border border-[#E5E7EB] shadow-sm space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-[#17191F]">Hiển thị địa chỉ (AddressDisplay):</div>
              <div className="flex flex-wrap items-center gap-3">
                <AddressDisplay address="0x70997970C51812dc3A010C7d01b50e0d17dc79C8" />
                <AddressDisplay address={escrowAddress} />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <div className="text-sm font-semibold text-[#17191F]">Hiển thị số tiền (AvaxAmount):</div>
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
      <section className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E5E7EB] shadow-sm space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
          <span className="font-semibold text-[#17191F] flex items-center gap-1.5 text-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Cấu hình Mạng &amp; Smart Contract Ký Quỹ
          </span>
          <span className="text-[#525866] font-mono">
            Chain ID: {chainId} ({targetChain.name})
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
          <div>
            <div className="text-[#525866] mb-1">Escrow Address:</div>
            <AddressDisplay address={escrowAddress} copyable explorerLink />
          </div>
          <div>
            <div className="text-[#525866] mb-1">Token Address:</div>
            <AddressDisplay address={tokenAddress} copyable explorerLink />
          </div>
          <div>
            <div className="text-[#525866] mb-1">Deploy Block:</div>
            <div className="text-[#17191F] font-semibold py-1">{deployBlock.toString()}</div>
          </div>
          <div>
            <div className="text-[#525866] mb-1">Target Network:</div>
            <div className="text-emerald-700 py-1 font-semibold">{targetChain.name}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
