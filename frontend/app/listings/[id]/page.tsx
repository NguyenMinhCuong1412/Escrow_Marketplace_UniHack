'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Package,
  ShieldCheck,
  Star,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  KeyRound,
  Store,
  Send,
  Info,
  Copy,
  Check,
} from 'lucide-react';
import {
  computeDepositWeiString,
  computeTotalValueWeiString,
  createPurchaseRequest,
  getListing,
  weiToAvaxString,
  type ListingDto,
  type PurchaseRequestDto,
} from '@/lib/marketplace';
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  LISTING_STATUS_BADGES,
} from '@/lib/marketplace-ui';
import { buildAuthRedirectUrl } from '@/lib/auth-routes';
import { ipfsToGatewayUrl, isMockUri } from '@/lib/ipfs';
import { formatDateTime, shortAddr } from '@/lib/format';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useReputation } from '@/hooks/useReputation';

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>();
  const listingId = params?.id ? decodeURIComponent(params.id) : '';

  const {
    address,
    isWalletConnected,
    isAuthenticated,
    serverSessionActive,
    isSigningIn,
    authenticateWithServer,
  } = useAuthSession();

  const [listing, setListing] = useState<ListingDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});
  const [copiedSeller, setCopiedSeller] = useState(false);

  // Buyer purchase request state
  const [quantity, setQuantity] = useState(1);
  const [buyerNote, setBuyerNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdRequest, setCreatedRequest] = useState<PurchaseRequestDto | null>(null);

  const loadListingDetail = useCallback(async () => {
    if (!listingId) {
      setLoadError('Mã tin đăng không hợp lệ.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getListing(listingId);
      setListing(data);
      setActiveImageIdx(0);
      setBrokenImages({});
      setQuantity((prev) => {
        const maxAvail = Math.max(1, data.quantity_available || 1);
        return Math.min(Math.max(1, prev), maxAvail);
      });
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Không thể tải thông tin sản phẩm.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    loadListingDetail();
  }, [loadListingDetail]);

  const sellerWallet = listing?.seller_wallet as `0x${string}` | undefined;
  const {
    score: onChainRepScore,
    hasOnChainData,
    isLoading: isRepLoading,
  } = useReputation(sellerWallet);

  const gallery = useMemo(() => {
    if (!listing) return [];
    if (listing.images && listing.images.length > 0) {
      return [...listing.images].sort((a, b) => a.sort_order - b.sort_order);
    }
    if (listing.primary_image_uri) {
      return [
        {
          id: 0,
          cid: '',
          uri: listing.primary_image_uri,
          sort_order: 0,
          is_primary: true,
        },
      ];
    }
    return [];
  }, [listing]);

  const safeIdx = gallery.length > 0 ? Math.min(activeImageIdx, gallery.length - 1) : 0;
  const currentImage = gallery[safeIdx] || null;

  const isOwnListing = Boolean(
    address &&
      listing?.seller_wallet &&
      address.toLowerCase() === listing.seller_wallet.toLowerCase()
  );

  const canPurchaseNow = Boolean(
    listing && listing.status === 'ACTIVE' && listing.quantity_available > 0
  );

  const safeQuantity = listing
    ? Math.min(Math.max(1, quantity), Math.max(1, listing.quantity_available))
    : 1;

  const totalValueWei = listing
    ? computeTotalValueWeiString(listing.price_wei, safeQuantity)
    : '0';
  const depositEachSideWei = listing
    ? computeDepositWeiString(totalValueWei)
    : '0';

  const authReturnUrl = buildAuthRedirectUrl(`/listings/${encodeURIComponent(listingId)}`, '');

  const handleCopySeller = () => {
    if (!listing?.seller_wallet) return;
    navigator.clipboard.writeText(listing.seller_wallet);
    setCopiedSeller(true);
    setTimeout(() => setCopiedSeller(false), 1800);
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listing || !canPurchaseNow || isOwnListing) return;
    setSubmitError(null);

    if (safeQuantity < 1 || safeQuantity > listing.quantity_available) {
      setSubmitError(`Số lượng phải từ 1 đến ${listing.quantity_available}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const req = await createPurchaseRequest(listing.id, {
        quantity: safeQuantity,
        buyer_note: buyerNote.trim() || undefined,
      });
      setCreatedRequest(req);
      setBuyerNote('');
      toast.success('Đã gửi yêu cầu mua thành công! Chờ người bán xác nhận.');
      await loadListingDetail();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Không thể gửi yêu cầu mua.';
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-5 w-44 bg-[#E5E7EB] rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 aspect-[4/3] rounded-2xl bg-[#FFFFFF] border border-[#E5E7EB]" />
          <div className="lg:col-span-5 h-96 rounded-2xl bg-[#FFFFFF] border border-[#E5E7EB]" />
        </div>
      </div>
    );
  }

  if (loadError || !listing) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-700">
          <AlertCircle className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-[#17191F]">
          Không thể hiển thị sản phẩm
        </h1>
        <p className="text-sm text-[#525866]">
          {loadError || 'Tin đăng không tồn tại hoặc đã bị gỡ.'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={loadListingDetail}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] text-xs font-semibold text-[#17191F] hover:bg-[#F7F8FA] cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>Thử tải lại</span>
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Quay lại Chợ sưu tầm</span>
          </Link>
        </div>
      </div>
    );
  }

  const statusBadge = LISTING_STATUS_BADGES[listing.status];
  const displayRep = hasOnChainData
    ? onChainRepScore
    : listing.seller_reputation;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Đường dẫn" className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[#525866]">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-semibold text-[#2947B5] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] rounded"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Quay lại Chợ sưu tầm</span>
        </Link>
        <span aria-hidden="true">/</span>
        <span>{CATEGORY_LABELS[listing.category]}</span>
        <span aria-hidden="true">/</span>
        <span className="font-mono text-[#17191F] font-medium">{listing.sku}</span>
      </nav>

      {/* Main Two-Column Product View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Multi-Image Gallery */}
        <section
          aria-label="Thư viện ảnh sản phẩm"
          className="lg:col-span-7 rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-4 shadow-sm space-y-3"
        >
          <div className="relative aspect-[4/3] w-full rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] overflow-hidden flex items-center justify-center">
            {currentImage && !brokenImages[safeIdx] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ipfsToGatewayUrl(currentImage.uri)}
                alt={`${listing.title} — ảnh ${safeIdx + 1}`}
                onError={() =>
                  setBrokenImages((prev) => ({ ...prev, [safeIdx]: true }))
                }
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-[#525866] px-4 text-center">
                <Package className="w-10 h-10" aria-hidden="true" />
                <span className="text-xs font-medium">
                  Không tải được ảnh xem trước từ cổng IPFS
                </span>
              </div>
            )}

            {/* Top Left AI Primary Badge */}
            {currentImage?.is_primary && (
              <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#3458D4] text-white text-xs font-semibold shadow">
                <Star className="w-3.5 h-3.5 fill-white" aria-hidden="true" />
                Ảnh chính đối chiếu AI
              </span>
            )}

            {currentImage && isMockUri(currentImage.uri) && (
              <span className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-slate-900/80 text-white text-[11px] font-medium">
                Demo IPFS cục bộ
              </span>
            )}

            {/* Prev / Next Carousel Buttons */}
            {gallery.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setActiveImageIdx((prev) =>
                      prev === 0 ? gallery.length - 1 : prev - 1
                    )
                  }
                  aria-label="Ảnh trước"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#FFFFFF]/90 hover:bg-[#FFFFFF] border border-[#E5E7EB] text-[#17191F] flex items-center justify-center shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4]"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveImageIdx((prev) => (prev + 1) % gallery.length)
                  }
                  aria-label="Ảnh tiếp theo"
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#FFFFFF]/90 hover:bg-[#FFFFFF] border border-[#E5E7EB] text-[#17191F] flex items-center justify-center shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4]"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            {gallery.length > 0 && (
              <span className="absolute bottom-3 right-3 px-2.5 py-0.5 rounded-md bg-slate-900/75 text-white text-xs font-medium">
                {safeIdx + 1} / {gallery.length}
              </span>
            )}
          </div>

          {/* Thumbnail Strip */}
          {gallery.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {gallery.map((img, idx) => {
                const selected = idx === safeIdx;
                return (
                  <button
                    key={`${img.uri}-${idx}`}
                    type="button"
                    onClick={() => setActiveImageIdx(idx)}
                    aria-label={`Chọn ảnh ${idx + 1}${img.is_primary ? ' (Ảnh chính AI)' : ''}`}
                    aria-current={selected ? 'true' : undefined}
                    className={`relative w-16 h-16 shrink-0 rounded-xl overflow-hidden border-2 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] ${
                      selected
                        ? 'border-[#3458D4] ring-2 ring-[#3458D4]/20'
                        : 'border-[#E5E7EB] opacity-80 hover:opacity-100'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ipfsToGatewayUrl(img.uri)}
                      alt={`Thumbnail ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {img.is_primary && (
                      <span className="absolute bottom-0 inset-x-0 bg-[#3458D4]/90 text-white text-[9px] font-bold text-center py-0.5">
                        AI
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Description */}
          <div className="pt-3 border-t border-[#E5E7EB] space-y-2">
            <h2 className="text-sm font-bold text-[#17191F]">
              Mô tả chi tiết sản phẩm
            </h2>
            {listing.description ? (
              <p className="text-sm text-[#17191F] whitespace-pre-line leading-relaxed">
                {listing.description}
              </p>
            ) : (
              <p className="text-xs text-[#525866] italic">
                Người bán chưa nhập thêm mô tả chi tiết cho sản phẩm này.
              </p>
            )}
          </div>
        </section>

        {/* Right: Price, Escrow Breakdown, Seller & Request Form */}
        <aside className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-5 shadow-sm space-y-4">
            {/* Badges & Title */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-0.5 rounded-lg bg-[#3458D4]/10 border border-[#3458D4]/25 text-[#2947B5] font-semibold">
                {CATEGORY_LABELS[listing.category]}
              </span>
              <span className="px-2.5 py-0.5 rounded-lg bg-[#F7F8FA] border border-[#E5E7EB] text-[#17191F] font-semibold">
                {CONDITION_LABELS[listing.condition]}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-lg border font-semibold ${statusBadge.className}`}
              >
                {statusBadge.label}
              </span>
            </div>

            <div className="space-y-1">
              <h1 className="text-xl sm:text-2xl font-bold text-[#17191F] leading-snug">
                {listing.title}
              </h1>
              <p className="text-xs font-mono text-[#525866]">
                SKU: <span className="text-[#17191F] font-semibold">{listing.sku}</span> · Đăng lúc{' '}
                {formatDateTime(listing.created_at)}
              </p>
            </div>

            {/* Duplicate / Review Warnings if flagged at backend */}
            {listing.warnings && listing.warnings.length > 0 && (
              <div className="rounded-xl border border-[#F0B44D]/60 bg-[#F0B44D]/15 p-3 text-xs text-[#7A4B00] space-y-1">
                <p className="font-bold">Lưu ý xác minh tin đăng</p>
                {listing.warnings.map((w, i) => (
                  <p key={`${w.code}-${i}`}>• {w.message}</p>
                ))}
              </div>
            )}

            {/* Separate Price vs 30% Escrow Deposit Box */}
            <div className="rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA] p-4 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-[#525866]">
                  Đơn giá niêm yết (1 sản phẩm)
                </span>
                <span className="text-xl font-bold text-[#2947B5] tabular-nums">
                  {weiToAvaxString(listing.price_wei, 6)} AVAX
                </span>
              </div>

              <div className="pt-2.5 border-t border-[#E5E7EB] space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#525866]">
                    Tổng giá trị đơn hàng ({safeQuantity} sp)
                  </span>
                  <span className="font-bold text-[#17191F] tabular-nums">
                    {weiToAvaxString(totalValueWei, 6)} AVAX
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#525866] font-semibold">
                    Cọc bảo vệ Escrow (30% mỗi bên)
                  </span>
                  <span className="font-bold text-[#7A4B00] tabular-nums">
                    {weiToAvaxString(depositEachSideWei, 6)} AVAX / bên
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-[#E5E7EB] flex items-start gap-2 text-[11px] text-[#525866]">
                <Info className="w-4 h-4 text-[#3458D4] shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  Hợp đồng Escrow giữ cọc 30% AVAX từ cả Người mua và Người bán, đồng thời phát hành CDU kế toán 1:1 không chuyển nhượng. Người bán sẽ mở giao dịch Escrow on-chain sau khi xác nhận yêu cầu.
                </span>
              </div>
            </div>

            {/* Stock Grid */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] p-2.5">
                <p className="text-[11px] text-[#525866]">Còn khả dụng</p>
                <p className="text-sm font-bold text-emerald-700 mt-0.5">
                  {listing.quantity_available} / {listing.quantity_total}
                </p>
              </div>
              <div className="rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] p-2.5">
                <p className="text-[11px] text-[#525866]">Đang giữ chỗ</p>
                <p className="text-sm font-bold text-[#7A4B00] mt-0.5">
                  {listing.quantity_reserved}
                </p>
              </div>
              <div className="rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] p-2.5">
                <p className="text-[11px] text-[#525866]">Đã khóa giao dịch</p>
                <p className="text-sm font-bold text-[#17191F] mt-0.5">
                  {listing.quantity_sold}
                </p>
              </div>
            </div>

            {/* Seller Info & On-Chain Reputation */}
            <div className="rounded-xl border border-[#E5E7EB] bg-[#FFFFFF] p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#525866] uppercase tracking-wider">
                  Người bán
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <ShieldCheck className="w-4 h-4 text-[#3458D4] shrink-0" aria-hidden="true" />
                  <span
                    className="font-mono text-xs sm:text-sm font-bold text-[#17191F]"
                    title={listing.seller_wallet}
                  >
                    {shortAddr(listing.seller_wallet)}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySeller}
                    aria-label="Sao chép địa chỉ ví người bán"
                    className="p-1 rounded hover:bg-[#F7F8FA] text-[#525866] hover:text-[#17191F] cursor-pointer"
                  >
                    {copiedSeller ? (
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="text-[11px] text-[#525866]">Uy tín on-chain</p>
                {isRepLoading ? (
                  <p className="text-xs font-semibold text-[#525866]">Đang đọc...</p>
                ) : (
                  <p className="inline-flex items-center gap-1 text-sm font-bold text-[#7A4B00]">
                    <Star className="w-4 h-4 fill-[#F0B44D] text-[#7A4B00]" aria-hidden="true" />
                    <span>{displayRep ?? 0}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Purchase Request Form / Guards */}
            {createdRequest ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-2.5">
                <div className="flex items-start gap-2 text-emerald-800">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-bold">
                      Đã gửi yêu cầu mua #{createdRequest.id.slice(0, 8)}
                    </p>
                    <p className="text-xs mt-0.5">
                      Số lượng: {createdRequest.quantity} · Cọc dự kiến: 30% mỗi bên (
                      {weiToAvaxString(createdRequest.deposit_required_wei, 6)} AVAX). Người bán cần xác nhận và tạo Escrow trong thời hạn giữ chỗ.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    href="/trades?tab=buyer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                  >
                    <span>Theo dõi trong Giao dịch của tôi</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setCreatedRequest(null)}
                    className="px-3 py-2 rounded-xl border border-emerald-300 bg-white text-emerald-800 text-xs font-semibold cursor-pointer"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            ) : isOwnListing ? (
              <div className="rounded-xl border border-[#3458D4]/30 bg-[#3458D4]/5 p-4 space-y-2">
                <p className="text-xs sm:text-sm font-semibold text-[#17191F]">
                  Đây là sản phẩm do chính ví bạn đăng bán.
                </p>
                <p className="text-xs text-[#525866]">
                  Người bán không thể tự gửi yêu cầu mua trên tin đăng của mình.
                </p>
                <Link
                  href="/sell"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs font-semibold"
                >
                  <Store className="w-4 h-4" aria-hidden="true" />
                  <span>Quản lý tại Kênh người bán</span>
                </Link>
              </div>
            ) : !canPurchaseNow ? (
              <div className="rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] p-4 text-xs sm:text-sm text-[#525866]">
                <p className="font-semibold text-[#17191F]">
                  Sản phẩm hiện không nhận thêm yêu cầu mua
                </p>
                <p className="mt-1">
                  Trạng thái hiện tại: <strong>{statusBadge.label}</strong> · Còn khả dụng:{' '}
                  <strong>{listing.quantity_available}</strong>.
                </p>
              </div>
            ) : !isAuthenticated ? (
              <div className="rounded-2xl border border-[#3458D4]/30 bg-[#3458D4]/5 p-4 space-y-3">
                <p className="text-xs sm:text-sm text-[#17191F] font-semibold">
                  Đăng nhập ví để gửi yêu cầu mua tới người bán
                </p>
                <p className="text-xs text-[#525866]">
                  Khách vãng lai có thể xem chi tiết sản phẩm tự do. Để tránh spam và xác định ví người mua trong Escrow, bạn cần xác thực phiên ví.
                </p>
                <div className="flex flex-wrap gap-2">
                  {isWalletConnected && !serverSessionActive && (
                    <button
                      type="button"
                      disabled={isSigningIn}
                      onClick={() => authenticateWithServer()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs sm:text-sm font-semibold transition cursor-pointer disabled:opacity-60"
                    >
                      <KeyRound className="w-4 h-4" aria-hidden="true" />
                      <span>{isSigningIn ? 'Đang ký xác thực...' : 'Ký xác thực phiên ví'}</span>
                    </button>
                  )}
                  <Link
                    href={authReturnUrl}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs sm:text-sm font-semibold transition"
                  >
                    <KeyRound className="w-4 h-4" aria-hidden="true" />
                    <span>
                      {isWalletConnected ? 'Mở cổng xác thực ví' : 'Kết nối & xác thực ví'}
                    </span>
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitRequest} className="space-y-3 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="buyer-quantity-input"
                    className="text-xs sm:text-sm font-semibold text-[#17191F]"
                  >
                    Số lượng muốn mua
                  </label>
                  <div className="inline-flex items-center rounded-xl border border-[#E5E7EB] bg-[#F7F8FA]">
                    <button
                      type="button"
                      disabled={safeQuantity <= 1 || isSubmitting}
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      aria-label="Giảm số lượng"
                      className="px-3 py-1.5 text-sm font-bold text-[#17191F] disabled:opacity-40 cursor-pointer"
                    >
                      −
                    </button>
                    <input
                      id="buyer-quantity-input"
                      type="number"
                      min={1}
                      max={listing.quantity_available}
                      value={safeQuantity}
                      onChange={(e) => {
                        const parsed = Number(e.target.value);
                        if (!Number.isNaN(parsed)) {
                          setQuantity(
                            Math.min(
                              Math.max(1, Math.trunc(parsed)),
                              listing.quantity_available
                            )
                          );
                        }
                      }}
                      className="w-14 bg-transparent text-center text-sm font-bold text-[#17191F] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={safeQuantity >= listing.quantity_available || isSubmitting}
                      onClick={() =>
                        setQuantity((q) =>
                          Math.min(listing.quantity_available, q + 1)
                        )
                      }
                      aria-label="Tăng số lượng"
                      className="px-3 py-1.5 text-sm font-bold text-[#17191F] disabled:opacity-40 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="buyer-note-input"
                    className="block text-xs font-semibold text-[#17191F]"
                  >
                    Ghi chú cho người bán (tùy chọn)
                  </label>
                  <textarea
                    id="buyer-note-input"
                    rows={3}
                    maxLength={1000}
                    value={buyerNote}
                    onChange={(e) => setBuyerNote(e.target.value)}
                    placeholder="Ví dụ: Yêu cầu chụp thêm ảnh góc hộp/mã series hoặc hẹn khung giờ giao dịch..."
                    className="w-full rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] focus:bg-[#FFFFFF] px-3 py-2 text-xs sm:text-sm text-[#17191F] placeholder:text-[#525866] focus:outline-none focus:border-[#3458D4] focus:ring-2 focus:ring-[#3458D4]/20"
                  />
                </div>

                {submitError && (
                  <p role="alert" className="text-xs text-red-700 font-medium">
                    {submitError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] disabled:opacity-60 text-white text-sm font-bold shadow-sm transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3458D4] focus-visible:ring-offset-1"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {isSubmitting ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu mua'}
                  </span>
                </button>
              </form>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
