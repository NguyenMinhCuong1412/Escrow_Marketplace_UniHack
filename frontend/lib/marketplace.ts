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

function buildQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
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
  }
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
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
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw normalizeMarketplaceErrorResponse(res.status, payload);
  }
  return payload as T;
}

export async function browseListings(
  query: ListingsQuery = {}
): Promise<PaginatedResponse<ListingDto>> {
  const qs = buildQueryString({ ...query });
  return requestBff<PaginatedResponse<ListingDto>>(`/api/listings${qs}`, {
    method: 'GET',
  });
}

export async function getMyListings(
  query: Omit<ListingsQuery, 'seller'> = {}
): Promise<PaginatedResponse<ListingDto>> {
  const qs = buildQueryString({ ...query });
  return requestBff<PaginatedResponse<ListingDto>>(`/api/listings/mine${qs}`, {
    method: 'GET',
  });
}

export async function getListing(listingId: string): Promise<ListingDto> {
  return requestBff<ListingDto>(`/api/listings/${encodeURIComponent(listingId)}`, {
    method: 'GET',
  });
}

export async function createListing(
  input: CreateListingInput,
  opts?: MutationOptions
): Promise<ListingDto> {
  return requestBff<ListingDto>('/api/listings', {
    method: 'POST',
    body: input,
    idempotencyKey: resolveIdempotencyKey(opts),
  });
}

export async function updateListing(
  listingId: string,
  input: UpdateListingInput
): Promise<ListingDto> {
  return requestBff<ListingDto>(`/api/listings/${encodeURIComponent(listingId)}`, {
    method: 'PATCH',
    body: input,
  });
}

export async function createPurchaseRequest(
  listingId: string,
  input: CreatePurchaseRequestInput = { quantity: 1 },
  opts?: MutationOptions
): Promise<PurchaseRequestDto> {
  return requestBff<PurchaseRequestDto>(
    `/api/listings/${encodeURIComponent(listingId)}/requests`,
    {
      method: 'POST',
      body: input,
      idempotencyKey: resolveIdempotencyKey(opts),
    }
  );
}

export async function listPurchaseRequests(
  query: RequestsQuery = {}
): Promise<PaginatedResponse<PurchaseRequestDto>> {
  const qs = buildQueryString({ ...query });
  return requestBff<PaginatedResponse<PurchaseRequestDto>>(`/api/requests${qs}`, {
    method: 'GET',
  });
}

export async function getPurchaseRequest(
  requestId: string
): Promise<PurchaseRequestDto> {
  return requestBff<PurchaseRequestDto>(`/api/requests/${encodeURIComponent(requestId)}`, {
    method: 'GET',
  });
}

export async function decidePurchaseRequest(
  requestId: string,
  input: DecisionInput,
  opts?: MutationOptions
): Promise<PurchaseRequestDto> {
  return requestBff<PurchaseRequestDto>(
    `/api/requests/${encodeURIComponent(requestId)}/decision`,
    {
      method: 'POST',
      body: input,
      idempotencyKey: resolveIdempotencyKey(opts),
    }
  );
}

export async function cancelPurchaseRequest(
  requestId: string,
  input: CancelRequestInput = {},
  opts?: MutationOptions
): Promise<PurchaseRequestDto> {
  return requestBff<PurchaseRequestDto>(
    `/api/requests/${encodeURIComponent(requestId)}/cancel`,
    {
      method: 'POST',
      body: input,
      idempotencyKey: resolveIdempotencyKey(opts),
    }
  );
}

export async function bindRequestTrade(
  requestId: string,
  input: BindTradeInput,
  opts?: MutationOptions
): Promise<PurchaseRequestDto> {
  return requestBff<PurchaseRequestDto>(
    `/api/requests/${encodeURIComponent(requestId)}/bind-trade`,
    {
      method: 'POST',
      body: input,
      idempotencyKey: resolveIdempotencyKey(opts),
    }
  );
}

export async function syncMarketplaceTrade(
  tradeId: number | string | bigint
): Promise<TradeSyncDto> {
  return requestBff<TradeSyncDto>(
    `/api/trades/${encodeURIComponent(tradeId.toString())}/sync`,
    {
      method: 'POST',
      body: {},
    }
  );
}

export async function getTradeMarketplaceContext(
  tradeId: number | string | bigint
): Promise<TradeContextDto> {
  return requestBff<TradeContextDto>(
    `/api/trades/${encodeURIComponent(tradeId.toString())}/context`,
    {
      method: 'GET',
    }
  );
}
