import type { TradeData } from '@/types/trade';

export const ADMIN_ALL_PAGE_SIZE = 20;
export const MAX_FRONTEND_INDEX_LAG_BLOCKS = 20;
export const MAX_TAIL_GAP = 50;
export const MAX_OPEN_VERIFY_BATCH = 200;
export const REORG_LOOKBACK_BLOCKS = 12;
export const FUJI_READ_CHUNK_SIZE = 50;
export const ANVIL_READ_CHUNK_SIZE = 25;
export const MAX_CONCURRENT_CHUNKS = 2;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface TradeIndexItem {
  tradeId: number;
  seller: string;
  buyer: string;
  lastKnownState: number;
  flagged: boolean;
  isTerminal: boolean;
  createdBlock?: number;
  lastEventBlock?: number;
  lastVerifiedBlock?: number;
  lastVerifiedAt?: number;
}

export interface TradeIndexResponse {
  chainId: number;
  contractAddress: string;
  deployBlock: number;
  indexedThroughBlock: number;
  indexedNextTradeId: number;
  headBlockAtSync: number;
  lastSyncEpoch: number;
  ageSeconds: number | null;
  blockLag: number | null;
  missingGapCount: number;
  isStale: boolean;
  isComplete: boolean;
  totalMatching: number;
  summary: {
    disputedCount: number;
    flaggedCount: number;
    activeCount: number;
  };
  items: TradeIndexItem[];
}

export interface FetchTradeIndexParams {
  wallet?: string;
  filter: 'all' | 'disputed' | 'flagged' | 'active';
  offset: number;
  limit: number;
  signal?: AbortSignal;
}

export interface TradeChainAdapter {
  chainId: number;
  escrowAddress: `0x${string}`;
  readNextTradeId: (signal?: AbortSignal) => Promise<number>;
  readBlockNumber: (signal?: AbortSignal) => Promise<number>;
  readTradesBatch: (
    ids: number[],
    signal?: AbortSignal
  ) => Promise<Map<number, TradeData>>;
  fetchIndexPage?: (
    params: FetchTradeIndexParams
  ) => Promise<{ ok: boolean; status: number; data?: TradeIndexResponse }>;
}

export interface DiscoveryMetrics {
  usedBackendIndex: boolean;
  fallbackReason: string | null;
  getTradeCalls: number;
  cacheHits: number;
  indexPagesFetched: number;
  tailIdsScanned: number;
}

interface PendingTerminalEntry {
  trade: TradeData;
  firstSeenBlock: number;
  confirmations: number;
}

interface ScopedTradeCache {
  terminalById: Map<number, TradeData>;
  pendingTerminalById: Map<number, PendingTerminalEntry>;
  nonMatchingTerminalByWallet: Map<string, Set<number>>;
  lastObservedBlock: number;
  lastObservedNextTradeId: number;
}

const scopedCaches = new Map<string, ScopedTradeCache>();

export function buildScopeKey(chainId: number, escrowAddress: string): string {
  return `${Number(chainId)}:${String(escrowAddress || ZERO_ADDRESS).toLowerCase()}`;
}

function getScopedCache(chainId: number, escrowAddress: string): ScopedTradeCache {
  const key = buildScopeKey(chainId, escrowAddress);
  let entry = scopedCaches.get(key);
  if (!entry) {
    entry = {
      terminalById: new Map(),
      pendingTerminalById: new Map(),
      nonMatchingTerminalByWallet: new Map(),
      lastObservedBlock: 0,
      lastObservedNextTradeId: 1,
    };
    scopedCaches.set(key, entry);
  }
  return entry;
}

function syncCacheHeadOrFlushOnReorg(
  cache: ScopedTradeCache,
  currentBlock: number,
  nextTradeId: number
): void {
  if (
    (cache.lastObservedBlock > 0 && currentBlock < cache.lastObservedBlock) ||
    (cache.lastObservedNextTradeId > 1 && nextTradeId < cache.lastObservedNextTradeId)
  ) {
    cache.terminalById.clear();
    cache.pendingTerminalById.clear();
    cache.nonMatchingTerminalByWallet.clear();
  }
  cache.lastObservedBlock = Math.max(cache.lastObservedBlock, currentBlock);
  cache.lastObservedNextTradeId = Math.max(cache.lastObservedNextTradeId, nextTradeId);
}

export function clearTradeDiscoveryCache(scopeKey?: string): void {
  if (scopeKey) {
    scopedCaches.delete(scopeKey);
  } else {
    scopedCaches.clear();
  }
}

export function parseRawTrade(id: number | bigint, raw: unknown): TradeData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string | number, unknown>;
  const seller = String(r.seller ?? r[0] ?? ZERO_ADDRESS) as `0x${string}`;
  const buyer = String(r.buyer ?? r[1] ?? ZERO_ADDRESS) as `0x${string}`;

  if (
    !seller ||
    seller.toLowerCase() === ZERO_ADDRESS ||
    seller.toLowerCase() === '0x'
  ) {
    return null;
  }

  const flaggedRaw = r.flagged !== undefined ? r.flagged : r[11];
  const stateRaw = r.state !== undefined ? r.state : r[15];

  return {
    id: BigInt(id),
    seller,
    buyer,
    itemValue: BigInt((r.itemValue ?? r[2] ?? 0) as string | number | bigint),
    depositRequired: BigInt(
      (r.depositRequired ?? r[3] ?? 0) as string | number | bigint
    ),
    sellerDeposit: BigInt(
      (r.sellerDeposit ?? r[4] ?? 0) as string | number | bigint
    ),
    buyerDeposit: BigInt(
      (r.buyerDeposit ?? r[5] ?? 0) as string | number | bigint
    ),
    nonce: String(r.nonce ?? r[6] ?? '0x') as `0x${string}`,
    sellerEvidenceHash: String(
      r.sellerEvidenceHash ?? r[7] ?? '0x'
    ) as `0x${string}`,
    buyerEvidenceHash: String(
      r.buyerEvidenceHash ?? r[8] ?? '0x'
    ) as `0x${string}`,
    reportHash: String(r.reportHash ?? r[9] ?? '0x') as `0x${string}`,
    riskScore: Number(r.riskScore ?? r[10] ?? 0),
    flagged: Boolean(flaggedRaw),
    createdAt: BigInt((r.createdAt ?? r[12] ?? 0) as string | number | bigint),
    evidenceDeadline: BigInt(
      (r.evidenceDeadline ?? r[13] ?? 0) as string | number | bigint
    ),
    disputeDeadline: BigInt(
      (r.disputeDeadline ?? r[14] ?? 0) as string | number | bigint
    ),
    state: Number(stateRaw ?? 0),
  };
}

export function isTerminalTradeState(state: number): boolean {
  return state === 4 || state === 5;
}

export function createAbortError(message = 'Aborted'): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

export function evaluateIndexFreshness(
  index: TradeIndexResponse | undefined,
  opts: {
    chainId: number;
    escrowAddress: string;
    onChainBlockNumber: number;
    onChainNextTradeId: number;
    maxBlockLag?: number;
    maxTailGap?: number;
  }
): { usable: boolean; reason: string } {
  if (!index) {
    return { usable: false, reason: 'missing_index' };
  }
  if (Number(index.chainId) !== Number(opts.chainId)) {
    return { usable: false, reason: 'chain_mismatch' };
  }
  if (
    String(index.contractAddress || '').toLowerCase() !==
    String(opts.escrowAddress || '').toLowerCase()
  ) {
    return { usable: false, reason: 'contract_mismatch' };
  }
  if (index.isStale) {
    return { usable: false, reason: 'index_stale' };
  }
  if (!index.isComplete) {
    return { usable: false, reason: 'index_incomplete' };
  }
  if (Number(index.missingGapCount || 0) > 0) {
    return { usable: false, reason: 'id_gaps_present' };
  }
  const maxLag = opts.maxBlockLag ?? MAX_FRONTEND_INDEX_LAG_BLOCKS;
  const liveLag = Number(opts.onChainBlockNumber) - Number(index.indexedThroughBlock || 0);
  if (liveLag > maxLag) {
    return { usable: false, reason: 'block_lag_exceeded' };
  }
  const maxTail = opts.maxTailGap ?? MAX_TAIL_GAP;
  const tailGap =
    Number(opts.onChainNextTradeId) - Number(index.indexedNextTradeId || 1);
  if (tailGap < 0) {
    return { usable: false, reason: 'reorg_next_id_regression' };
  }
  if (tailGap > maxTail) {
    return { usable: false, reason: 'tail_gap_exceeded' };
  }
  return { usable: true, reason: 'fresh' };
}

export async function defaultFetchTradeIndexPage(
  params: FetchTradeIndexParams
): Promise<{ ok: boolean; status: number; data?: TradeIndexResponse }> {
  const sp = new URLSearchParams();
  if (params.wallet) sp.set('wallet', params.wallet);
  sp.set('filter', params.filter);
  sp.set('offset', String(Math.max(0, params.offset)));
  sp.set('limit', String(Math.max(1, Math.min(100, params.limit))));

  const res = await fetch(`/api/trades/index?${sp.toString()}`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal: params.signal,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const data = (await res.json()) as TradeIndexResponse;
  return { ok: true, status: res.status, data };
}

function defaultChunkSizeForChain(chainId: number): number {
  return Number(chainId) === 31337
    ? ANVIL_READ_CHUNK_SIZE
    : FUJI_READ_CHUNK_SIZE;
}

async function fetchTradesChunkedByIds(
  adapter: TradeChainAdapter,
  ids: number[],
  signal?: AbortSignal
): Promise<{ fetched: Map<number, TradeData>; getTradeCalls: number }> {
  throwIfAborted(signal);
  const uniqueIds = Array.from(new Set(ids.filter((id) => id >= 1)));
  if (uniqueIds.length === 0) {
    return { fetched: new Map(), getTradeCalls: 0 };
  }

  const chunkSize = defaultChunkSizeForChain(adapter.chainId);
  const chunks: number[][] = [];
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    chunks.push(uniqueIds.slice(i, i + chunkSize));
  }

  const fetched = new Map<number, TradeData>();
  let getTradeCalls = 0;

  for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_CHUNKS) {
    throwIfAborted(signal);
    const windowChunks = chunks.slice(i, i + MAX_CONCURRENT_CHUNKS);
    const results = await Promise.all(
      windowChunks.map(async (chunk) => {
        const res = await adapter.readTradesBatch(chunk, signal);
        return { count: chunk.length, res };
      })
    );
    throwIfAborted(signal);
    for (const part of results) {
      getTradeCalls += part.count;
      for (const [tid, trade] of part.res.entries()) {
        fetched.set(tid, trade);
      }
    }
  }

  return { fetched, getTradeCalls };
}

function recordVerifiedTradeInCache(
  cache: ScopedTradeCache,
  trade: TradeData,
  currentBlock: number,
  options: {
    backendConfirmedTerminal?: boolean;
    finalityDepthBlocks?: number;
    filterWallet?: string;
  }
): void {
  const tid = Number(trade.id);
  const finalityDepth = options.finalityDepthBlocks ?? REORG_LOOKBACK_BLOCKS;
  if (!isTerminalTradeState(trade.state)) {
    cache.terminalById.delete(tid);
    cache.pendingTerminalById.delete(tid);
    if (options.filterWallet) {
      cache.nonMatchingTerminalByWallet.get(options.filterWallet)?.delete(tid);
    }
    return;
  }

  // Promote to immutable terminal cache only when confirmed past reorg window:
  // (a) backend index already verified past REORG_LOOKBACK_BLOCKS,
  // (b) live chain block advanced >= finalityDepth blocks since first seen terminal, OR
  // (c) static/idle local chain (block unchanged) verified unchanged on a subsequent check.
  const prevPending = cache.pendingTerminalById.get(tid);
  let canPromote = Boolean(options.backendConfirmedTerminal);
  if (!canPromote && prevPending) {
    const blockDelta = currentBlock - prevPending.firstSeenBlock;
    const isSameStaticBlock = currentBlock <= prevPending.firstSeenBlock;
    if (
      blockDelta >= finalityDepth ||
      (isSameStaticBlock && prevPending.confirmations >= 1)
    ) {
      canPromote = true;
    }
  }

  if (canPromote) {
    cache.pendingTerminalById.delete(tid);
    cache.terminalById.set(tid, trade);
    if (options.filterWallet) {
      const matchesWallet =
        trade.seller.toLowerCase() === options.filterWallet ||
        trade.buyer.toLowerCase() === options.filterWallet;
      if (!matchesWallet) {
        let nonMatch = cache.nonMatchingTerminalByWallet.get(options.filterWallet);
        if (!nonMatch) {
          nonMatch = new Set();
          cache.nonMatchingTerminalByWallet.set(options.filterWallet, nonMatch);
        }
        nonMatch.add(tid);
      }
    }
  } else {
    cache.pendingTerminalById.set(tid, {
      trade,
      firstSeenBlock: prevPending ? prevPending.firstSeenBlock : currentBlock,
      confirmations: (prevPending?.confirmations ?? 0) + 1,
    });
  }
}

async function fetchAllIndexItemsForFilter(
  fetchPage: NonNullable<TradeChainAdapter['fetchIndexPage']>,
  params: { wallet?: string; filter: 'all' | 'disputed' | 'flagged' | 'active' },
  signal?: AbortSignal
): Promise<{
  ok: boolean;
  status: number;
  headPage?: TradeIndexResponse;
  items: TradeIndexItem[];
  pagesFetched: number;
}> {
  const pageLimit = 100;
  let offset = 0;
  let pagesFetched = 0;
  let headPage: TradeIndexResponse | undefined;
  const allItems: TradeIndexItem[] = [];
  const seenIds = new Set<number>();

  while (true) {
    throwIfAborted(signal);
    const resp = await fetchPage({
      wallet: params.wallet,
      filter: params.filter,
      offset,
      limit: pageLimit,
      signal,
    });
    pagesFetched += 1;
    if (!resp.ok || !resp.data) {
      return {
        ok: false,
        status: resp.status,
        headPage,
        items: [],
        pagesFetched,
      };
    }
    if (!headPage) {
      headPage = resp.data;
    }
    const batch = resp.data.items || [];
    for (const item of batch) {
      if (!seenIds.has(item.tradeId)) {
        seenIds.add(item.tradeId);
        allItems.push(item);
      }
    }
    offset += batch.length;
    if (batch.length < pageLimit || offset >= resp.data.totalMatching) {
      break;
    }
  }

  return {
    ok: true,
    status: 200,
    headPage,
    items: allItems,
    pagesFetched,
  };
}

export async function discoverWalletTrades(
  adapter: TradeChainAdapter,
  opts: {
    filterAddress?: string;
    isAuthenticated: boolean;
    signal?: AbortSignal;
    finalityDepthBlocks?: number;
  }
): Promise<{
  trades: TradeData[];
  totalCreated: number;
  metrics: DiscoveryMetrics;
}> {
  throwIfAborted(opts.signal);
  const walletLower = (opts.filterAddress || '').trim().toLowerCase();
  const [nextTradeId, currentBlock] = await Promise.all([
    adapter.readNextTradeId(opts.signal),
    adapter.readBlockNumber(opts.signal),
  ]);
  throwIfAborted(opts.signal);

  const totalCreated = Math.max(0, nextTradeId - 1);
  const metrics: DiscoveryMetrics = {
    usedBackendIndex: false,
    fallbackReason: null,
    getTradeCalls: 0,
    cacheHits: 0,
    indexPagesFetched: 0,
    tailIdsScanned: 0,
  };

  if (totalCreated === 0 || !walletLower) {
    return { trades: [], totalCreated, metrics };
  }

  const cache = getScopedCache(adapter.chainId, adapter.escrowAddress);
  syncCacheHeadOrFlushOnReorg(cache, currentBlock, nextTradeId);
  const fetchPage = adapter.fetchIndexPage ?? defaultFetchTradeIndexPage;

  let candidateIds: number[] | null = null;
  const backendTerminalById = new Map<number, boolean>();

  if (!opts.isAuthenticated) {
    metrics.fallbackReason = 'unauthenticated_direct_rpc';
  } else {
    try {
      const idxResult = await fetchAllIndexItemsForFilter(
        fetchPage,
        { wallet: walletLower, filter: 'all' },
        opts.signal
      );
      metrics.indexPagesFetched += idxResult.pagesFetched;
      throwIfAborted(opts.signal);

      if (!idxResult.ok || !idxResult.headPage) {
        metrics.fallbackReason = `index_http_${idxResult.status}`;
      } else {
        const freshness = evaluateIndexFreshness(idxResult.headPage, {
          chainId: adapter.chainId,
          escrowAddress: adapter.escrowAddress,
          onChainBlockNumber: currentBlock,
          onChainNextTradeId: nextTradeId,
        });
        if (!freshness.usable) {
          metrics.fallbackReason = freshness.reason;
        } else {
          metrics.usedBackendIndex = true;
          const idSet = new Set<number>();
          for (const item of idxResult.items) {
            if (item.tradeId >= 1 && item.tradeId < nextTradeId) {
              idSet.add(item.tradeId);
              backendTerminalById.set(item.tradeId, Boolean(item.isTerminal));
            }
          }
          // Always scan unindexed tail directly on-chain so newly created P2P or marketplace trades appear immediately
          const tailStart = Math.max(1, Number(idxResult.headPage.indexedNextTradeId || 1));
          for (let tid = tailStart; tid < nextTradeId; tid += 1) {
            idSet.add(tid);
            metrics.tailIdsScanned += 1;
          }
          candidateIds = Array.from(idSet).sort((a, b) => b - a);
        }
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      metrics.fallbackReason = 'index_fetch_error';
    }
  }

  const scanIds =
    candidateIds ?? Array.from({ length: totalCreated }, (_, i) => totalCreated - i);
  const nonMatchingCache =
    cache.nonMatchingTerminalByWallet.get(walletLower) ?? new Set<number>();

  const resultMap = new Map<number, TradeData>();
  const toFetch: number[] = [];

  for (const tid of scanIds) {
    const cachedTerminal = cache.terminalById.get(tid);
    if (cachedTerminal) {
      metrics.cacheHits += 1;
      if (
        cachedTerminal.seller.toLowerCase() === walletLower ||
        cachedTerminal.buyer.toLowerCase() === walletLower
      ) {
        resultMap.set(tid, cachedTerminal);
      }
      continue;
    }
    if (!candidateIds && nonMatchingCache.has(tid)) {
      metrics.cacheHits += 1;
      continue;
    }
    toFetch.push(tid);
  }

  const { fetched, getTradeCalls } = await fetchTradesChunkedByIds(
    adapter,
    toFetch,
    opts.signal
  );
  metrics.getTradeCalls += getTradeCalls;

  for (const [tid, trade] of fetched.entries()) {
    recordVerifiedTradeInCache(cache, trade, currentBlock, {
      backendConfirmedTerminal: backendTerminalById.get(tid) === true,
      finalityDepthBlocks: opts.finalityDepthBlocks,
      filterWallet: walletLower,
    });
    if (
      trade.seller.toLowerCase() === walletLower ||
      trade.buyer.toLowerCase() === walletLower
    ) {
      resultMap.set(tid, trade);
    }
  }

  const trades = Array.from(resultMap.values()).sort((a, b) =>
    b.id > a.id ? 1 : b.id < a.id ? -1 : 0
  );
  return { trades, totalCreated, metrics };
}

export interface DiscoverAdminResult {
  disputedTrades: TradeData[];
  flaggedTrades: TradeData[];
  pageTrades: TradeData[];
  totalCreated: number;
  page: number;
  pageSize: number;
  totalPages: number;
  usedFallback: boolean;
  fallbackReason: string | null;
  metrics: DiscoveryMetrics;
}

export async function discoverAdminTrades(
  adapter: TradeChainAdapter,
  opts: {
    activeTab: 'disputed' | 'flagged' | 'all';
    page: number;
    pageSize?: number;
    isAuthenticated: boolean;
    signal?: AbortSignal;
    finalityDepthBlocks?: number;
  }
): Promise<DiscoverAdminResult> {
  throwIfAborted(opts.signal);
  const pageSize = Math.max(1, opts.pageSize ?? ADMIN_ALL_PAGE_SIZE);
  const [nextTradeId, currentBlock] = await Promise.all([
    adapter.readNextTradeId(opts.signal),
    adapter.readBlockNumber(opts.signal),
  ]);
  throwIfAborted(opts.signal);

  const totalCreated = Math.max(0, nextTradeId - 1);
  const totalPages = Math.max(1, Math.ceil(totalCreated / pageSize));
  const safePage = Math.max(1, Math.min(opts.page, totalPages));

  const metrics: DiscoveryMetrics = {
    usedBackendIndex: false,
    fallbackReason: null,
    getTradeCalls: 0,
    cacheHits: 0,
    indexPagesFetched: 0,
    tailIdsScanned: 0,
  };

  if (totalCreated === 0) {
    return {
      disputedTrades: [],
      flaggedTrades: [],
      pageTrades: [],
      totalCreated: 0,
      page: 1,
      pageSize,
      totalPages: 1,
      usedFallback: false,
      fallbackReason: null,
      metrics,
    };
  }

  const cache = getScopedCache(adapter.chainId, adapter.escrowAddress);
  syncCacheHeadOrFlushOnReorg(cache, currentBlock, nextTradeId);
  const fetchPage = adapter.fetchIndexPage ?? defaultFetchTradeIndexPage;

  // Compute exact ID slice for the current "all" page (newest first)
  const pageStartId = totalCreated - (safePage - 1) * pageSize;
  const pageEndId = Math.max(1, pageStartId - pageSize + 1);
  const currentPageIds: number[] = [];
  if (opts.activeTab === 'all') {
    for (let tid = pageStartId; tid >= pageEndId; tid -= 1) {
      currentPageIds.push(tid);
    }
  }

  let openCandidateIds: number[] | null = null;
  let indexedNextTradeIdForCache = 1;
  const backendActiveIdSet = new Set<number>();
  const backendTerminalById = new Map<number, boolean>();

  if (!opts.isAuthenticated) {
    metrics.fallbackReason = 'unauthenticated_direct_rpc';
  } else {
    try {
      // Query active (non-terminal) trades — includes all open Disputed + Flagged + in-flight trades
      // so zero Disputed/Flagged transitions are missed inside the worker poll interval.
      const activeIdx = await fetchAllIndexItemsForFilter(
        fetchPage,
        { filter: 'active' },
        opts.signal
      );
      metrics.indexPagesFetched += activeIdx.pagesFetched;
      throwIfAborted(opts.signal);

      if (!activeIdx.ok || !activeIdx.headPage) {
        metrics.fallbackReason = `index_http_${activeIdx.status}`;
      } else {
        const freshness = evaluateIndexFreshness(activeIdx.headPage, {
          chainId: adapter.chainId,
          escrowAddress: adapter.escrowAddress,
          onChainBlockNumber: currentBlock,
          onChainNextTradeId: nextTradeId,
        });
        if (!freshness.usable) {
          metrics.fallbackReason = freshness.reason;
        } else if (
          Number(activeIdx.headPage.summary?.activeCount || 0) >
          MAX_OPEN_VERIFY_BATCH
        ) {
          metrics.fallbackReason = 'active_batch_threshold_exceeded';
        } else {
          metrics.usedBackendIndex = true;
          indexedNextTradeIdForCache = Number(
            activeIdx.headPage.indexedNextTradeId || 1
          );
          const idSet = new Set<number>();
          for (const item of activeIdx.items) {
            if (item.tradeId >= 1 && item.tradeId < nextTradeId) {
              idSet.add(item.tradeId);
              backendActiveIdSet.add(item.tradeId);
              backendTerminalById.set(item.tradeId, Boolean(item.isTerminal));
            }
          }
          // Scan any unindexed tail IDs directly on-chain
          const tailStart = Math.max(1, indexedNextTradeIdForCache);
          for (let tid = tailStart; tid < nextTradeId; tid += 1) {
            idSet.add(tid);
            metrics.tailIdsScanned += 1;
          }
          openCandidateIds = Array.from(idSet);
        }
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      metrics.fallbackReason = 'index_fetch_error';
    }
  }

  // Decide the complete set of IDs that need live on-chain verification
  const usedFallback = !metrics.usedBackendIndex;
  const fallbackIds = usedFallback
    ? Array.from({ length: totalCreated }, (_, i) => totalCreated - i)
    : [];
  const allTargetIds = new Set<number>([
    ...currentPageIds,
    ...(openCandidateIds ?? fallbackIds),
  ]);

  const resolvedById = new Map<number, TradeData>();
  const toFetch: number[] = [];

  for (const tid of allTargetIds) {
    const cachedTerminal = cache.terminalById.get(tid);
    if (cachedTerminal) {
      metrics.cacheHits += 1;
      resolvedById.set(tid, cachedTerminal);
    } else {
      toFetch.push(tid);
    }
  }

  // Sort newest first so highest IDs resolve first cleanly
  toFetch.sort((a, b) => b - a);
  const { fetched, getTradeCalls } = await fetchTradesChunkedByIds(
    adapter,
    toFetch,
    opts.signal
  );
  metrics.getTradeCalls += getTradeCalls;

  for (const [tid, trade] of fetched.entries()) {
    const inferredFinalizedByCompleteActiveIndex =
      metrics.usedBackendIndex &&
      tid < indexedNextTradeIdForCache &&
      !backendActiveIdSet.has(tid);
    recordVerifiedTradeInCache(cache, trade, currentBlock, {
      backendConfirmedTerminal:
        backendTerminalById.get(tid) === true ||
        inferredFinalizedByCompleteActiveIndex,
      finalityDepthBlocks: opts.finalityDepthBlocks,
    });
    resolvedById.set(tid, trade);
  }

  const sortedVerifiedOpenPool = Array.from(resolvedById.values()).sort((a, b) =>
    b.id > a.id ? 1 : b.id < a.id ? -1 : 0
  );

  const disputedTrades = sortedVerifiedOpenPool.filter((t) => t.state === 3);
  const flaggedTrades = sortedVerifiedOpenPool.filter(
    (t) => t.flagged && !isTerminalTradeState(t.state)
  );
  const pageTrades = currentPageIds
    .map((tid) => resolvedById.get(tid))
    .filter((t): t is TradeData => Boolean(t));

  return {
    disputedTrades,
    flaggedTrades,
    pageTrades,
    totalCreated,
    page: safePage,
    pageSize,
    totalPages,
    usedFallback,
    fallbackReason: metrics.fallbackReason,
    metrics,
  };
}

export interface MinimalPublicClient {
  readContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<unknown>;
  getBlockNumber: () => Promise<bigint>;
  multicall?: (args: {
    contracts: Array<{
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
    }>;
    allowFailure?: boolean;
  }) => Promise<Array<{ status: string; result?: unknown; error?: unknown }>>;
}

export function createPublicClientTradeAdapter(opts: {
  chainId: number;
  escrowAddress: `0x${string}`;
  escrowAbi: readonly unknown[];
  publicClient: MinimalPublicClient;
  fetchIndexPage?: TradeChainAdapter['fetchIndexPage'];
}): TradeChainAdapter {
  const { chainId, escrowAddress, escrowAbi, publicClient } = opts;

  return {
    chainId,
    escrowAddress,
    fetchIndexPage: opts.fetchIndexPage,
    readNextTradeId: async (signal?: AbortSignal) => {
      throwIfAborted(signal);
      const raw = await publicClient.readContract({
        address: escrowAddress,
        abi: escrowAbi,
        functionName: 'nextTradeId',
      });
      throwIfAborted(signal);
      return Number(raw || 1);
    },
    readBlockNumber: async (signal?: AbortSignal) => {
      throwIfAborted(signal);
      const raw = await publicClient.getBlockNumber();
      throwIfAborted(signal);
      return Number(raw || 0);
    },
    readTradesBatch: async (ids: number[], signal?: AbortSignal) => {
      throwIfAborted(signal);
      const out = new Map<number, TradeData>();
      if (ids.length === 0) return out;

      if (Number(chainId) !== 31337 && typeof publicClient.multicall === 'function') {
        try {
          const results = await publicClient.multicall({
            contracts: ids.map((tid) => ({
              address: escrowAddress,
              abi: escrowAbi,
              functionName: 'getTrade',
              args: [BigInt(tid)],
            })),
            allowFailure: true,
          });
          throwIfAborted(signal);
          let successCount = 0;
          let firstFailure: unknown = null;
          results.forEach((res, idx) => {
            if (res.status === 'success' && res.result !== undefined) {
              successCount += 1;
              const parsed = parseRawTrade(ids[idx], res.result);
              if (parsed) out.set(ids[idx], parsed);
            } else if (!firstFailure) {
              firstFailure = res.error ?? new Error('multicall getTrade failed');
            }
          });
          if (results.length > 0 && successCount === 0 && firstFailure) {
            throw firstFailure instanceof Error
              ? firstFailure
              : new Error(String(firstFailure));
          }
          return out;
        } catch (err) {
          if ((err as { name?: string })?.name === 'AbortError') throw err;
          const msg = String(
            err instanceof Error ? err.message : err ?? ''
          ).toLowerCase();
          // Do not amplify rate-limit/timeout/network failures into 50 parallel direct eth_call requests
          const isTransientRpcFailure =
            msg.includes('429') ||
            msg.includes('rate') ||
            msg.includes('timeout') ||
            msg.includes('timed out') ||
            msg.includes('network') ||
            msg.includes('fetch');
          if (isTransientRpcFailure) {
            throw err;
          }
          // Fall back to direct readContract only if multicall3 is unavailable or unsupported on chain
        }
      }

      const directResults = await Promise.all(
        ids.map(async (tid) => {
          throwIfAborted(signal);
          const raw = await publicClient.readContract({
            address: escrowAddress,
            abi: escrowAbi,
            functionName: 'getTrade',
            args: [BigInt(tid)],
          });
          return { tid, raw };
        })
      );
      throwIfAborted(signal);
      for (const item of directResults) {
        const parsed = parseRawTrade(item.tid, item.raw);
        if (parsed) out.set(item.tid, parsed);
      }
      return out;
    },
  };
}

