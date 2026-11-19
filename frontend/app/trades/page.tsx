'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  createNonOverlappingPollController,
  getTradeMarketplaceContext,
  isAbortError,
  listPurchaseRequests,
  MarketplaceApiError,
  POLL_MAX_BACKOFF_MS,
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
import type { TradeData } from '@/types/trade';

type TradesTab = 'buyer' | 'seller' | 'escrow';

const TRADES_POLL_INTERVAL_MS = 10_000;

function isUnauthorizedError(err: unknown): boolean {
  return err instanceof MarketplaceApiError && err.status === 401;
}

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
    chain,
    targetChain,
    isAuthenticated,
    serverSessionActive,
    isSigningIn,
    authenticateWithServer,
    syncServerSession,
  } = useAuthSession();

  const effectiveChainId = chain?.id ?? targetChain?.id ?? 0;
  const normalizedAddress = address ? address.toLowerCase() : '';
  const isSessionReady = Boolean(
    address &&
      isAuthenticated &&
      serverSessionActive &&
      !isSigningIn
  );
  const currentSessionKey =
    isSessionReady && normalizedAddress
      ? `${normalizedAddress}::${effectiveChainId}`
      : '';

  const {
    trades,
    isLoading: isTradesLoading,
    isError: isTradesError,
    error: tradesError,
    refetch: refetchMyTrades,
  } = useMyTrades();

  const [loadedSessionKey, setLoadedSessionKey] = useState('');
  const [loadedContextKey, setLoadedContextKey] = useState('');
  const [buyerRequests, setBuyerRequests] = useState<PurchaseRequestDto[]>([]);
  const [sellerRequests, setSellerRequests] = useState<PurchaseRequestDto[]>([]);
  const [isLoadingReqs, setIsLoadingReqs] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  const [transientPollError, setTransientPollError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [contextsByTradeId, setContextsByTradeId] = useState<
    Record<string, TradeContextDto>
  >({});
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  // Synchronously scope all rendered data to the current wallet/chain/session (0 cross-wallet render frames)
  const visibleTrades = useMemo(
    () =>
      isAuthenticated && normalizedAddress
        ? (trades || []).filter(
            (t) =>
              t.seller.toLowerCase() === normalizedAddress ||
              t.buyer.toLowerCase() === normalizedAddress
          )
        : [],
    [trades, isAuthenticated, normalizedAddress]
  );

  const hasMatchingSessionData = Boolean(
    isSessionReady &&
      currentSessionKey !== '' &&
      loadedSessionKey === currentSessionKey
  );
  const hasMatchingContextData = Boolean(
    isSessionReady &&
      currentSessionKey !== '' &&
      loadedContextKey === currentSessionKey
  );
  const visibleBuyerRequests = hasMatchingSessionData ? buyerRequests : [];
  const visibleSellerRequests = hasMatchingSessionData ? sellerRequests : [];
  const visibleContextsByTradeId = hasMatchingContextData ? contextsByTradeId : {};
  const visibleReqError = hasMatchingSessionData ? reqError : null;
  const visibleTransientPollError = hasMatchingSessionData ? transientPollError : null;

  const canPollTrades = Boolean(isSessionReady && busyId === null);

  // Concurrency, polling & session isolation refs
  const sessionEpochRef = useRef(0);
  const sessionValidRef = useRef(false);
  const currentSessionKeyRef = useRef(currentSessionKey);
  currentSessionKeyRef.current = currentSessionKey;
  const activeAddressRef = useRef<string | null>(normalizedAddress || null);
  activeAddressRef.current = normalizedAddress || null;
  const hasLoadedOnceRef = useRef(false);
  const lastFetchSucceededRef = useRef(false);
  const canPollTradesRef = useRef(canPollTrades);
  canPollTradesRef.current = canPollTrades;
  const prevCanPollTradesRef = useRef(canPollTrades);
  const lastActiveSessionKeyRef = useRef('');
  const lastHandledTradesSignatureRef = useRef('');
  const pollControllerRef = useRef<ReturnType<typeof createNonOverlappingPollController> | null>(null);
  const visibleTradesRef = useRef<TradeData[]>(visibleTrades);
  visibleTradesRef.current = visibleTrades;
  const refetchMyTradesRef = useRef(refetchMyTrades);
  refetchMyTradesRef.current = refetchMyTrades;
  const syncServerSessionRef = useRef(syncServerSession);
  syncServerSessionRef.current = syncServerSession;

  // Per-trade context fetch tracking
  const contextsByTradeIdRef = useRef<Record<string, TradeContextDto>>({});
  const perTradeCtxSeqRef = useRef<Map<string, number>>(new Map());
  const perTradeCtxCommittedSeqRef = useRef<Map<string, number>>(new Map());
  const activeContextAbortSetRef = useRef<Set<AbortController>>(new Set());
  const nextCtxSeqRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const abortAllContextRequests = useCallback(() => {
    for (const ac of activeContextAbortSetRef.current) {
      ac.abort();
    }
    activeContextAbortSetRef.current.clear();
    perTradeCtxSeqRef.current.clear();
    perTradeCtxCommittedSeqRef.current.clear();
  }, []);

  const clearSessionScopedState = useCallback(() => {
    abortAllContextRequests();
    hasLoadedOnceRef.current = false;
    lastFetchSucceededRef.current = false;
    lastHandledTradesSignatureRef.current = '';
    contextsByTradeIdRef.current = {};
    setLoadedSessionKey('');
    setLoadedContextKey('');
    setBuyerRequests((prev) => (prev.length === 0 ? prev : []));
    setSellerRequests((prev) => (prev.length === 0 ? prev : []));
    setContextsByTradeId((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    setReqError(null);
    setTransientPollError(null);
    setIsLoadingReqs(false);
    setBusyId(null);
  }, [abortAllContextRequests]);

  const handleExpiredSession = useCallback(() => {
    const hadSessionOrData =
      sessionValidRef.current ||
      hasLoadedOnceRef.current ||
      currentSessionKeyRef.current !== '';
    sessionValidRef.current = false;
    sessionEpochRef.current += 1;
    pollControllerRef.current?.dispose();
    pollControllerRef.current = null;
    clearSessionScopedState();
    if (hadSessionOrData) {
      syncServerSessionRef.current(false);
    }
  }, [clearSessionScopedState]);

  const refreshTradeContexts = useCallback(
    async (
      targetTrades: TradeData[],
      opts?: { mode?: 'all' | 'active-or-missing'; signal?: AbortSignal }
    ): Promise<void> => {
      const mode = opts?.mode ?? 'active-or-missing';
      const capturedEpoch = sessionEpochRef.current;
      const capturedSessionKey = currentSessionKeyRef.current;
      const capturedWallet = activeAddressRef.current;

      if (!sessionValidRef.current || !capturedSessionKey || !capturedWallet) {
        return;
      }

      const isSameSession = () =>
        sessionValidRef.current &&
        !opts?.signal?.aborted &&
        capturedEpoch === sessionEpochRef.current &&
        capturedSessionKey === currentSessionKeyRef.current &&
        capturedWallet === activeAddressRef.current;

      if (targetTrades.length === 0) {
        if (isSameSession()) {
          contextsByTradeIdRef.current = {};
          setLoadedContextKey(capturedSessionKey);
          setContextsByTradeId({});
        }
        return;
      }

      const activeIdSet = new Set(targetTrades.map((t) => t.id.toString()));
      // Prune contexts for trades no longer in targetTrades without wiping active entries
      setLoadedContextKey(capturedSessionKey);
      const existingSnapshot = contextsByTradeIdRef.current;
      let prunedNeeded = false;
      const prunedMap: Record<string, TradeContextDto> = {};
      for (const [k, v] of Object.entries(existingSnapshot)) {
        if (activeIdSet.has(k)) {
          prunedMap[k] = v;
        } else {
          prunedNeeded = true;
        }
      }
      if (prunedNeeded) {
        contextsByTradeIdRef.current = prunedMap;
        setContextsByTradeId((prev) => {
          const next: Record<string, TradeContextDto> = {};
          for (const [k, v] of Object.entries(prev)) {
            if (activeIdSet.has(k)) next[k] = v;
          }
          return next;
        });
      }

      const currentContexts = contextsByTradeIdRef.current;
      const toFetch =
        mode === 'all'
          ? targetTrades
          : targetTrades.filter((t) => {
              const idStr = t.id.toString();
              const existing = currentContexts[idStr];
              return !existing || !existing.bound || t.state < 4;
            });

      if (toFetch.length === 0) {
        return;
      }

      const entries = await Promise.allSettled(
        toFetch.map(async (trade) => {
          const idStr = trade.id.toString();
          const tradeSeq = ++nextCtxSeqRef.current;
          perTradeCtxSeqRef.current.set(idStr, tradeSeq);

          const ac = new AbortController();
          activeContextAbortSetRef.current.add(ac);

          let onParentAbort: (() => void) | undefined;
          if (opts?.signal) {
            if (opts.signal.aborted) {
              ac.abort();
            } else {
              onParentAbort = () => ac.abort();
              opts.signal.addEventListener('abort', onParentAbort, { once: true });
            }
          }

          try {
            const ctx = await getTradeMarketplaceContext(trade.id, {
              signal: ac.signal,
            });
            return { idStr, tradeSeq, ctx, signal: ac.signal };
          } finally {
            activeContextAbortSetRef.current.delete(ac);
            if (opts?.signal && onParentAbort) {
              opts.signal.removeEventListener('abort', onParentAbort);
            }
          }
        })
      );

      if (!isSameSession()) {
        return;
      }

      for (const entry of entries) {
        if (entry.status === 'rejected' && isUnauthorizedError(entry.reason)) {
          handleExpiredSession();
          return;
        }
      }

      const winningUpdates: Record<string, TradeContextDto> = {};
      let hasWinners = false;
      for (const entry of entries) {
        if (entry.status !== 'fulfilled') continue;
        const { idStr, tradeSeq, ctx, signal } = entry.value;
        if (signal.aborted) continue;
        const committed = perTradeCtxCommittedSeqRef.current.get(idStr) ?? 0;
        if (tradeSeq < committed) {
          continue;
        }
        perTradeCtxCommittedSeqRef.current.set(idStr, tradeSeq);
        winningUpdates[idStr] = ctx;
        hasWinners = true;
      }

      setLoadedContextKey(capturedSessionKey);
      if (hasWinners) {
        contextsByTradeIdRef.current = {
          ...contextsByTradeIdRef.current,
          ...winningUpdates,
        };
        setContextsByTradeId((prev) => ({
          ...prev,
          ...winningUpdates,
        }));
      }
    },
    [handleExpiredSession]
  );

  const fetchTradesSnapshot = useCallback(
    async (opts?: { silent?: boolean; signal?: AbortSignal }): Promise<boolean> => {
      const silent = Boolean(opts?.silent);
      const capturedEpoch = sessionEpochRef.current;
      const capturedSessionKey = currentSessionKeyRef.current;
      const capturedWallet = activeAddressRef.current;
      lastFetchSucceededRef.current = false;

      if (!sessionValidRef.current || !capturedSessionKey || !capturedWallet) {
        if (!silent) setIsLoadingReqs(false);
        return false;
      }

      const isSameActiveSession = () =>
        sessionValidRef.current &&
        !opts?.signal?.aborted &&
        capturedEpoch === sessionEpochRef.current &&
        capturedSessionKey === currentSessionKeyRef.current &&
        capturedWallet === activeAddressRef.current;

      if (!silent) {
        if (!hasLoadedOnceRef.current) {
          setIsLoadingReqs(true);
        }
        setReqError(null);
        setTransientPollError(null);
        void Promise.resolve(refetchMyTradesRef.current?.());
      } else {
        void Promise.resolve(refetchMyTradesRef.current?.());
      }

      try {
        const currentTrades = visibleTradesRef.current;
        lastHandledTradesSignatureRef.current = currentTrades
          .map((t) => `${t.id.toString()}:${t.state}`)
          .join(',');

        const [buyerRes, sellerRes] = await Promise.all([
          listPurchaseRequests({ role: 'buyer', limit: 50 }, { signal: opts?.signal }),
          listPurchaseRequests({ role: 'seller', limit: 50 }, { signal: opts?.signal }),
        ]);

        if (!isSameActiveSession()) return false;

        setLoadedSessionKey(capturedSessionKey);
        setBuyerRequests(buyerRes.items || []);
        setSellerRequests(sellerRes.items || []);
        setReqError(null);
        setTransientPollError(null);
        hasLoadedOnceRef.current = true;

        await refreshTradeContexts(visibleTradesRef.current, {
          mode: silent ? 'active-or-missing' : 'all',
          signal: opts?.signal,
        });

        if (!isSameActiveSession()) return false;
        lastFetchSucceededRef.current = true;
        return true;
      } catch (err) {
        if (isAbortError(err, opts?.signal) || !isSameActiveSession()) {
          return false;
        }
        if (isUnauthorizedError(err)) {
          handleExpiredSession();
          return false;
        }
        const msg =
          err instanceof Error
            ? err.message
            : 'Không thể tải danh sách yêu cầu mua/bán từ Marketplace.';
        if (silent && hasLoadedOnceRef.current) {
          setTransientPollError(msg);
          throw err;
        }
        setLoadedSessionKey(capturedSessionKey);
        setReqError(msg);
        if (silent) {
          throw err;
        }
        return false;
      } finally {
        if (!silent && !opts?.signal?.aborted && capturedEpoch === sessionEpochRef.current) {
          setIsLoadingReqs(false);
        }
      }
    },
    [handleExpiredSession, refreshTradeContexts]
  );

  // Session lifecycle & 10s non-overlapping poll controller
  useEffect(() => {
    if (!isSessionReady || !currentSessionKey) {
      sessionValidRef.current = false;
      sessionEpochRef.current += 1;
      lastActiveSessionKeyRef.current = '';
      prevCanPollTradesRef.current = false;
      pollControllerRef.current?.dispose();
      pollControllerRef.current = null;
      clearSessionScopedState();
      return;
    }

    if (lastActiveSessionKeyRef.current && lastActiveSessionKeyRef.current !== currentSessionKey) {
      clearSessionScopedState();
    }
    lastActiveSessionKeyRef.current = currentSessionKey;
    sessionEpochRef.current += 1;
    sessionValidRef.current = true;
    prevCanPollTradesRef.current = canPollTradesRef.current;

    const controller = createNonOverlappingPollController({
      baseIntervalMs: TRADES_POLL_INTERVAL_MS,
      maxBackoffMs: POLL_MAX_BACKOFF_MS,
      canPoll: () => canPollTradesRef.current && sessionValidRef.current,
      runTask: async ({ signal, silent, isCurrent }) => {
        if (!isCurrent() || !sessionValidRef.current) return;
        await fetchTradesSnapshot({ silent, signal });
      },
    });

    pollControllerRef.current = controller;
    void controller.trigger({ silent: false });

    const handleVisibilityChange = () => {
      controller.onVisibilityOrStateChange();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      sessionValidRef.current = false;
      sessionEpochRef.current += 1;
      abortAllContextRequests();
      controller.dispose();
      if (pollControllerRef.current === controller) {
        pollControllerRef.current = null;
      }
    };
  }, [
    isSessionReady,
    currentSessionKey,
    abortAllContextRequests,
    clearSessionScopedState,
    fetchTradesSnapshot,
  ]);

  // Pause/resume cleanly on busyId / session readiness edge transitions
  useEffect(() => {
    const wasPollable = prevCanPollTradesRef.current;
    prevCanPollTradesRef.current = canPollTrades;
    if (wasPollable !== canPollTrades) {
      pollControllerRef.current?.onVisibilityOrStateChange();
    }
  }, [canPollTrades]);

  // Refresh metadata for newly appeared or updated on-chain trades
  useEffect(() => {
    if (!isSessionReady || !currentSessionKey || !sessionValidRef.current) {
      return;
    }
    const sig = visibleTrades.map((t) => `${t.id.toString()}:${t.state}`).join(',');
    if (sig === lastHandledTradesSignatureRef.current) {
      return;
    }
    lastHandledTradesSignatureRef.current = sig;
    void refreshTradeContexts(visibleTrades, { mode: 'active-or-missing' });
  }, [isSessionReady, currentSessionKey, visibleTrades, refreshTradeContexts]);

  const handleRefreshAll = useCallback(async () => {
    if (!isSessionReady || !sessionValidRef.current) {
      if (isAuthenticated) {
        void Promise.resolve(refetchMyTrades());
      }
      return;
    }
    if (pollControllerRef.current) {
      await pollControllerRef.current.trigger({ silent: false });
    } else {
      await fetchTradesSnapshot({ silent: false });
    }
    if (lastFetchSucceededRef.current && sessionValidRef.current) {
      toast.success('Đã làm mới danh sách yêu cầu & giao dịch Escrow.');
    }
  }, [isSessionReady, isAuthenticated, refetchMyTrades, fetchTradesSnapshot]);

  const handleCancelBuyerRequest = async (req: PurchaseRequestDto) => {
    const capturedEpoch = sessionEpochRef.current;
    setBusyId(req.id);
    try {
      const cancelled = await cancelPurchaseRequest(req.id);
      if (capturedEpoch !== sessionEpochRef.current) return;
      toast.success('Đã hủy yêu cầu mua.');
      setBuyerRequests((prev) =>
        prev.map((item) => (item.id === cancelled.id ? cancelled : item))
      );
    } catch (err) {
      if (isUnauthorizedError(err)) {
        handleExpiredSession();
        return;
      }
      if (capturedEpoch !== sessionEpochRef.current) return;
      toast.error(err instanceof Error ? err.message : 'Không thể hủy yêu cầu mua.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSyncTrade = async (tradeId: number) => {
    const capturedEpoch = sessionEpochRef.current;
    const key = `sync-${tradeId}`;
    setBusyId(key);
    try {
      const synced = await syncMarketplaceTrade(tradeId);
      if (capturedEpoch !== sessionEpochRef.current) return;
      toast.success(
        `Đã đồng bộ Escrow #${tradeId}: ${synced.synced_state || 'Đã cập nhật'}`
      );
      setBuyerRequests((prev) =>
        prev.map((item) =>
          item.trade_id === tradeId
            ? { ...item, synced_state: synced.synced_state ?? item.synced_state }
            : item
        )
      );
      setSellerRequests((prev) =>
        prev.map((item) =>
          item.trade_id === tradeId
            ? { ...item, synced_state: synced.synced_state ?? item.synced_state }
            : item
        )
      );
      void Promise.resolve(refetchMyTrades());
      void refreshTradeContexts(visibleTradesRef.current, { mode: 'all' });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        handleExpiredSession();
        return;
      }
      if (capturedEpoch !== sessionEpochRef.current) return;
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
          <span>Yêu cầu mua ({visibleBuyerRequests.length})</span>
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
          <span>Yêu cầu bán ({visibleSellerRequests.length})</span>
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
          <span>Giao dịch Escrow ({visibleTrades.length})</span>
        </button>
      </div>

      {visibleReqError && (activeTab === 'buyer' || activeTab === 'seller') && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-3 text-xs sm:text-sm text-red-700"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{visibleReqError}</span>
          </div>
          <button
            type="button"
            onClick={handleRefreshAll}
            className="px-3 py-1.5 rounded-xl bg-red-700 text-white text-xs font-semibold cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {!visibleReqError && visibleTransientPollError && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-[#F0B44D]/60 bg-[#F0B44D]/15 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-[#7A4B00]"
        >
          <span>
            Tự động đồng bộ nền tạm gián đoạn ({visibleTransientPollError}). Dữ liệu hiện tại được giữ nguyên và sẽ tự thử lại.
          </span>
          <button
            type="button"
            onClick={handleRefreshAll}
            className="px-2.5 py-1 rounded-lg border border-[#7A4B00]/30 bg-white/70 hover:bg-white text-[11px] font-semibold cursor-pointer shrink-0"
          >
            Thử ngay
          </button>
        </div>
      )}

      {activeTab === 'buyer' && renderRequestList(visibleBuyerRequests, 'buyer')}
      {activeTab === 'seller' && renderRequestList(visibleSellerRequests, 'seller')}

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
            trades={visibleTrades}
            isLoading={Boolean(isAuthenticated && isTradesLoading)}
            contextsByTradeId={visibleContextsByTradeId}
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
