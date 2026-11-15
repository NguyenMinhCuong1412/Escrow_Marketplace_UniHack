'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ClipboardList,
  ShoppingBag,
  Store,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Package,
  ExternalLink,
  XCircle,
  Clock,
  PlusCircle,
  ArrowRight,
} from 'lucide-react';
import {
  cancelPurchaseRequest,
  getTradeMarketplaceContext,
  listPurchaseRequests,
  syncMarketplaceTrade,
  weiToAvaxString,
  type PurchaseRequestDto,
  type TradeContextDto,
} from '@/lib/marketplace';
import { REQUEST_STATUS_BADGES } from '@/lib/marketplace-ui';
import { ipfsToGatewayUrl } from '@/lib/ipfs';
import { formatDateTime, shortAddr } from '@/lib/format';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMyTrades } from '@/hooks/useMyTrades';
import { TradeList } from '@/components/TradeList';

type TradesTab = 'buyer' | 'seller' | 'escrow';

function formatTtl(expiresAtSec: number | null, nowSec: number): string {
  if (!expiresAtSec) return '';
  const diff = Math.floor(expiresAtSec - nowSec);
  if (diff <= 0) return 'Đã hết hạn giữ chỗ (30 phút)';
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return `Còn ${mins}p ${secs < 10 ? '0' : ''}${secs}s để tạo Escrow`;
}

const MyTradesContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams?.get('tab');
  const activeTab: TradesTab =
    rawTab === 'buyer' || rawTab === 'seller' || rawTab === 'escrow'
      ? rawTab
      : 'buyer';

  const setActiveTab = (tab: TradesTab) => {
    const next = new URLSearchParams(searchParams?.toString() || '');
    next.set('tab', tab);
    router.replace(`/trades?${next.toString()}`, { scroll: false });
  };

  const {
    address,
    serverSessionActive,
    isSigningIn,
    authenticateWithServer,
  } = useAuthSession();

  const {
    trades,
    isLoading: isTradesLoading,
    isError: isTradesError,
    error: tradesError,
    refetch: refetchMyTrades,
  } = useMyTrades();

  const [buyerRequests, setBuyerRequests] = useState<PurchaseRequestDto[]>([]);
  const [sellerRequests, setSellerRequests] = useState<PurchaseRequestDto[]>([]);
  const [isLoadingReqs, setIsLoadingReqs] = useState(true);
  const [reqError, setReqError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [contextsByTradeId, setContextsByTradeId] = useState<
    Record<string, TradeContextDto>
  >({});
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const loadRequests = useCallback(async () => {
    setIsLoadingReqs(true);
    setReqError(null);
    try {
      const [buyerRes, sellerRes] = await Promise.all([
        listPurchaseRequests({ role: 'buyer', limit: 50 }),
        listPurchaseRequests({ role: 'seller', limit: 50 }),
      ]);
      setBuyerRequests(buyerRes.items || []);
      setSellerRequests(sellerRes.items || []);
    } catch (err) {
      setReqError(
        err instanceof Error
          ? err.message
          : 'Không thể tải danh sách yêu cầu mua/bán từ Marketplace.'
      );
    } finally {
      setIsLoadingReqs(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests, address]);

  // Nạp metadata sản phẩm cho từng Escrow on-chain của user
  useEffect(() => {
    if (!trades || trades.length === 0) {
      setContextsByTradeId({});
      return;
    }
    let alive = true;
    Promise.allSettled(
      trades.map((t) =>
        getTradeMarketplaceContext(t.id).then((ctx) => ({
          id: t.id.toString(),
          ctx,
        }))
      )
    ).then((results) => {
      if (!alive) return;
      const map: Record<string, TradeContextDto> = {};
      for (const res of results) {
        if (res.status === 'fulfilled') {
          map[res.value.id] = res.value.ctx;
        }
      }
      setContextsByTradeId(map);
    });
    return () => {
      alive = false;
    };
  }, [trades]);

  const handleRefreshAll = async () => {
    await Promise.all([loadRequests(), refetchMyTrades()]);
    toast.success('Đã làm mới danh sách yêu cầu & giao dịch Escrow.');
  };

  const handleCancelBuyerRequest = async (req: PurchaseRequestDto) => {
    setBusyId(req.id);
    try {
      await cancelPurchaseRequest(req.id);
      toast.success('Đã hủy yêu cầu mua.');
      await loadRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể hủy yêu cầu mua.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSyncTrade = async (tradeId: number) => {
    const key = `sync-${tradeId}`;
    setBusyId(key);
    try {
      const synced = await syncMarketplaceTrade(tradeId);
      toast.success(
        `Đã đồng bộ Escrow #${tradeId}: ${synced.synced_state || 'Đã cập nhật'}`
      );
      await Promise.all([loadRequests(), refetchMyTrades()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Đồng bộ thất bại.');
    } finally {
      setBusyId(null);
    }
  };

  const renderRequestList = (
    list: PurchaseRequestDto[],
    mode: 'buyer' | 'seller'
  ) => {
    if (isLoadingReqs) {
      return (
        <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-8 text-center text-sm text-[#525866]">
          Đang tải danh sách yêu cầu...
        </div>
      );
    }

    if (list.length === 0) {
      return (
        <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-10 text-center space-y-3">
          <Package className="w-8 h-8 mx-auto text-[#525866]" aria-hidden="true" />
          <p className="text-base font-bold text-[#17191F]">
            {mode === 'buyer'
              ? 'Bạn chưa gửi yêu cầu mua sản phẩm nào'
              : 'Chưa có yêu cầu mua nào gửi đến sản phẩm của bạn'}
          </p>
          <div className="pt-1">
            {mode === 'buyer' ? (
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs font-semibold"
              >
                <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                <span>Khám phá Chợ đồ sưu tầm</span>
              </Link>
            ) : (
              <Link
                href="/sell?tab=create"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs font-semibold"
              >
                <Store className="w-4 h-4" aria-hidden="true" />
                <span>Đăng bán sản phẩm ngay</span>
              </Link>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {list.map((req) => {
          const badge = REQUEST_STATUS_BADGES[req.status];
          const isBusy = busyId === req.id || busyId === `sync-${req.trade_id}`;
          return (
            <div
              key={req.id}
              className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-4 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="w-20 h-20 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] overflow-hidden shrink-0">
                  {req.listing?.primary_image_uri ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ipfsToGatewayUrl(req.listing.primary_image_uri)}
                      alt={req.listing.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#525866]">
                      <Package className="w-6 h-6" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span
                      className={`px-2 py-0.5 rounded-md border font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    {req.listing?.sku && (
                      <span className="font-mono text-[#525866]">
                        SKU: {req.listing.sku}
                      </span>
                    )}
                    <span className="text-[#525866]">
                      {formatDateTime(req.created_at)}
                    </span>
                  </div>

                  <Link
                    href={`/listings/${req.listing_id}`}
                    className="block text-sm sm:text-base font-bold text-[#17191F] hover:text-[#2947B5] truncate"
                  >
                    {req.listing?.title || `Sản phẩm ${req.listing_id.slice(0, 8)}`}
                  </Link>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#525866]">
                    <span>
                      {mode === 'buyer' ? 'Người bán' : 'Người mua'}:{' '}
                      <strong className="font-mono text-[#17191F]">
                        {shortAddr(
                          mode === 'buyer' ? req.seller_wallet : req.buyer_wallet
                        )}
                      </strong>
                    </span>
                    <span>
                      SL: <strong className="text-[#17191F]">{req.quantity}</strong>
                    </span>
                    <span>
                      Tổng:{' '}
                      <strong className="text-[#2947B5]">
                        {weiToAvaxString(req.total_value_wei, 4)} AVAX
                      </strong>
                    </span>
                    <span>
                      Cọc 30%:{' '}
                      <strong className="text-[#7A4B00]">
                        {weiToAvaxString(req.deposit_required_wei, 4)} AVAX/bên
                      </strong>
                    </span>
                  </div>

                  {req.status === 'ACCEPTED' && req.reservation_expires_at && (
                    <p className="inline-flex items-center gap-1 text-xs font-semibold text-[#7A4B00]">
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{formatTtl(req.reservation_expires_at, nowSec)}</span>
                    </p>
                  )}

                  {req.seller_note && (
                    <p className="text-xs text-[#525866]">
                      <strong className="text-[#17191F]">Phản hồi người bán:</strong>{' '}
                      {req.seller_note}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {mode === 'buyer' && req.status === 'PENDING' && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleCancelBuyerRequest(req)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-xs font-semibold text-red-700 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Hủy yêu cầu</span>
                  </button>
                )}

                {mode === 'seller' &&
                  (req.status === 'PENDING' || req.status === 'ACCEPTED') && (
                    <Link
                      href="/sell?tab=requests"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs font-semibold"
                    >
                      <span>Xử lý ở Kênh người bán</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  )}

                {req.trade_id && (
                  <>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleSyncTrade(req.trade_id!)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] hover:bg-[#FFFFFF] text-xs font-semibold text-[#17191F] cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Đồng bộ</span>
                    </button>
                    <Link
                      href={`/trade/${req.trade_id}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                    >
                      <span>Mở Escrow #{req.trade_id}</span>
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2947B5]">
            <ClipboardList className="w-4 h-4" aria-hidden="true" />
            <span>Quản lý đơn hàng & Hợp đồng ký quỹ</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#17191F]">
            Giao dịch của tôi
          </h1>
          <p className="text-xs sm:text-sm text-[#525866]">
            Theo dõi yêu cầu mua, yêu cầu bán và toàn bộ giao dịch Escrow trên Avalanche Fuji (nạp cọc, nộp bằng chứng, AI xác thực & khiếu nại).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRefreshAll}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] hover:bg-[#FFFFFF] text-xs font-semibold text-[#17191F] cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Làm mới</span>
          </button>
          <Link
            href="/trade/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#3458D4]/30 bg-[#3458D4]/10 hover:bg-[#3458D4]/15 text-xs font-semibold text-[#2947B5]"
          >
            <PlusCircle className="w-4 h-4" aria-hidden="true" />
            <span>Escrow P2P</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#3458D4] hover:bg-[#2947B5] text-white text-xs font-semibold"
          >
            <ShoppingBag className="w-4 h-4" aria-hidden="true" />
            <span>Chợ sưu tầm</span>
          </Link>
        </div>
      </section>

      {!serverSessionActive && (
        <div className="rounded-2xl border border-[#F0B44D]/60 bg-[#F0B44D]/15 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs sm:text-sm text-[#7A4B00]">
          <span>
            Phiên xác thực HTTP chưa được kích hoạt. Ký xác thực ví để xem các yêu cầu mua/bán của bạn.
          </span>
          <button
            type="button"
            disabled={isSigningIn}
            onClick={() => authenticateWithServer()}
            className="px-3.5 py-2 rounded-xl bg-[#3458D4] text-white text-xs font-semibold cursor-pointer self-start"
          >
            {isSigningIn ? 'Đang ký...' : 'Ký xác thực phiên ví'}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Phân loại giao dịch của tôi"
        className="flex flex-wrap items-center gap-2 border-b border-[#E5E7EB] pb-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'buyer'}
          onClick={() => setActiveTab('buyer')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'buyer'
              ? 'bg-[#3458D4] text-white shadow-sm'
              : 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#17191F] hover:bg-[#F7F8FA]'
          }`}
        >
          <ShoppingBag className="w-4 h-4" aria-hidden="true" />
          <span>Yêu cầu mua ({buyerRequests.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'seller'}
          onClick={() => setActiveTab('seller')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'seller'
              ? 'bg-[#3458D4] text-white shadow-sm'
              : 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#17191F] hover:bg-[#F7F8FA]'
          }`}
        >
          <Store className="w-4 h-4" aria-hidden="true" />
          <span>Yêu cầu bán ({sellerRequests.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'escrow'}
          onClick={() => setActiveTab('escrow')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
            activeTab === 'escrow'
              ? 'bg-[#3458D4] text-white shadow-sm'
              : 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#17191F] hover:bg-[#F7F8FA]'
          }`}
        >
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          <span>Giao dịch Escrow ({trades.length})</span>
        </button>
      </div>

      {reqError && (activeTab === 'buyer' || activeTab === 'seller') && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-3 text-xs sm:text-sm text-red-700"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{reqError}</span>
          </div>
          <button
            type="button"
            onClick={loadRequests}
            className="px-3 py-1.5 rounded-xl bg-red-700 text-white text-xs font-semibold cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {activeTab === 'buyer' && renderRequestList(buyerRequests, 'buyer')}
      {activeTab === 'seller' && renderRequestList(sellerRequests, 'seller')}

      {activeTab === 'escrow' && (
        <div className="space-y-4">
          {isTradesError && (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs sm:text-sm text-red-700"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  {tradesError instanceof Error
                    ? `Không thể đọc danh sách Escrow từ RPC: ${tradesError.message}`
                    : 'Không thể đọc danh sách Escrow từ RPC.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => refetchMyTrades()}
                className="px-3 py-1.5 rounded-xl bg-red-700 text-white text-xs font-semibold cursor-pointer self-start sm:self-auto"
              >
                Thử đọc lại
              </button>
            </div>
          )}

          <TradeList
            trades={trades}
            isLoading={isTradesLoading}
            contextsByTradeId={contextsByTradeId}
            emptyMessage="Bạn chưa tham gia giao dịch Escrow nào trên mạng hiện tại."
          />
        </div>
      )}
    </div>
  );
};

export default function MyTradesPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-8 text-center text-sm text-[#525866]">
          Đang tải danh sách giao dịch của tôi...
        </div>
      }
    >
      <MyTradesContent />
    </Suspense>
  );
}
