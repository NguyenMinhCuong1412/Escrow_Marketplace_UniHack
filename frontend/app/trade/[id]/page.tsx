'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAccount, useWriteContract, usePublicClient } from 'wagmi';
import { escrowAddress, escrowAbi, chainId } from '@/lib/contracts';
import { targetChain } from '@/lib/wagmi';
import { useTrade } from '@/hooks/useTrade';
import { useReputation } from '@/hooks/useReputation';
import { StateBadge } from '@/components/StateBadge';
import { AddressDisplay } from '@/components/AddressDisplay';
import { AvaxAmount } from '@/components/AvaxAmount';
import { NonceCard } from '@/components/NonceCard';
import { CountdownTimer } from '@/components/CountdownTimer';
import { TradeTimeline } from '@/components/TradeTimeline';
import { EvidenceUploader } from '@/components/EvidenceUploader';
import { VerifyProgress } from '@/components/VerifyProgress';
import { AgentStatusCard } from '@/components/AgentStatusCard';
import { formatDateTime, formatAvax } from '@/lib/format';
import { getReadableError } from '@/lib/errors';
import { getStoredListingUri, ipfsToGatewayUrl } from '@/lib/ipfs';
import {
  ShieldCheck,
  Coins,
  User,
  ArrowLeft,
  AlertTriangle,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  FileText,
  Loader2,
  Clock,
  Sparkles,
  FileSearch,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

export default function TradeDetailPage() {
  const params = useParams();
  const tradeIdStr = params?.id as string;
  const tradeId = BigInt(tradeIdStr || '0');

  const { address, isConnected, chain } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const { trade, role, exists, isLoading, refetch } = useTrade(tradeId);

  // Reputation queries for parties
  const { score: sellerReputation } = useReputation(trade?.seller);
  const { score: buyerReputation } = useReputation(trade?.buyer);

  // Local metadata (title, description from local storage)
  const [meta, setMeta] = useState<{ title?: string; description?: string } | null>(null);
  const [isPendingTx, setIsPendingTx] = useState(false);

  useEffect(() => {
    if (tradeIdStr) {
      try {
        const stored = localStorage.getItem(`meta:${chainId}:${tradeIdStr}`);
        if (stored) {
          setMeta(JSON.parse(stored));
        }
      } catch {
        // ignore
      }
    }
  }, [tradeIdStr]);

  const isWrongChain = Boolean(isConnected && chain && chain.id !== targetChain.id);
  const isActionDisabled = !isConnected || isWrongChain || isPendingTx;

  // Deposit statuses
  const sellerHasDeposited = trade ? trade.sellerDeposit >= trade.depositRequired && trade.depositRequired > 0n : false;
  const buyerHasDeposited = trade ? trade.buyerDeposit >= trade.depositRequired && trade.depositRequired > 0n : false;

  // Evidence statuses
  const isZeroHash = (h?: string) => !h || h === '0x' || h === '0x0000000000000000000000000000000000000000000000000000000000000000';
  const sellerHasEvidence = trade ? !isZeroHash(trade.sellerEvidenceHash) : false;
  const buyerHasEvidence = trade ? !isZeroHash(trade.buyerEvidenceHash) : false;

  // Helper function to execute contract transactions with toast feedback
  const handleTx = async (
    fnName: string,
    args: any[] = [],
    value: bigint = 0n,
    loadingMsg: string,
    successMsg: string
  ) => {
    if (isActionDisabled) return;

    setIsPendingTx(true);
    const toastId = toast.loading(loadingMsg);

    try {
      const txHash = await writeContractAsync({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: fnName,
        args,
        ...(value > 0n ? { value } : {}),
      } as any);

      toast.loading('Giao dịch đã gửi! Đang chờ xác nhận trên blockchain...', { id: toastId });

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== 'success') {
          throw new Error('Giao dịch bị revert.');
        }
      }

      toast.success(successMsg, { id: toastId });
      await refetch();
    } catch (err: any) {
      console.error(`Error executing ${fnName}:`, err);
      const readable = getReadableError(err);
      toast.error(`Thao tác thất bại: ${readable}`, { id: toastId });
    } finally {
      setIsPendingTx(false);
    }
  };

  // Actions
  const handleDeposit = () => {
    if (!trade) return;
    handleTx(
      'deposit',
      [trade.id],
      trade.depositRequired,
      `Đang ký nạp cọc ${formatAvax(trade.depositRequired)} AVAX...`,
      'Nạp cọc thành công!'
    );
  };

  const handleCancelUnfunded = () => {
    if (!trade) return;
    handleTx(
      'cancelUnfunded',
      [trade.id],
      0n,
      'Đang ký hủy giao dịch...',
      'Đã hủy giao dịch và hoàn cọc (nếu có) thành công!'
    );
  };

  const handleResolveClean = () => {
    if (!trade) return;
    handleTx(
      'resolveClean',
      [trade.id],
      0n,
      'Đang ký hoàn cọc giao dịch...',
      'Hoàn cọc thành công! Tiền cọc hai bên đã được hoàn trả.'
    );
  };

  const handleFileComplaint = () => {
    if (!trade) return;
    handleTx(
      'fileComplaint',
      [trade.id],
      0n,
      'Đang mở khiếu nại tranh chấp...',
      'Đã gửi khiếu nại thành công! Trọng tài sẽ xử lý.'
    );
  };

  const handleCancelTimeout = () => {
    if (!trade) return;
    handleTx(
      'cancelOnEvidenceTimeout',
      [trade.id],
      0n,
      'Đang hủy giao dịch do hết hạn...',
      'Đã hủy giao dịch và hoàn cọc do quá hạn bằng chứng.'
    );
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center space-y-4">
        <div className="inline-block w-8 h-8 border-2 border-[#3458D4] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#525866]">Đang đọc thông tin giao dịch từ Smart Contract...</p>
      </div>
    );
  }

  if (!exists || !trade) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#F0B44D]/20 border border-[#F0B44D]/40 text-[#925E09] flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6 text-[#925E09]" />
        </div>
        <h2 className="text-xl font-bold text-[#17191F]">Giao dịch #{tradeIdStr} không tồn tại</h2>
        <p className="text-xs text-[#525866]">
          Hợp đồng Escrow không tìm thấy giao dịch này trên mạng {targetChain.name}.
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

  const titleText = meta?.title || `Vật phẩm sưu tầm #${trade.id.toString()}`;
  const nowUnix = Math.floor(Date.now() / 1000);
  const isEvidenceExpired = trade.evidenceDeadline > 0n && nowUnix > Number(trade.evidenceDeadline);
  const isDisputeExpired = trade.disputeDeadline > 0n && nowUnix > Number(trade.disputeDeadline);

  return (
    <div className="max-w-5xl mx-auto py-4 space-y-8">
      {/* Top Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-6">
        <div className="space-y-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs text-[#525866] hover:text-[#17191F] transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Quay lại danh sách
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#17191F] tracking-tight">
              {titleText}
            </h1>
            <span className="font-mono text-sm px-2.5 py-0.5 rounded-lg bg-[#FFFFFF] text-[#525866] border border-[#E5E7EB] shadow-sm">
              #{trade.id.toString()}
            </span>
          </div>
          <div className="text-xs text-[#525866] flex items-center gap-2">
            <span>Tạo lúc: {formatDateTime(trade.createdAt)}</span>
            <span>•</span>
            <span>Vai trò của bạn:</span>
            <span className="font-semibold text-[#3458D4] uppercase">
              {role === 'seller' ? 'Người bán' : role === 'buyer' ? 'Người mua' : 'Khách xem'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StateBadge state={trade.state} flagged={trade.flagged} />
        </div>
      </div>

      {/* Timeline Stepper */}
      <div className="p-4 sm:p-6 rounded-2xl bg-[#FFFFFF] border border-[#E5E7EB] shadow-sm">
        <TradeTimeline state={trade.state} flagged={trade.flagged} />
      </div>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Details & Parties (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Item Description Card */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#17191F] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#3458D4]" />
                Thông tin thỏa thuận
              </h3>
              {(trade.state >= 2 || !isZeroHash(trade.reportHash)) && (
                <Link
                  href={`/trade/${trade.id.toString()}/report`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#3458D4]/10 text-[#3458D4] hover:bg-[#3458D4]/15 text-xs font-semibold border border-[#3458D4]/25 transition-all"
                >
                  <FileSearch className="w-3.5 h-3.5" />
                  Xem Explainable Report
                </Link>
              )}
            </div>

            {/* Listing Image Preview if available */}
            {(() => {
              const listingUri = (meta as any)?.listingUri || getStoredListingUri(trade.id);
              if (!listingUri) return null;
              return (
                <div className="rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] p-3 flex items-center gap-4">
                  <img
                    src={ipfsToGatewayUrl(listingUri)}
                    alt="Listing image"
                    className="w-20 h-20 object-cover rounded-lg border border-[#E5E7EB] bg-[#FFFFFF] flex-shrink-0"
                  />
                  <div className="min-w-0 text-xs space-y-1">
                    <span className="text-[10px] uppercase font-bold text-[#525866] tracking-wider">
                      Ảnh niêm yết gốc (IPFS)
                    </span>
                    <p className="font-mono text-[#525866] truncate text-[11px]">{listingUri}</p>
                    <a
                      href={ipfsToGatewayUrl(listingUri)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#3458D4] hover:text-[#2947B5] font-medium inline-flex items-center gap-1 text-[11px]"
                    >
                      Mở ảnh đầy đủ <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              );
            })()}

            {meta?.description && (
              <p className="text-xs text-[#17191F] leading-relaxed bg-[#F7F8FA] p-3.5 rounded-xl border border-[#E5E7EB]">
                {meta.description}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] space-y-1">
                <span className="text-[11px] text-[#525866]">Giá trị món hàng:</span>
                <div>
                  <AvaxAmount amountWei={trade.itemValue} size="lg" />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] space-y-1">
                <span className="text-[11px] text-[#525866]">Cọc yêu cầu mỗi bên (30%):</span>
                <div>
                  <AvaxAmount amountWei={trade.depositRequired} size="lg" />
                </div>
              </div>
            </div>
          </div>

          {/* Parties Card (Seller & Buyer) */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-6 space-y-6 shadow-sm">
            <h3 className="text-sm font-bold text-[#17191F] flex items-center gap-2">
              <User className="w-4 h-4 text-[#3458D4]" />
              Các bên tham gia hợp đồng
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Seller Box */}
              <div className="p-4 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#3458D4]">Người bán (Seller)</span>
                  <span className="text-[10px] font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Rep: {sellerReputation}/100
                  </span>
                </div>
                <div>
                  <AddressDisplay address={trade.seller} />
                </div>
                <div className="space-y-1 pt-1 text-[11px] border-t border-[#E5E7EB]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#525866]">Tiền cọc:</span>
                    {sellerHasDeposited ? (
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đã nạp cọc
                      </span>
                    ) : (
                      <span className="text-[#925E09] font-medium flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Chưa nạp
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#525866]">Bằng chứng:</span>
                    {sellerHasEvidence ? (
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đã nộp
                      </span>
                    ) : (
                      <span className="text-[#525866]">Chưa nộp</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Buyer Box */}
              <div className="p-4 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#925E09]">Người mua (Buyer)</span>
                  <span className="text-[10px] font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Rep: {buyerReputation}/100
                  </span>
                </div>
                <div>
                  <AddressDisplay address={trade.buyer} />
                </div>
                <div className="space-y-1 pt-1 text-[11px] border-t border-[#E5E7EB]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#525866]">Tiền cọc:</span>
                    {buyerHasDeposited ? (
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đã nạp cọc
                      </span>
                    ) : (
                      <span className="text-[#925E09] font-medium flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Chưa nạp
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#525866]">Bằng chứng:</span>
                    {buyerHasEvidence ? (
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đã nộp
                      </span>
                    ) : (
                      <span className="text-[#525866]">Chưa nộp</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AC-03 & AC-04: Evidence Submission & AI Verify Flow (Phase 4C) */}
          {trade.state === 1 && (
            <div className="space-y-6">
              <EvidenceUploader
                tradeId={trade.id}
                role={role}
                hasSubmitted={role === 'seller' ? sellerHasEvidence : buyerHasEvidence}
                isEvidenceExpired={isEvidenceExpired}
                isActionDisabled={isActionDisabled}
                onSuccess={() => refetch()}
              />

              <AgentStatusCard
                tradeId={trade.id}
                onAttested={() => refetch()}
                fallback={
                  <VerifyProgress
                    tradeId={trade.id}
                    canVerify={sellerHasEvidence && buyerHasEvidence}
                    onSuccess={() => refetch()}
                  />
                }
              />
            </div>
          )}
        </div>

        {/* Right Column: Timers, Nonce & Action Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Active Deadlines Card */}
          {(trade.evidenceDeadline > 0n || trade.disputeDeadline > 0n) && (
            <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-5 space-y-3 shadow-sm">
              <span className="text-xs font-semibold text-[#525866] block">Thời hạn Smart Contract:</span>
              <div className="flex flex-col gap-2">
                {trade.state === 1 && trade.evidenceDeadline > 0n && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#17191F]">Hạn nộp bằng chứng:</span>
                    <CountdownTimer deadline={trade.evidenceDeadline} />
                  </div>
                )}
                {trade.state === 2 && trade.disputeDeadline > 0n && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#17191F]">Hạn khiếu nại tranh chấp:</span>
                    <CountdownTimer deadline={trade.disputeDeadline} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AC-04: NonceCard (hiện khi state >= 1) */}
          <NonceCard nonce={trade.nonce} state={trade.state} tradeId={trade.id} />

          {/* AC-03 & AC-09: Action Panel */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-6 space-y-5 shadow-sm">
            <h3 className="text-sm font-bold text-[#17191F] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Thao tác Hợp đồng (Action Panel)
            </h3>

            {/* Warning if wallet disconnected or wrong chain */}
            {!isConnected && (
              <div className="p-3 rounded-xl bg-[#F0B44D]/15 border border-[#F0B44D]/50 text-[#8A5A00] text-xs">
                Vui lòng kết nối ví để thực hiện giao dịch nạp cọc hoặc ký hợp đồng.
              </div>
            )}
            {isWrongChain && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                Ví đang ở sai mạng. Vui lòng chuyển sang {targetChain.name}.
              </div>
            )}

            {/* State 0: Created */}
            {trade.state === 0 && (
              <div className="space-y-4">
                <p className="text-xs text-[#525866] leading-relaxed">
                  Giao dịch đang ở trạng thái <strong>Chờ nạp cọc</strong>. Cả Người bán và Người mua cần nạp đủ số tiền cọc để hợp đồng kích hoạt mã nonce.
                </p>

                {/* Seller deposit button */}
                {role === 'seller' && !sellerHasDeposited && (
                  <button
                    type="button"
                    onClick={handleDeposit}
                    disabled={isActionDisabled}
                    className="w-full py-3 px-4 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white font-semibold text-xs shadow-md shadow-[#3458D4]/20 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4]"
                  >
                    {isPendingTx ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
                    <span>Nạp cọc Người bán ({formatAvax(trade.depositRequired)} AVAX)</span>
                  </button>
                )}

                {/* Buyer deposit button */}
                {role === 'buyer' && !buyerHasDeposited && (
                  <button
                    type="button"
                    onClick={handleDeposit}
                    disabled={isActionDisabled}
                    className="w-full py-3 px-4 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white font-semibold text-xs shadow-md shadow-[#3458D4]/20 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4]"
                  >
                    {isPendingTx ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
                    <span>Nạp cọc Người mua ({formatAvax(trade.depositRequired)} AVAX)</span>
                  </button>
                )}

                {/* Already deposited note */}
                {((role === 'seller' && sellerHasDeposited) || (role === 'buyer' && buyerHasDeposited)) && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-2">
                    <p className="font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Bạn đã nạp cọc thành công!
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      Đang đợi đối tác nạp cọc. Nếu đối tác không nạp, bạn có thể bấm nút bên dưới để hủy và rút lại tiền cọc.
                    </p>
                    <button
                      type="button"
                      onClick={handleCancelUnfunded}
                      disabled={isActionDisabled}
                      className="w-full mt-2 py-2 px-3 rounded-lg bg-[#FFFFFF] hover:bg-[#F7F8FA] text-[#17191F] text-xs font-medium border border-[#E5E7EB] shadow-sm transition-colors"
                    >
                      Hủy giao dịch &amp; Rút lại cọc
                    </button>
                  </div>
                )}

                {role === 'viewer' && (
                  <div className="p-3.5 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] text-xs text-[#525866]">
                    Bạn đang xem với tư cách người ngoài. Chỉ Người bán ({trade.seller.slice(0, 6)}...) và Người mua ({trade.buyer.slice(0, 6)}...) mới có quyền nạp cọc.
                  </div>
                )}
              </div>
            )}

            {/* State 1: AwaitingEvidence */}
            {trade.state === 1 && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-[#3458D4]/5 border border-[#3458D4]/25 text-[#17191F] text-xs space-y-2">
                  <p className="font-semibold text-[#3458D4] flex items-center gap-1.5">
                    <Lock className="w-4 h-4" />
                    Cả 2 bên đã nạp cọc đủ!
                  </p>
                  <p className="text-[11px] text-[#525866] leading-relaxed">
                    Vui lòng sử dụng <strong>Mã Nonce</strong> ở trên khi ghi hình bằng chứng. Sau khi cả 2 bên nộp bằng chứng, mô hình AI sẽ tự động phân tích và ký xác thực on-chain.
                  </p>
                </div>

                {isEvidenceExpired && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs space-y-2">
                    <p className="font-semibold">Đã quá thời hạn nộp bằng chứng!</p>
                    <button
                      type="button"
                      onClick={handleCancelTimeout}
                      disabled={isActionDisabled}
                      className="w-full py-2.5 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition-colors"
                    >
                      Hủy giao dịch &amp; Hoàn cọc (Timeout)
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* State 2: Attested */}
            {trade.state === 2 && (
              <div className="space-y-4">
                {trade.flagged ? (
                  <div className="p-4 rounded-xl bg-[#F0B44D]/15 border border-[#F0B44D]/50 text-[#8A5A00] text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-[#784B06]">
                      <AlertTriangle className="w-4 h-4 text-[#B47814]" />
                      <span>AI Cảnh Báo Rủi Ro (Flagged)</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Điểm rủi ro AI: <strong>{trade.riskScore}/100</strong>. Phát hiện dấu hiệu bất thường (lệch vật phẩm hoặc sai mã nonce). Cần mở tranh chấp để trọng tài can thiệp.
                    </p>
                    <Link
                      href={`/trade/${trade.id.toString()}/report`}
                      className="w-full py-2.5 px-3 rounded-lg bg-[#FFFFFF] hover:bg-[#F7F8FA] text-[#8A5A00] font-semibold text-xs border border-[#F0B44D]/50 flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                    >
                      <FileSearch className="w-4 h-4" />
                      <span>Xem Báo Cáo Giải Trình AI (Explainable Report)</span>
                    </Link>
                    <button
                      type="button"
                      onClick={handleFileComplaint}
                      disabled={isActionDisabled}
                      className="w-full py-2.5 px-3 rounded-lg bg-[#B47814] hover:bg-[#925E09] text-white font-semibold text-xs transition-colors"
                    >
                      Mở khiếu nại tranh chấp (File Complaint)
                    </button>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-3">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>AI Xác Thực Sạch (Risk: {trade.riskScore}/100)</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-emerald-700">
                      Mọi bằng chứng và mã nonce đều khớp với thông tin niêm yết. Thời gian mở khiếu nại đang đếm ngược.
                    </p>

                    <Link
                      href={`/trade/${trade.id.toString()}/report`}
                      className="w-full py-2 px-3 rounded-lg bg-[#FFFFFF] hover:bg-[#F7F8FA] text-[#3458D4] font-semibold text-xs border border-[#3458D4]/30 flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                    >
                      <FileSearch className="w-4 h-4" />
                      <span>Xem Báo Cáo Giải Trình AI (Explainable Report)</span>
                    </Link>

                    {/* Complaint button during dispute window */}
                    {!isDisputeExpired && (
                      <button
                        type="button"
                        onClick={handleFileComplaint}
                        disabled={isActionDisabled}
                        className="w-full py-2 px-3 rounded-lg bg-[#FFFFFF] hover:bg-red-50 text-red-600 text-xs font-medium border border-[#E5E7EB] transition-colors"
                      >
                        Mở khiếu nại (nếu phát hiện sai sót)
                      </button>
                    )}

                    {/* Resolve clean button when dispute window expired */}
                    {isDisputeExpired && (
                      <button
                        type="button"
                        onClick={handleResolveClean}
                        disabled={isActionDisabled}
                        className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all"
                      >
                        Hoàn cọc hai bên (Resolve Clean)
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* State 3: Disputed */}
            {trade.state === 3 && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs space-y-2">
                <p className="font-bold text-sm flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  Đang trong quá trình tranh chấp
                </p>
                <p className="text-[11px] text-red-700 leading-relaxed">
                  Khiếu nại đã được ghi nhận on-chain. Trọng tài (owner của hợp đồng) sẽ kiểm tra hồ sơ và quyết định phân xử, hoàn cọc hoặc áp dụng mức phạt 5%.
                </p>
              </div>
            )}

            {/* State 4: Resolved */}
            {trade.state === 4 && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-2">
                <p className="font-bold text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Giao dịch đã kết thúc (Resolved)
                </p>
                <p className="text-[11px] text-emerald-700 leading-relaxed">
                  Tiền cọc đã được hoàn trả hoặc phân bổ theo kết quả xử lý (hoàn cọc luồng sạch hoặc phán quyết trọng tài). Tiền hàng thanh toán ngoài chuỗi. Điểm uy tín (reputation) được cập nhật theo kết quả.
                </p>
              </div>
            )}

            {/* State 5: Cancelled */}
            {trade.state === 5 && (
              <div className="p-4 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] text-[#525866] text-xs space-y-1">
                <p className="font-bold text-sm text-[#17191F] flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-[#525866]" />
                  Giao dịch đã hủy
                </p>
                <p className="text-[11px]">Hợp đồng đã kết thúc và tiền cọc đã được hoàn trả.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
