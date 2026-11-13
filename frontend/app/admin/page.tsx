'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useAccount, useReadContract, useReadContracts, useWriteContract, usePublicClient } from 'wagmi';
import { escrowAddress, escrowAbi } from '@/lib/contracts';
import { targetChain } from '@/lib/wagmi';
import { StateBadge } from '@/components/StateBadge';
import { AddressDisplay } from '@/components/AddressDisplay';
import { AvaxAmount } from '@/components/AvaxAmount';
import { getReadableError } from '@/lib/errors';
import { TradeData } from '@/types/trade';
import {
  Gavel,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  FileSearch,
  RefreshCw,
  Lock,
  Info,
  Scale,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';

export default function AdminDisputePage() {
  const { address, isConnected, chain } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [activeTab, setActiveTab] = useState<'disputed' | 'flagged' | 'all'>('disputed');
  const [selectedTrade, setSelectedTrade] = useState<TradeData | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    trade: TradeData | null;
    action: 'seller' | 'buyer' | 'split';
  }>({
    open: false,
    trade: null,
    action: 'split',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Read owner of Escrow contract
  const { data: rawOwner, isLoading: isLoadingOwner } = useReadContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: 'owner',
    query: {
      enabled: escrowAddress !== '0x0000000000000000000000000000000000000000',
    },
  });
  const contractOwner = (rawOwner as string || '').toLowerCase();
  const isOwner = Boolean(address && address.toLowerCase() === contractOwner);

  // 2. Read nextTradeId to discover all trades
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
      refetchInterval: 5000,
    },
  });

  const nextTradeId = rawNextTradeId ? Number(rawNextTradeId) : 1;

  // 3. Batch read trades 1 .. nextTradeId - 1
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

  // 4. Parse trades
  const allTrades = useMemo(() => {
    if (!rawTrades || rawTrades.length === 0) return [];
    const list: TradeData[] = [];

    rawTrades.forEach((res, index) => {
      if (res.status === 'success' && res.result) {
        const raw = res.result as any;
        const id = BigInt(index + 1);
        const seller = (raw.seller || raw[0] || '0x0000000000000000000000000000000000000000') as `0x${string}`;
        const buyer = (raw.buyer || raw[1] || '0x0000000000000000000000000000000000000000') as `0x${string}`;

        if (seller === '0x0000000000000000000000000000000000000000' || seller === '0x') {
          return;
        }

        list.push({
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
        });
      }
    });

    return list.sort((a, b) => (b.id > a.id ? 1 : -1));
  }, [rawTrades]);

  // Filtered views
  // State: 0: Created, 1: AwaitingEvidence, 2: Attested, 3: Disputed, 4: Resolved, 5: Cancelled
  const disputedTrades = useMemo(() => allTrades.filter((t) => t.state === 3), [allTrades]);
  const flaggedTrades = useMemo(() => allTrades.filter((t) => t.flagged && t.state !== 4 && t.state !== 5), [allTrades]);

  const displayedTrades = useMemo(() => {
    if (activeTab === 'disputed') return disputedTrades;
    if (activeTab === 'flagged') return flaggedTrades;
    return allTrades;
  }, [activeTab, disputedTrades, flaggedTrades, allTrades]);

  const refetchAll = () => {
    refetchNextId();
    refetchTrades();
  };

  // Transaction runner
  const handleResolveDispute = async (trade: TradeData, violator: `0x${string}`, label: string) => {
    if (!isOwner) {
      toast.error('Chỉ Trọng tài (Owner hợp đồng) mới có quyền giải quyết tranh chấp.');
      return;
    }
    if (chain && chain.id !== targetChain.id) {
      toast.error(`Vui lòng chuyển mạng sang ${targetChain.name}`);
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading(`Đang gửi giao dịch giải quyết tranh chấp #${trade.id.toString()} (${label})...`);

    try {
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'resolveDispute',
        args: [trade.id, violator],
      } as any);

      toast.loading('Giao dịch đã gửi! Đang chờ xác nhận trên blockchain...', { id: toastId });

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== 'success') {
          throw new Error('Giao dịch bị revert trên blockchain.');
        }
      }

      toast.success(`Đã giải quyết tranh chấp giao dịch #${trade.id.toString()} thành công!`, { id: toastId });
      setConfirmModal({ open: false, trade: null, action: 'split' });
      await refetchAll();
    } catch (err: any) {
      console.error('Resolve dispute failed:', err);
      const readable = getReadableError(err);
      toast.error(`Thất bại: ${readable}`, { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Trigger fileComplaint for flagged trades
  const handleFileComplaint = async (tradeId: bigint) => {
    setIsSubmitting(true);
    const toastId = toast.loading(`Đang kích hoạt khiếu nại tranh chấp cho trade #${tradeId.toString()}...`);

    try {
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'fileComplaint',
        args: [tradeId],
      } as any);

      toast.loading('Đang chờ xác nhận blockchain...', { id: toastId });

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== 'success') {
          throw new Error('Giao dịch kích hoạt tranh chấp bị revert.');
        }
      }

      toast.success(`Đã chuyển giao dịch #${tradeId.toString()} sang trạng thái Disputed!`, { id: toastId });
      await refetchAll();
    } catch (err: any) {
      console.error('File complaint error:', err);
      const readable = getReadableError(err);
      toast.error(`Thất bại: ${readable}`, { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isInitialLoading = isLoadingOwner || isLoadingNextId || isLoadingTrades;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#3458D4]/10 border border-[#3458D4]/25 flex items-center justify-center text-[#3458D4]">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#17191F] flex items-center gap-2">
                Trọng tài & Xử lý Tranh chấp
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#F0B44D]/20 text-[#8A5A00] border border-[#F0B44D]/50 font-mono font-medium">
                  Admin Only
                </span>
              </h1>
              <p className="text-xs text-[#525866] mt-0.5">
                Xem xét bằng chứng, đánh giá AI và phán quyết phân chia ký quỹ bảo đảm
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={refetchAll}
          disabled={isInitialLoading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] text-xs font-medium text-[#17191F] hover:bg-[#F7F8FA] hover:border-[#3458D4]/40 shadow-sm transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isInitialLoading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {/* Access Permission Status Banner */}
      {!isConnected ? (
        <div className="p-4 rounded-xl bg-[#F0B44D]/15 border border-[#F0B44D]/50 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-[#B47814] shrink-0 mt-0.5" />
          <div className="text-xs text-[#784B06]">
            <p className="font-semibold text-[#784B06]">Chưa kết nối ví Trọng tài</p>
            <p className="mt-0.5 text-[#8A5A00]">
              Bạn cần kết nối ví sở hữu hợp đồng ({contractOwner ? `${contractOwner.slice(0, 6)}...${contractOwner.slice(-4)}` : 'Admin'}) để thực thi các phán quyết trọng tài on-chain.
            </p>
          </div>
        </div>
      ) : !isOwner ? (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 shadow-sm">
          <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs text-red-800">
            <p className="font-semibold text-red-900">Quyền truy cập hạn chế</p>
            <p className="mt-0.5 text-red-700">
              Ví hiện tại (<span className="font-mono text-[#17191F]">{address}</span>) không phải là Owner của hợp đồng Escrow. Bạn có thể xem danh sách tranh chấp nhưng không thể ký lệnh thực thi phán quyết.
            </p>
            {contractOwner && (
              <p className="mt-1 text-red-700">
                Địa chỉ Owner hợp pháp:{' '}
                <span className="font-mono font-semibold text-[#925E09]">{contractOwner}</span>
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="text-xs">
              <span className="font-semibold text-emerald-800">Đã xác thực quyền Trọng tài: </span>
              <span className="text-[#17191F] font-mono">{address}</span>
            </div>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-medium">
            Authorized Owner
          </span>
        </div>
      )}

      {/* Tabs & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex p-1 rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] shadow-sm">
          <button
            onClick={() => setActiveTab('disputed')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'disputed'
                ? 'bg-red-50 text-red-700 border border-red-200 shadow-sm'
                : 'text-[#525866] hover:text-[#17191F]'
            }`}
          >
            <Gavel className="w-3.5 h-3.5" />
            Đang tranh chấp (Disputed)
            <span className="px-1.5 py-0.2 rounded-full bg-red-100 text-red-800 text-[10px] font-mono">
              {disputedTrades.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('flagged')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'flagged'
                ? 'bg-[#F0B44D]/20 text-[#8A5A00] border border-[#F0B44D]/50 shadow-sm'
                : 'text-[#525866] hover:text-[#17191F]'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            AI Cảnh báo (Flagged)
            <span className="px-1.5 py-0.2 rounded-full bg-[#F0B44D]/30 text-[#784B06] text-[10px] font-mono">
              {flaggedTrades.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'all'
                ? 'bg-[#3458D4] text-white border border-[#3458D4] shadow-sm'
                : 'text-[#525866] hover:text-[#17191F]'
            }`}
          >
            Tất cả giao dịch
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${activeTab === 'all' ? 'bg-white/20 text-white' : 'bg-[#F7F8FA] text-[#525866]'}`}>
              {allTrades.length}
            </span>
          </button>
        </div>

        <div className="text-xs text-[#525866]">
          Tổng cộng: <span className="font-semibold text-[#17191F]">{allTrades.length}</span> giao dịch trên hợp đồng
        </div>
      </div>

      {/* Trade List */}
      {isInitialLoading ? (
        <div className="py-20 text-center space-y-3">
          <div className="inline-block w-8 h-8 border-2 border-[#3458D4] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-[#525866]">Đang quét các giao dịch trên blockchain...</p>
        </div>
      ) : displayedTrades.length === 0 ? (
        <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-12 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <h3 className="text-sm font-semibold text-[#17191F]">
            {activeTab === 'disputed'
              ? 'Không có tranh chấp nào cần giải quyết'
              : activeTab === 'flagged'
              ? 'Không có giao dịch nào bị AI cảnh báo'
              : 'Chưa có giao dịch nào trên hợp đồng'}
          </h3>
          <p className="text-xs text-[#525866] max-w-md mx-auto">
            Hệ thống đang hoạt động ổn định. Các khiếu nại mới từ các bên giao dịch hoặc cảnh báo AI sẽ hiển thị tại đây để Trọng tài xử lý.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayedTrades.map((trade) => {
            const isDisputed = trade.state === 3;
            const isAttestedFlagged = trade.state === 2 && trade.flagged;

            return (
              <div
                key={trade.id.toString()}
                className={`rounded-2xl border p-5 transition-all shadow-sm ${
                  isDisputed
                    ? 'border-red-200 bg-[#FFFFFF]'
                    : isAttestedFlagged
                    ? 'border-[#F0B44D]/60 bg-[#FFFFFF]'
                    : 'border-[#E5E7EB] bg-[#FFFFFF]'
                }`}
              >
                {/* Header of Item */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E5E7EB]">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-base font-bold text-[#17191F]">
                      #{trade.id.toString()}
                    </span>
                    <StateBadge state={trade.state} flagged={trade.flagged} />
                    {trade.riskScore > 0 && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-mono font-medium border ${
                          trade.riskScore >= 60
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : trade.riskScore >= 30
                            ? 'bg-[#F0B44D]/20 text-[#8A5A00] border-[#F0B44D]/50'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        AI Risk: {trade.riskScore}/100
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/trade/${trade.id.toString()}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7F8FA] hover:bg-[#E5E7EB]/60 border border-[#E5E7EB] text-[#17191F] text-xs font-medium transition-colors"
                    >
                      Chi tiết trade
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                    <Link
                      href={`/trade/${trade.id.toString()}/report`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3458D4]/10 hover:bg-[#3458D4]/15 text-[#3458D4] border border-[#3458D4]/25 text-xs font-medium transition-colors"
                    >
                      <FileSearch className="w-3 h-3 text-[#3458D4]" />
                      Xem AI Report
                    </Link>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
                  {/* Parties */}
                  <div className="space-y-2 p-3.5 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB]">
                    <p className="text-[11px] font-semibold text-[#525866] uppercase tracking-wider">
                      Các bên tham gia
                    </p>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[#525866]">Seller:</span>
                        <AddressDisplay address={trade.seller} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#525866]">Buyer:</span>
                        <AddressDisplay address={trade.buyer} />
                      </div>
                    </div>
                  </div>

                  {/* Escrow Value & Deposit */}
                  <div className="space-y-2 p-3.5 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB]">
                    <p className="text-[11px] font-semibold text-[#525866] uppercase tracking-wider">
                      Giá trị & Tiền ký quỹ
                    </p>
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[#525866]">Giá trị hàng:</span>
                        <span className="font-semibold text-[#17191F]">
                          <AvaxAmount amountWei={trade.itemValue} />
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#525866]">Mỗi bên cọc:</span>
                        <span className="font-semibold text-[#925E09]">
                          <AvaxAmount amountWei={trade.depositRequired} />
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[#525866] pt-0.5">
                        <span>Đã nạp:</span>
                        <span>
                          Seller: {trade.sellerDeposit >= trade.depositRequired ? '✓' : '✗'} | Buyer:{' '}
                          {trade.buyerDeposit >= trade.depositRequired ? '✓' : '✗'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Evidence & Hash Info */}
                  <div className="space-y-2 p-3.5 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB]">
                    <p className="text-[11px] font-semibold text-[#525866] uppercase tracking-wider">
                      Bằng chứng & On-chain Hash
                    </p>
                    <div className="space-y-1 text-xs font-mono">
                      <div className="flex items-center justify-between text-[#525866]">
                        <span>Nonce:</span>
                        <span className="text-[#3458D4] font-semibold">
                          {trade.nonce ? `${trade.nonce.slice(0, 10)}...` : 'Chưa cấp'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[#525866]">
                        <span>Report Hash:</span>
                        <span className="text-[#17191F]">
                          {trade.reportHash && trade.reportHash !== '0x0000000000000000000000000000000000000000000000000000000000000000'
                            ? `${trade.reportHash.slice(0, 10)}...`
                            : 'Chưa có'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[#525866]">
                        <span>Flagged:</span>
                        <span className={trade.flagged ? 'text-red-600 font-bold' : 'text-[#525866]'}>
                          {trade.flagged ? 'CÓ (High Risk)' : 'Không'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dispute Actions Bar */}
                <div className="pt-3 border-t border-[#E5E7EB]">
                  {isDisputed ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-red-700 font-semibold flex items-center gap-1.5">
                          <Gavel className="w-4 h-4 text-red-600" />
                          Hành động phán quyết Trọng tài:
                        </span>
                        <span className="text-[11px] text-[#525866]">
                          Quy tắc phạt: Bên vi phạm mất 5% cọc cho bên bị hại, -10 uy tín.
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <button
                          onClick={() => setConfirmModal({ open: true, trade, action: 'seller' })}
                          disabled={isSubmitting || !isOwner}
                          className="px-3.5 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-800 text-xs font-semibold transition-all text-center flex flex-col items-center justify-center gap-0.5 disabled:opacity-50"
                        >
                          <span>Phạt Seller vi phạm</span>
                          <span className="text-[10px] text-red-700 font-normal">
                            Hoàn cọc Buyer + 5% bồi thường
                          </span>
                        </button>

                        <button
                          onClick={() => setConfirmModal({ open: true, trade, action: 'buyer' })}
                          disabled={isSubmitting || !isOwner}
                          className="px-3.5 py-2.5 rounded-xl bg-[#F0B44D]/15 hover:bg-[#F0B44D]/25 border border-[#F0B44D]/50 text-[#784B06] text-xs font-semibold transition-all text-center flex flex-col items-center justify-center gap-0.5 disabled:opacity-50"
                        >
                          <span>Phạt Buyer vi phạm</span>
                          <span className="text-[10px] text-[#8A5A00] font-normal">
                            Hoàn cọc Seller + 5% bồi thường
                          </span>
                        </button>

                        <button
                          onClick={() => setConfirmModal({ open: true, trade, action: 'split' })}
                          disabled={isSubmitting || !isOwner}
                          className="px-3.5 py-2.5 rounded-xl bg-[#F7F8FA] hover:bg-[#E5E7EB]/60 border border-[#E5E7EB] text-[#17191F] text-xs font-semibold transition-all text-center flex flex-col items-center justify-center gap-0.5 disabled:opacity-50"
                        >
                          <span>Hoà giải / Không ai sai</span>
                          <span className="text-[10px] text-[#525866] font-normal">
                            Hoàn đủ 100% cọc hai bên (address 0)
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : isAttestedFlagged ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-[#F0B44D]/15 border border-[#F0B44D]/50">
                      <div className="text-xs text-[#784B06] flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#B47814] shrink-0" />
                        <span>
                          AI đã cắm cờ cảnh báo rủi ro. Bạn có thể kích hoạt đưa trade sang trạng thái Disputed để xử lý phán quyết.
                        </span>
                      </div>
                      <button
                        onClick={() => handleFileComplaint(trade.id)}
                        disabled={isSubmitting}
                        className="px-3 py-1.5 rounded-lg bg-[#3458D4] hover:bg-[#2947B5] text-white font-semibold text-xs transition-colors shrink-0 disabled:opacity-50"
                      >
                        Chuyển sang Disputed (fileComplaint)
                      </button>
                    </div>
                  ) : trade.state === 4 ? (
                    <div className="text-xs text-[#525866] flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Giao dịch đã được phân bổ cọc và hoàn tất (Resolved).
                    </div>
                  ) : (
                    <div className="text-xs text-[#525866] flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      Giao dịch đang tiến hành bình thường, chưa phát sinh tranh chấp.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.open && confirmModal.trade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-[#FFFFFF] border border-[#E5E7EB] p-6 space-y-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#3458D4]/10 border border-[#3458D4]/25 flex items-center justify-center text-[#3458D4]">
                <Gavel className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#17191F]">Xác nhận Phán quyết Trọng tài</h3>
                <p className="text-xs text-[#525866]">Giao dịch #{confirmModal.trade.id.toString()}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] space-y-2 text-xs text-[#17191F]">
              <div className="flex justify-between">
                <span className="text-[#525866]">Hình thức phán quyết:</span>
                <span className="font-semibold text-[#17191F]">
                  {confirmModal.action === 'seller'
                    ? 'Phạt Seller vi phạm'
                    : confirmModal.action === 'buyer'
                    ? 'Phạt Buyer vi phạm'
                    : 'Hoà giải (Không bên nào có lỗi)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525866]">Bên vi phạm (violator):</span>
                <span className="font-mono text-[#925E09]">
                  {confirmModal.action === 'seller'
                    ? confirmModal.trade.seller
                    : confirmModal.action === 'buyer'
                    ? confirmModal.trade.buyer
                    : '0x0000000000000000000000000000000000000000'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525866]">Mức phạt (5% cọc):</span>
                <span className="font-semibold text-red-600">
                  {confirmModal.action === 'split' ? (
                    '0 AVAX (hoàn đủ 100%)'
                  ) : (
                    <AvaxAmount amountWei={(confirmModal.trade.depositRequired * 500n) / 10000n} />
                  )}
                </span>
              </div>
              <p className="text-[11px] text-[#525866] pt-2 border-t border-[#E5E7EB]">
                Lệnh này sẽ gọi hàm <code className="text-[#3458D4] font-mono font-semibold">resolveDispute</code> trên Smart Contract Escrow. Sau khi xác nhận trên blockchain, trạng thái trade sẽ chuyển sang <code className="text-emerald-700 font-semibold">Resolved</code> và không thể đảo ngược.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setConfirmModal({ open: false, trade: null, action: 'split' })}
                className="px-4 py-2 rounded-xl bg-[#F7F8FA] hover:bg-[#E5E7EB]/60 border border-[#E5E7EB] text-[#17191F] text-xs font-semibold transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  const t = confirmModal.trade!;
                  const violator =
                    confirmModal.action === 'seller'
                      ? t.seller
                      : confirmModal.action === 'buyer'
                      ? t.buyer
                      : '0x0000000000000000000000000000000000000000';
                  const label =
                    confirmModal.action === 'seller'
                      ? 'Seller vi phạm'
                      : confirmModal.action === 'buyer'
                      ? 'Buyer vi phạm'
                      : 'Hoà giải 50-50';
                  handleResolveDispute(t, violator as `0x${string}`, label);
                }}
                className="px-4 py-2 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs font-semibold transition-colors shadow-md shadow-[#3458D4]/20 flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Đang gửi giao dịch...
                  </>
                ) : (
                  <>
                    <Gavel className="w-4 h-4" />
                    Ký phán quyết on-chain
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
