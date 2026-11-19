import { formatEther, parseEther } from 'viem';

/**
 * Marketplace Client Library & DTO Types (MKT-003).
 * - Tương thích DTO của `backend/listings.py`.
 * - Xử lý giá AVAX/wei hoàn toàn bằng chuỗi hoặc bigint, không dùng float.
 * - Giao tiếp qua các route BFF `/api/*` (không giữ secret ở trình duyệt).
 */

export const LISTING_CATEGORIES = [
  'LEGO',
  'MODEL_KIT',
  'FIGURE',
  'TRADING_CARD',
  'COIN',
  'OTHER',
] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

export const LISTING_CONDITIONS = [
  'SEALED_NEW',
  'LIKE_NEW',
  'USED_GOOD',
  'USED_FAIR',
  'GRADED',
] as const;
export type ListingCondition = (typeof LISTING_CONDITIONS)[number];

export const LISTING_STATUSES = [
  'ACTIVE',
  'RESERVED',
  'SOLD',
  'PAUSED',
  'CANCELLED',
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export type SellerEditableStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';

export const REQUEST_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'ESCROW_CREATED',
  'COMPLETED',
  'TRADE_CANCELLED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const DEPOSIT_BPS = 3000n;
const BPS_DENOMINATOR = 10000n;

export interface ListingImageInput {
  uri: string;
  is_primary?: boolean;
}

export interface ListingImageDto {
  id: number;
  cid: string;
  uri: string;
  sort_order: number;
  is_primary: boolean;
}

export interface ListingWarningDto {
  code: string;
  severity: string;
  message: string;
  matched_listing_id?: string;
  matched_sku?: string;
  hamming_distance?: number;
  same_seller?: boolean;
}

export interface LinkedTradeDto {
  trade_id: number;
  request_id: string;
  tx_hash: string;
  synced_state: string;
  flagged: boolean;
  last_synced_at: number;
}

export interface ListingDto {
  id: string;
  chain_id: number;
  escrow_address: string;
  seller_wallet: string;
  sku: string;
  sku_norm: string;
  category: ListingCategory;
  title: string;
  description: string;
  price_wei: string;
  deposit_required_wei: string;
  collateral_asset: 'AVAX';
  accounting_token: 'CDU';
  condition: ListingCondition;
  quantity_total: number;
  quantity_reserved: number;
  quantity_sold: number;
  quantity_available: number;
  primary_image_uri: string;
  primary_image_sha256: string;
  primary_image_phash: string;
  images: ListingImageDto[];
  review_required: boolean;
  warnings: ListingWarningDto[];
  status: ListingStatus;
  seller_reputation: number | null;
  linked_trades: LinkedTradeDto[];
  created_at: number;
  updated_at: number;
}

export interface PurchaseRequestListingSummary {
  id: string;
  sku: string;
  title: string;
  category: ListingCategory;
  condition: ListingCondition;
  primary_image_uri: string;
  status: ListingStatus;
}

export interface PurchaseRequestDto {
  id: string;
  listing_id: string;
  chain_id: number;
  escrow_address: string;
  seller_wallet: string;
  buyer_wallet: string;
  quantity: number;
  unit_price_wei: string;
  total_value_wei: string;
  deposit_required_wei: string;
  collateral_asset: 'AVAX';
  accounting_token: 'CDU';
  buyer_note: string;
  seller_note: string;
  status: RequestStatus;
  reservation_expires_at: number | null;
  trade_id: number | null;
  tx_hash: string | null;
  synced_state: string | null;
  listing: PurchaseRequestListingSummary | null;
  created_at: number;
  updated_at: number;
  recovered?: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  _notModified?: boolean;
}

export interface MarketplaceRequestOptions {
  signal?: AbortSignal;
  sessionScope?: string | null;
  chainScope?: string | number | null;
}

export interface TradeSyncDto {
  trade_id: number;
  bound: boolean;
  listing_id?: string;
  request_id?: string;
  synced_state: string;
  flagged: boolean;
  request_status?: RequestStatus | null;
  listing_status?: ListingStatus | null;
  quantity_reserved?: number | null;
  quantity_sold?: number | null;
  last_synced_at?: number;
}

export interface TradeContextDto {
  trade_id: number;
  bound: boolean;
  listing_id?: string;
  request_id?: string;
  tx_hash?: string;
  synced_state?: string;
  flagged?: boolean;
  last_synced_at?: number;
  request_status?: RequestStatus | null;
  quantity?: number | null;
  unit_price_wei?: string | null;
  total_value_wei?: string | null;
  deposit_required_wei?: string | null;
  collateral_asset?: 'AVAX';
  accounting_token?: 'CDU';
  listing?: ListingDto | null;
}

export interface ListingsQuery {
  q?: string;
  category?: ListingCategory;
  condition?: ListingCondition;
  status?: string;
  seller?: string;
  min_price_wei?: string;
  max_price_wei?: string;
  in_stock_only?: boolean;
  sort?: 'newest' | 'price_asc' | 'price_desc';
  page?: number;
  limit?: number;
}

export interface RequestsQuery {
  role?: 'buyer' | 'seller' | 'all';
  status?: string;
  page?: number;
  limit?: number;
}

export interface CreateListingInput {
  sku: string;
  category: ListingCategory;
  title: string;
  description?: string;
  price_wei: string;
  condition: ListingCondition;
  quantity_total: number;
  images: ListingImageInput[];
}

export interface UpdateListingInput {
  sku?: string;
  category?: ListingCategory;
  title?: string;
  description?: string;
  price_wei?: string;
  condition?: ListingCondition;
  quantity_total?: number;
  images?: ListingImageInput[];
  status?: SellerEditableStatus;
}

export interface CreatePurchaseRequestInput {
  quantity?: number;
  buyer_note?: string;
}

export interface DecisionInput {
  action: 'accept' | 'reject';
  seller_note?: string;
}

export interface CancelRequestInput {
  reason?: string;
}

export interface BindTradeInput {
  tx_hash: string;
  trade_id?: number;
}

export interface MutationOptions {
  idempotencyKey?: string;
}

// ---------------------------------------------------------------------------
// Xử lý giá AVAX / wei chính xác bằng chuỗi và bigint (không dùng float)
// ---------------------------------------------------------------------------

export function parseWeiString(value: string | bigint): bigint {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new Error('Giá trị wei không được âm.');
    return value;
  }
  if (typeof value !== 'string') {
    throw new Error('Giá trị wei phải là chuỗi hoặc bigint.');
  }
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error('Giá trị wei phải là chuỗi số nguyên không âm.');
  }
  return BigInt(trimmed);
}

/** Chuyển chuỗi số AVAX người dùng nhập (vd "2.5") sang chuỗi wei chính xác, không qua float. */
export function avaxInputToWeiString(avaxInput: string): string {
  const trimmed = avaxInput.trim();
  if (!/^\d+(?:\.\d{1,18})?$/.test(trimmed)) {
    throw new Error('Giá AVAX không hợp lệ (tối đa 18 chữ số thập phân).');
  }
  const wei = parseEther(trimmed);
  if (wei <= 0n) {
    throw new Error('Giá AVAX phải lớn hơn 0.');
  }
  return wei.toString();
}

/** Định dạng chuỗi wei sang chuỗi AVAX bằng BigInt/string, không làm mất độ chính xác IEEE-754. */
export function weiToAvaxString(weiValue: string | bigint, maxDecimals = 6): string {
  const wei = parseWeiString(weiValue);
  const full = formatEther(wei);
  const [whole, frac = ''] = full.split('.');
  const formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (!frac || maxDecimals <= 0) return formattedWhole;
  const trimmedFrac = frac.slice(0, maxDecimals).replace(/0+$/, '');
  return trimmedFrac ? `${formattedWhole}.${trimmedFrac}` : formattedWhole;
}

/** Tiền cọc 30% AVAX khớp chính xác `deposit_for_wei()` trong `backend/listings.py`. */
export function computeDepositWeiString(totalWei: string | bigint): string {
  const amount = parseWeiString(totalWei);
  return ((amount * DEPOSIT_BPS) / BPS_DENOMINATOR).toString();
}

export function computeTotalValueWeiString(
  unitPriceWei: string | bigint,
  quantity: number | bigint
): string {
  const unit = parseWeiString(unitPriceWei);
  const qty = typeof quantity === 'bigint' ? quantity : BigInt(quantity);
  if (qty <= 0n) throw new Error('Số lượng phải lớn hơn 0.');
  return (unit * qty).toString();
}

// ---------------------------------------------------------------------------
// Chuẩn hóa lỗi API (401, 403, 409, 502, 503 + các mã lỗi Marketplace)
// ---------------------------------------------------------------------------

const ERROR_CODE_MESSAGES: Record<string, string> = {
  CHAIN_UNVERIFIED_CANNOT_RELEASE:
    'Chưa thể xác minh trạng thái Escrow trên blockchain lúc này, hệ thống giữ nguyên đơn để tránh mở bán trùng.',
  ONCHAIN_TRADE_ALREADY_EXISTS:
    'Giao dịch Escrow đã được tạo trên blockchain cho yêu cầu này. Vui lòng đồng bộ hoặc xử lý trực tiếp trên hợp đồng.',
  INSUFFICIENT_STOCK_AFTER_EXPIRY:
    'Yêu cầu giữ chỗ đã hết hạn và tồn kho hiện tại không còn đủ để khôi phục liên kết.',
  OUT_OF_STOCK_OR_RESERVED:
    'Sản phẩm không còn đủ số lượng khả dụng để giữ chỗ.',
  LISTING_UNAVAILABLE:
    'Sản phẩm hiện không mở bán hoặc đã được giữ chỗ.',
  RESERVATION_STILL_ACTIVE:
    'Đơn đang trong thời hạn giữ chỗ cho người bán tạo giao dịch Escrow.',
  DUPLICATE_ACTIVE_SKU:
    'SKU này đang được sử dụng ở một tin đăng khác của bạn.',
  DUPLICATE_ACTIVE_REQUEST:
    'Bạn đã có yêu cầu đang chờ duyệt hoặc đang giữ chỗ cho sản phẩm này.',
  CSRF_REJECTED:
    'Yêu cầu bị từ chối vì không vượt qua kiểm tra bảo mật CSRF.',
  UNAUTHORIZED:
    'Phiên đăng nhập chưa hợp lệ hoặc đã hết hạn. Vui lòng xác thực lại ví.',
  FORBIDDEN:
    'Bạn không có quyền thực hiện thao tác này.',
  CHAIN_MISMATCH:
    'Mạng ví hiện tại không khớp với mạng đang phục vụ.',
  BACKEND_UNREACHABLE:
    'Không kết nối được máy chủ Marketplace.',
  SHARED_BACKEND_UNCONFIGURED:
    'Chế độ Shared Client chưa được cấu hình SHARED_API_URL. Khi chạy trước Phase 4, hãy truyền SHARED_API_URL=<Ops URL> lúc khởi động Docker hoặc dùng Local Compose (docker compose up --build -d).',
  SHARED_BACKEND_INVALID_URL:
    'URL máy chủ Ops (SHARED_API_URL) không hợp lệ; bắt buộc sử dụng địa chỉ http:// hoặc https:// đầy đủ.',
  BFF_MISCONFIGURED:
    'Dịch vụ Marketplace tạm thời chưa sẵn sàng.',
};

export class MarketplaceApiError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    errorCode: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MarketplaceApiError';
    this.status = status;
    this.errorCode = errorCode;
    this.details = details;
  }
}

export function normalizeMarketplaceErrorResponse(
  status: number,
  payload: unknown
): MarketplaceApiError {
  const obj =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const errorCode =
    (typeof obj.error_code === 'string' && obj.error_code) || `HTTP_${status}`;
  const serverMessage =
    (typeof obj.message === 'string' && obj.message) ||
    (typeof obj.detail === 'string' && obj.detail) ||
    (typeof obj.error === 'string' && obj.error) ||
    '';
  const details =
    obj.details && typeof obj.details === 'object'
      ? (obj.details as Record<string, unknown>)
      : undefined;

  let fallbackByStatus = `Yêu cầu Marketplace thất bại (HTTP ${status}).`;
  if (status === 401) fallbackByStatus = ERROR_CODE_MESSAGES.UNAUTHORIZED;
  else if (status === 403) fallbackByStatus = ERROR_CODE_MESSAGES.FORBIDDEN;
  else if (status === 409) fallbackByStatus = 'Xung đột trạng thái dữ liệu trên Marketplace.';
  else if (status === 502) fallbackByStatus = 'Lỗi kết nối dữ liệu từ blockchain/upstream.';
  else if (status === 503) fallbackByStatus = 'Dịch vụ Marketplace tạm thời gián đoạn.';

  const message = ERROR_CODE_MESSAGES[errorCode] || serverMessage || fallbackByStatus;
  return new MarketplaceApiError(status, errorCode, message, details);
}

// ---------------------------------------------------------------------------
// API Helpers gọi Next.js BFF `/api/*`
// ---------------------------------------------------------------------------

export const POLL_BASE_INTERVAL_MS = 5_000;
export const POLL_MAX_BACKOFF_MS = 30_000;
export const MAX_ETAG_CACHE_ENTRIES = 50;

/**
 * Chuẩn hóa chuỗi thời gian chờ polling backoff:
 * - consecutiveFailures <= 0 -> 5,000 ms (5s)
 * - consecutiveFailures == 1 -> 10,000 ms (10s)
 * - consecutiveFailures == 2 -> 20,000 ms (20s)
 * - consecutiveFailures >= 3 -> 30,000 ms (30s)
 */
export function computePollDelayMs(
  consecutiveFailures: number,
  baseIntervalMs = POLL_BASE_INTERVAL_MS,
  maxBackoffMs = POLL_MAX_BACKOFF_MS
): number {
  if (!Number.isFinite(consecutiveFailures) || consecutiveFailures <= 0) {
    return baseIntervalMs;
  }
  const exp = Math.min(10, Math.floor(consecutiveFailures));
  return Math.min(maxBackoffMs, baseIntervalMs * Math.pow(2, exp));
}

export interface PollExecutionContext {
  signal: AbortSignal;
  silent: boolean;
  seq: number;
  isCurrent: () => boolean;
}

export interface NonOverlappingPollControllerOptions {
  baseIntervalMs?: number;
  maxBackoffMs?: number;
  canPoll?: () => boolean;
  isVisible?: () => boolean;
  setTimer?: (fn: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (id: ReturnType<typeof setTimeout>) => void;
  runTask: (ctx: PollExecutionContext) => Promise<void>;
}

export interface NonOverlappingPollController {
  trigger: (opts?: { silent?: boolean }) => Promise<void>;
  onVisibilityOrStateChange: () => void;
  dispose: () => void;
  getState: () => {
    inFlight: boolean;
    seq: number;
    consecutiveFailures: number;
    hasScheduledTimer: boolean;
  };
}

export function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') {
    return true;
  }
  return false;
}

export function createNonOverlappingPollController(
  options: NonOverlappingPollControllerOptions
): NonOverlappingPollController {
  const baseIntervalMs = options.baseIntervalMs ?? POLL_BASE_INTERVAL_MS;
  const maxBackoffMs = options.maxBackoffMs ?? POLL_MAX_BACKOFF_MS;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((id) => clearTimeout(id));
  const checkVisible =
    options.isVisible ??
    (() =>
      typeof document === 'undefined' ||
      document.visibilityState === 'visible');
  const checkCanPoll = options.canPoll ?? (() => true);

  let mounted = true;
  let inFlight = false;
  let seq = 0;
  let consecutiveFailures = 0;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;

  function cancelScheduledTimer(): void {
    if (timerId !== null) {
      clearTimer(timerId);
      timerId = null;
    }
  }

  function scheduleNext(): void {
    cancelScheduledTimer();
    if (!mounted || inFlight) return;
    if (!checkVisible() || !checkCanPoll()) return;
    const delay = computePollDelayMs(
      consecutiveFailures,
      baseIntervalMs,
      maxBackoffMs
    );
    timerId = setTimer(() => {
      timerId = null;
      void trigger({ silent: true });
    }, delay);
  }

  async function trigger(opts?: { silent?: boolean }): Promise<void> {
    if (!mounted) return;
    const silent = Boolean(opts?.silent);

    if (silent) {
      if (inFlight) return;
      if (!checkVisible() || !checkCanPoll()) {
        cancelScheduledTimer();
        return;
      }
    } else {
      cancelScheduledTimer();
      consecutiveFailures = 0;
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
    }

    cancelScheduledTimer();
    const currentSeq = ++seq;
    const controller = new AbortController();
    abortController = controller;
    inFlight = true;

    const isCurrent = () =>
      mounted && !controller.signal.aborted && currentSeq === seq;

    try {
      await options.runTask({
        signal: controller.signal,
        silent,
        seq: currentSeq,
        isCurrent,
      });
      if (isCurrent()) {
        consecutiveFailures = 0;
      }
    } catch (err) {
      if (isCurrent() && !isAbortError(err, controller.signal)) {
        consecutiveFailures += 1;
      }
    } finally {
      if (currentSeq === seq) {
        inFlight = false;
        abortController = null;
        if (mounted && checkVisible() && checkCanPoll()) {
          scheduleNext();
        }
      }
    }
  }

  function onVisibilityOrStateChange(): void {
    if (!mounted) return;
    if (!checkVisible() || !checkCanPoll()) {
      cancelScheduledTimer();
      return;
    }
    consecutiveFailures = 0;
    if (!inFlight) {
      cancelScheduledTimer();
      void trigger({ silent: true });
    }
  }

  function dispose(): void {
    mounted = false;
    seq += 1;
    cancelScheduledTimer();
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    inFlight = false;
  }

  return {
    trigger,
    onVisibilityOrStateChange,
    dispose,
    getState: () => ({
      inFlight,
      seq,
      consecutiveFailures,
      hasScheduledTimer: timerId !== null,
    }),
  };
}

function buildQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  const sortedKeys = Object.keys(params).sort();
  for (const k of sortedKeys) {
    const v = params[k];
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

interface ListingsEtagCacheEntry {
  etag: string;
  payload: PaginatedResponse<ListingDto>;
  epoch: number;
}

const listingsEtagCache = new Map<string, ListingsEtagCacheEntry>();
let cacheEpoch = 0;
let activeScopeKey: string | null = null;

function normalizeSessionScope(rawScope?: string | null): string {
  if (!rawScope || typeof rawScope !== 'string') return 'anon';
  const trimmed = rawScope.trim().toLowerCase();
  if (!trimmed || trimmed === 'anon') return 'anon';
  // Chỉ chấp nhận địa chỉ ví chuẩn 0x...40 hex để tuyệt đối không lưu JWT/token/secret vào khóa cache
  if (/^0x[0-9a-f]{40}$/.test(trimmed)) {
    return trimmed;
  }
  return 'anon';
}

function normalizeChainScope(rawChain?: string | number | null): string {
  const candidate =
    rawChain !== undefined && rawChain !== null && String(rawChain).trim() !== ''
      ? String(rawChain).trim()
      : typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CHAIN_ID
        ? String(process.env.NEXT_PUBLIC_CHAIN_ID).trim()
        : 'default';
  if (/^\d{1,12}$/.test(candidate) || candidate === 'default') {
    return candidate;
  }
  return 'default';
}

function cloneListingsPayload(
  payload: PaginatedResponse<ListingDto>
): PaginatedResponse<ListingDto> {
  const items = Array.isArray(payload.items)
    ? payload.items.map((item) => ({
        ...item,
        images: Array.isArray(item.images)
          ? item.images.map((img) => ({ ...img }))
          : [],
        warnings: Array.isArray(item.warnings)
          ? item.warnings.map((w) => ({ ...w }))
          : [],
        linked_trades: Array.isArray(item.linked_trades)
          ? item.linked_trades.map((lt) => ({ ...lt }))
          : [],
      }))
    : [];
  return {
    total: payload.total,
    page: payload.page,
    limit: payload.limit,
    total_pages: payload.total_pages,
    items,
  };
}

function setListingsEtagCacheEntry(
  cacheKey: string,
  entry: ListingsEtagCacheEntry
): void {
  if (listingsEtagCache.has(cacheKey)) {
    listingsEtagCache.delete(cacheKey);
  } else if (listingsEtagCache.size >= MAX_ETAG_CACHE_ENTRIES) {
    const oldestKey = listingsEtagCache.keys().next().value;
    if (oldestKey !== undefined) {
      listingsEtagCache.delete(oldestKey);
    }
  }
  listingsEtagCache.set(cacheKey, entry);
}

export function clearListingsEtagCache(): void {
  cacheEpoch += 1;
  listingsEtagCache.clear();
}

export function getListingsEtagCacheStats(): {
  size: number;
  epoch: number;
  keys: string[];
} {
  return {
    size: listingsEtagCache.size,
    epoch: cacheEpoch,
    keys: Array.from(listingsEtagCache.keys()),
  };
}

function resolveIdempotencyKey(opts?: MutationOptions): string {
  if (opts?.idempotencyKey && opts.idempotencyKey.trim()) {
    return opts.idempotencyKey.trim();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

async function requestBff<T>(
  path: string,
  init: {
    method: 'GET' | 'POST' | 'PATCH';
    body?: unknown;
    idempotencyKey?: string;
    signal?: AbortSignal;
    extraHeaders?: Record<string, string>;
  }
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.extraHeaders || {}),
  };
  let encodedBody: string | undefined;

  if (init.body !== undefined && init.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    encodedBody = JSON.stringify(init.body);
  }
  if (init.idempotencyKey) {
    headers['Idempotency-Key'] = init.idempotencyKey;
  }

  const res = await fetch(path, {
    method: init.method,
    headers,
    body: encodedBody,
    cache: 'no-store',
    signal: init.signal,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw normalizeMarketplaceErrorResponse(res.status, payload);
  }
  return payload as T;
}

export async function browseListings(
  query: ListingsQuery = {},
  opts?: MarketplaceRequestOptions
): Promise<PaginatedResponse<ListingDto>> {
  const sessionScope = normalizeSessionScope(opts?.sessionScope);
  const chainScope = normalizeChainScope(opts?.chainScope);
  const scopeKey = `${sessionScope}::${chainScope}`;

  if (
    (opts?.sessionScope !== undefined || opts?.chainScope !== undefined) &&
    activeScopeKey !== null &&
    activeScopeKey !== scopeKey
  ) {
    clearListingsEtagCache();
  }
  if (opts?.sessionScope !== undefined || opts?.chainScope !== undefined) {
    activeScopeKey = scopeKey;
  }

  const qs = buildQueryString({ ...query });
  const path = `/api/listings${qs}`;
  const cacheKey = `${scopeKey}::${path}`;
  const requestEpoch = cacheEpoch;
  const cachedAtStart = listingsEtagCache.get(cacheKey);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (cachedAtStart && cachedAtStart.epoch === requestEpoch && cachedAtStart.etag) {
    headers['If-None-Match'] = cachedAtStart.etag;
  }

  const res = await fetch(path, {
    method: 'GET',
    headers,
    cache: 'no-store',
    signal: opts?.signal,
  });

  if (res.status === 304) {
    const currentCached = listingsEtagCache.get(cacheKey);
    if (
      currentCached &&
      currentCached.epoch === cacheEpoch &&
      requestEpoch === cacheEpoch
    ) {
      // Refresh LRU order on cache hit
      listingsEtagCache.delete(cacheKey);
      listingsEtagCache.set(cacheKey, currentCached);
      const cloned = cloneListingsPayload(currentCached.payload);
      return { ...cloned, _notModified: true };
    }

    // Fallback giới hạn đúng 1 lần retry GET không gửi If-None-Match khi cache đã bị xóa/evict giữa chừng
    const retryEpoch = cacheEpoch;
    const retryRes = await fetch(path, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: opts?.signal,
    });
    const retryPayload = await retryRes.json().catch(() => ({}));
    if (!retryRes.ok || retryRes.status === 304) {
      throw normalizeMarketplaceErrorResponse(
        retryRes.status === 304 ? 502 : retryRes.status,
        retryPayload
      );
    }
    const normalizedRetry = cloneListingsPayload(
      retryPayload as PaginatedResponse<ListingDto>
    );
    const retryEtag = retryRes.headers?.get?.('etag')?.trim() || '';
    if (retryEtag && retryEpoch === cacheEpoch) {
      setListingsEtagCacheEntry(cacheKey, {
        etag: retryEtag,
        payload: cloneListingsPayload(normalizedRetry),
        epoch: retryEpoch,
      });
    }
    return { ...normalizedRetry, _notModified: false };
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw normalizeMarketplaceErrorResponse(res.status, payload);
  }

  const normalizedPayload = cloneListingsPayload(
    payload as PaginatedResponse<ListingDto>
  );
  const etag = res.headers?.get?.('etag')?.trim() || '';
  if (etag && requestEpoch === cacheEpoch) {
    setListingsEtagCacheEntry(cacheKey, {
      etag,
      payload: cloneListingsPayload(normalizedPayload),
      epoch: requestEpoch,
    });
  }
  return { ...normalizedPayload, _notModified: false };
}

export async function getMyListings(
  query: Omit<ListingsQuery, 'seller'> = {},
  opts?: MarketplaceRequestOptions
): Promise<PaginatedResponse<ListingDto>> {
  const qs = buildQueryString({ ...query });
  return requestBff<PaginatedResponse<ListingDto>>(`/api/listings/mine${qs}`, {
    method: 'GET',
    signal: opts?.signal,
  });
}

export async function getListing(
  listingId: string,
  opts?: MarketplaceRequestOptions
): Promise<ListingDto> {
  return requestBff<ListingDto>(`/api/listings/${encodeURIComponent(listingId)}`, {
    method: 'GET',
    signal: opts?.signal,
  });
}

export async function createListing(
  input: CreateListingInput,
  opts?: MutationOptions
): Promise<ListingDto> {
  clearListingsEtagCache();
  try {
    return await requestBff<ListingDto>('/api/listings', {
      method: 'POST',
      body: input,
      idempotencyKey: resolveIdempotencyKey(opts),
    });
  } finally {
    clearListingsEtagCache();
  }
}

export async function updateListing(
  listingId: string,
  input: UpdateListingInput
): Promise<ListingDto> {
  clearListingsEtagCache();
  try {
    return await requestBff<ListingDto>(
      `/api/listings/${encodeURIComponent(listingId)}`,
      {
        method: 'PATCH',
        body: input,
      }
    );
  } finally {
    clearListingsEtagCache();
  }
}

export async function createPurchaseRequest(
  listingId: string,
  input: CreatePurchaseRequestInput = { quantity: 1 },
  opts?: MutationOptions
): Promise<PurchaseRequestDto> {
  clearListingsEtagCache();
  try {
    return await requestBff<PurchaseRequestDto>(
      `/api/listings/${encodeURIComponent(listingId)}/requests`,
      {
        method: 'POST',
        body: input,
        idempotencyKey: resolveIdempotencyKey(opts),
      }
    );
  } finally {
    clearListingsEtagCache();
  }
}

export async function listPurchaseRequests(
  query: RequestsQuery = {},
  opts?: MarketplaceRequestOptions
): Promise<PaginatedResponse<PurchaseRequestDto>> {
  const qs = buildQueryString({ ...query });
  return requestBff<PaginatedResponse<PurchaseRequestDto>>(`/api/requests${qs}`, {
    method: 'GET',
    signal: opts?.signal,
  });
}

export async function getPurchaseRequest(
  requestId: string,
  opts?: MarketplaceRequestOptions
): Promise<PurchaseRequestDto> {
  return requestBff<PurchaseRequestDto>(
    `/api/requests/${encodeURIComponent(requestId)}`,
    {
      method: 'GET',
      signal: opts?.signal,
    }
  );
}

export async function decidePurchaseRequest(
  requestId: string,
  input: DecisionInput,
  opts?: MutationOptions
): Promise<PurchaseRequestDto> {
  clearListingsEtagCache();
  try {
    return await requestBff<PurchaseRequestDto>(
      `/api/requests/${encodeURIComponent(requestId)}/decision`,
      {
        method: 'POST',
        body: input,
        idempotencyKey: resolveIdempotencyKey(opts),
      }
    );
  } finally {
    clearListingsEtagCache();
  }
}

export async function cancelPurchaseRequest(
  requestId: string,
  input: CancelRequestInput = {},
  opts?: MutationOptions
): Promise<PurchaseRequestDto> {
  clearListingsEtagCache();
  try {
    return await requestBff<PurchaseRequestDto>(
      `/api/requests/${encodeURIComponent(requestId)}/cancel`,
      {
        method: 'POST',
        body: input,
        idempotencyKey: resolveIdempotencyKey(opts),
      }
    );
  } finally {
    clearListingsEtagCache();
  }
}

export async function bindRequestTrade(
  requestId: string,
  input: BindTradeInput,
  opts?: MutationOptions
): Promise<PurchaseRequestDto> {
  clearListingsEtagCache();
  try {
    return await requestBff<PurchaseRequestDto>(
      `/api/requests/${encodeURIComponent(requestId)}/bind-trade`,
      {
        method: 'POST',
        body: input,
        idempotencyKey: resolveIdempotencyKey(opts),
      }
    );
  } finally {
    clearListingsEtagCache();
  }
}

export async function syncMarketplaceTrade(
  tradeId: number | string | bigint
): Promise<TradeSyncDto> {
  clearListingsEtagCache();
  try {
    return await requestBff<TradeSyncDto>(
      `/api/trades/${encodeURIComponent(tradeId.toString())}/sync`,
      {
        method: 'POST',
        body: {},
      }
    );
  } finally {
    clearListingsEtagCache();
  }
}

export async function getTradeMarketplaceContext(
  tradeId: number | string | bigint,
  opts?: MarketplaceRequestOptions
): Promise<TradeContextDto> {
  return requestBff<TradeContextDto>(
    `/api/trades/${encodeURIComponent(tradeId.toString())}/context`,
    {
      method: 'GET',
      signal: opts?.signal,
    }
  );
}
