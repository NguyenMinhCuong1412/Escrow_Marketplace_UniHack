import { NextResponse } from 'next/server';
import { createHmac, randomBytes } from 'crypto';
import type { Address } from 'viem';
import { isSharedAuthBffMode, verifySessionFromRequest } from '@/lib/auth-session';

/**
 * Server-only Marketplace BFF helpers.
 * - KHÔNG import từ component `'use client'`.
 * - Tuyệt đối không đưa `ATTEST_API_KEY` sang `NEXT_PUBLIC_*` hay response.
 * - Chỉ cho phép gọi các đường dẫn Marketplace đã whitelist (không phải generic proxy).
 */

const BFF_TIMEOUT_MS = 20_000;
const RESOURCE_ID_RE = /^[A-Za-z0-9_-]{3,80}$/;
const POSITIVE_INT_RE = /^[1-9]\d{0,18}$/;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{1,128}$/;

export const FORBIDDEN_IDENTITY_FIELDS = new Set([
  'seller_wallet',
  'buyer_wallet',
  'actor_wallet',
  'wallet',
  'chain_id',
  'chainId',
  'escrow_address',
  'escrowAddress',
]);

export function bffError(
  status: number,
  errorCode: string,
  message: string,
  details?: Record<string, unknown>
): NextResponse {
  const body: Record<string, unknown> = {
    error_code: errorCode,
    detail: message,
    message,
  };
  if (details !== undefined) {
    body.details = details;
  }
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function isSharedBffMode(): boolean {
  return isSharedAuthBffMode();
}

export function backendBaseUrl(): string {
  const url =
    process.env.SHARED_API_URL ||
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    'http://127.0.0.1:8000';
  return url.replace(/\/+$/, '');
}

export function configuredChainId(): number {
  const raw = Number(process.env.CHAIN_ID ?? process.env.NEXT_PUBLIC_CHAIN_ID ?? '43113');
  return Number.isFinite(raw) ? raw : 43113;
}

export function isValidResourceId(value: string): boolean {
  return typeof value === 'string' && RESOURCE_ID_RE.test(value);
}

export function isValidPositiveIntId(value: string): boolean {
  return typeof value === 'string' && POSITIVE_INT_RE.test(value);
}

/**
 * Khớp từng byte với `compute_proxy_signature()` trong `backend/listings.py`.
 * Lưu ý: `path` truyền vào KHÔNG gồm query string (khớp `request.url.path` phía FastAPI).
 */
export function computeProxySignature(
  secret: string,
  method: string,
  path: string,
  wallet: string,
  chainId: number | string,
  timestamp: number | string,
  nonce: string
): string {
  const msg = `${method.toUpperCase()}\n${path}\n${wallet.toLowerCase()}\n${chainId}\n${timestamp}\n${nonce}`;
  return createHmac('sha256', secret).update(msg, 'utf8').digest('hex');
}

export interface SessionInfo {
  address: Address;
  chainId: number;
  opsToken?: string;
}

/**
 * Chọn chuẩn xác thực phù hợp từ BFF -> Backend:
 * - Shared Auth mode (`SHARED_API_URL` hoặc `BFF_AUTH_MODE=shared`): dùng `Authorization: Bearer <opsToken>`.
 * - Local / Dev mode: giữ nguyên `ATTEST_API_KEY` + HMAC `X-Auth-*` nội bộ.
 */
export function buildBackendRequestAuthHeaders(params: {
  method: string;
  upstreamPath: string;
  session: SessionInfo;
  idempotencyKey?: string;
}): { ok: true; headers: Record<string, string> } | { ok: false; response: NextResponse } {
  if (isSharedBffMode()) {
    const opsToken = (params.session.opsToken || '').trim();
    if (!opsToken) {
      return {
        ok: false,
        response: bffError(
          401,
          'UNAUTHORIZED',
          'Phiên đăng nhập chưa có Ops JWT hợp lệ. Vui lòng kết nối và ký lại ví.'
        ),
      };
    }
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${opsToken}`,
    };
    if (params.idempotencyKey) {
      headers['Idempotency-Key'] = params.idempotencyKey;
    }
    return { ok: true, headers };
  }
  return buildSignedProxyHeaders(params);
}

/**
 * Tạo header xác thực tin cậy Next.js BFF -> FastAPI kèm chữ ký HMAC chống replay.
 */
export function buildSignedProxyHeaders(params: {
  method: string;
  upstreamPath: string;
  session: SessionInfo;
  apiKey?: string | null;
  requireSignature?: boolean;
  timestamp?: number;
  nonce?: string;
  idempotencyKey?: string;
}): { ok: true; headers: Record<string, string> } | { ok: false; response: NextResponse } {
  const apiKey = (params.apiKey ?? process.env.ATTEST_API_KEY ?? '').trim();
  const requireSig =
    params.requireSignature ?? process.env.REQUIRE_PROXY_SIGNATURE === 'true';

  if (!apiKey) {
    if (requireSig || params.session.chainId !== 31337 || configuredChainId() !== 31337) {
      return {
        ok: false,
        response: bffError(
          503,
          'BFF_MISCONFIGURED',
          'Dịch vụ Marketplace tạm thời chưa sẵn sàng.'
        ),
      };
    }
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Authenticated-Wallet': params.session.address.toLowerCase(),
      'X-Authenticated-Chain-Id': String(params.session.chainId),
    };
    if (params.idempotencyKey) {
      headers['Idempotency-Key'] = params.idempotencyKey;
    }
    return { ok: true, headers };
  }

  const ts = params.timestamp ?? Math.floor(Date.now() / 1000);
  const nonce = params.nonce ?? randomBytes(16).toString('hex');
  const walletLower = params.session.address.toLowerCase();
  const sig = computeProxySignature(
    apiKey,
    params.method,
    params.upstreamPath,
    walletLower,
    params.session.chainId,
    ts,
    nonce
  );

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-API-Key': apiKey,
    'X-Authenticated-Wallet': walletLower,
    'X-Authenticated-Chain-Id': String(params.session.chainId),
    'X-Auth-Timestamp': String(ts),
    'X-Auth-Nonce': nonce,
    'X-Auth-Signature': sig,
  };
  if (params.idempotencyKey) {
    headers['Idempotency-Key'] = params.idempotencyKey;
  }
  return { ok: true, headers };
}

function resolveAllowedOrigins(request: Request): Set<string> {
  const allowed = new Set<string>();
  const reqUrl = new URL(request.url);
  allowed.add(reqUrl.origin.toLowerCase());

  const hostHeader = (
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    ''
  )
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (hostHeader) {
    const protoHeader = (
      request.headers.get('x-forwarded-proto') ||
      reqUrl.protocol.replace(/:$/, '') ||
      'http'
    )
      .split(',')[0]
      .trim()
      .toLowerCase();
    allowed.add(`${protoHeader}://${hostHeader}`);
  }

  const extra = process.env.ALLOWED_ORIGINS || '';
  for (const raw of extra.split(',')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      allowed.add(new URL(trimmed).origin.toLowerCase());
    } catch {
      // Bỏ qua giá trị không hợp lệ
    }
  }
  return allowed;
}

/**
 * Chống CSRF cho các endpoint thay đổi trạng thái dùng cookie `SameSite=Lax`:
 * 1) Chặn `Sec-Fetch-Site: cross-site`
 * 2) Kiểm tra `Origin` (hoặc fallback `Referer`) khớp host server hiện tại
 * 3) Chặn `<form>` content types (`application/x-www-form-urlencoded`, `text/plain`, ...)
 */
export function validateCsrfRequest(
  request: Request,
  opts?: { expectJson?: boolean; allowEmptyBody?: boolean }
): NextResponse | null {
  const secFetchSite = (request.headers.get('sec-fetch-site') || '').trim().toLowerCase();
  if (secFetchSite === 'cross-site') {
    return bffError(403, 'CSRF_REJECTED', 'Yêu cầu cross-site không được phép.');
  }

  const allowedOrigins = resolveAllowedOrigins(request);
  const originHeader = request.headers.get('origin');
  if (originHeader !== null) {
    let normalizedOrigin = '';
    try {
      normalizedOrigin = new URL(originHeader).origin.toLowerCase();
    } catch {
      return bffError(403, 'CSRF_REJECTED', 'Origin không hợp lệ.');
    }
    if (!allowedOrigins.has(normalizedOrigin)) {
      return bffError(403, 'CSRF_REJECTED', 'Origin không khớp với tên miền ứng dụng.');
    }
  } else {
    const refererHeader = request.headers.get('referer');
    if (refererHeader !== null) {
      let normalizedReferer = '';
      try {
        normalizedReferer = new URL(refererHeader).origin.toLowerCase();
      } catch {
        return bffError(403, 'CSRF_REJECTED', 'Referer không hợp lệ.');
      }
      if (!allowedOrigins.has(normalizedReferer)) {
        return bffError(403, 'CSRF_REJECTED', 'Referer không khớp với tên miền ứng dụng.');
      }
    }
  }

  if (opts?.expectJson !== false) {
    const ctRaw = (request.headers.get('content-type') || '').trim().toLowerCase();
    const ct = ctRaw.split(';')[0].trim();
    if (
      ct === 'application/x-www-form-urlencoded' ||
      ct === 'multipart/form-data' ||
      ct === 'text/plain'
    ) {
      return bffError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Endpoint chỉ chấp nhận dữ liệu application/json.'
      );
    }
    if (ct && ct !== 'application/json') {
      return bffError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type phải là application/json.'
      );
    }
    if (!ct && !opts?.allowEmptyBody) {
      return bffError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Thiếu header Content-Type: application/json.'
      );
    }
  }

  return null;
}

export async function parseJsonBodyStrict(
  request: Request,
  allowedFields: readonly string[],
  opts?: { allowEmptyBody?: boolean }
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  const rawText = await request.text();
  if (!rawText.trim()) {
    if (opts?.allowEmptyBody) {
      return { ok: true, data: {} };
    }
    return {
      ok: false,
      response: bffError(400, 'EMPTY_BODY', 'Body JSON không được để trống.'),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      response: bffError(400, 'INVALID_JSON', 'Dữ liệu gửi lên phải là JSON hợp lệ.'),
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      response: bffError(400, 'INVALID_BODY', 'Payload phải là đối tượng JSON.'),
    };
  }

  const record = parsed as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_IDENTITY_FIELDS.has(key)) {
      return {
        ok: false,
        response: bffError(
          400,
          'SPOOFED_IDENTITY_FORBIDDEN',
          'Không được phép tự khai báo ví hoặc mạng trong payload.'
        ),
      };
    }
  }

  const filtered: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(record, field) && record[field] !== undefined) {
      filtered[field] = record[field];
    }
  }
  return { ok: true, data: filtered };
}

export function extractAllowedQuery(
  url: URL,
  allowedParams: readonly string[]
): URLSearchParams {
  const out = new URLSearchParams();
  for (const key of allowedParams) {
    const val = url.searchParams.get(key);
    if (val !== null && val !== '') {
      out.set(key, val);
    }
  }
  return out;
}

export function validateIdempotencyKeyHeader(
  request: Request
): { ok: true; key?: string } | { ok: false; response: NextResponse } {
  const raw = request.headers.get('idempotency-key');
  if (raw === null) return { ok: true };
  const trimmed = raw.trim();
  if (!trimmed || !IDEMPOTENCY_KEY_RE.test(trimmed)) {
    return {
      ok: false,
      response: bffError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key không hợp lệ.'),
    };
  }
  return { ok: true, key: trimmed };
}

function extractClientIpHeader(request: Request): string | null {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first && /^[A-Za-z0-9.:_-]{3,64}$/.test(first)) return first;
  }
  const realIp = (request.headers.get('x-real-ip') || '').trim();
  if (realIp && /^[A-Za-z0-9.:_-]{3,64}$/.test(realIp)) return realIp;
  return null;
}

async function executeBackendFetch(
  upstreamPath: string,
  init: {
    method: 'GET' | 'POST' | 'PATCH';
    headers: Record<string, string>;
    query?: URLSearchParams;
    body?: Record<string, unknown>;
    ifNoneMatch?: string | null;
  }
): Promise<NextResponse> {
  const qs = init.query && init.query.toString() ? `?${init.query.toString()}` : '';
  const targetUrl = `${backendBaseUrl()}${upstreamPath}${qs}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BFF_TIMEOUT_MS);

  try {
    const fetchHeaders = { ...init.headers };
    if (init.method === 'GET' && init.ifNoneMatch && init.ifNoneMatch.trim()) {
      fetchHeaders['If-None-Match'] = init.ifNoneMatch.trim();
    }
    let rawBody: string | undefined;
    if (init.body !== undefined && init.method !== 'GET') {
      fetchHeaders['Content-Type'] = 'application/json';
      rawBody = JSON.stringify(init.body);
    }

    const res = await fetch(targetUrl, {
      method: init.method,
      headers: fetchHeaders,
      body: rawBody,
      signal: controller.signal,
      cache: 'no-store',
    });

    const etag = res.headers.get('etag');
    const cacheControl = res.headers.get('cache-control');
    const vary = res.headers.get('vary');

    if (res.status === 304) {
      const notModHeaders: Record<string, string> = {
        'Cache-Control': cacheControl || 'no-cache',
      };
      if (etag) notModHeaders['ETag'] = etag;
      if (vary) notModHeaders['Vary'] = vary;
      return new NextResponse(null, { status: 304, headers: notModHeaders });
    }

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      return bffError(
        res.status >= 400 ? res.status : 502,
        'UPSTREAM_INVALID_RESPONSE',
        `Backend trả phản hồi không phải JSON (HTTP ${res.status}).`
      );
    }

    if (!res.ok) {
      const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
      const nestedDetail =
        obj.detail && typeof obj.detail === 'object' ? (obj.detail as Record<string, unknown>) : null;
      const errorCode =
        (typeof obj.error_code === 'string' && obj.error_code) ||
        (nestedDetail && typeof nestedDetail.error_code === 'string' && nestedDetail.error_code) ||
        `HTTP_${res.status}`;
      const message =
        (typeof obj.message === 'string' && obj.message) ||
        (nestedDetail && typeof nestedDetail.message === 'string' && nestedDetail.message) ||
        (typeof obj.detail === 'string' && obj.detail) ||
        `Yêu cầu thất bại (HTTP ${res.status}).`;
      const details =
        obj.details && typeof obj.details === 'object'
          ? (obj.details as Record<string, unknown>)
          : undefined;
      return bffError(res.status, errorCode, message, details);
    }

    const okHeaders: Record<string, string> = {
      'Cache-Control': etag ? cacheControl || 'no-cache' : 'no-store',
    };
    if (etag) okHeaders['ETag'] = etag;
    if (vary) okHeaders['Vary'] = vary;

    return NextResponse.json(parsed, {
      status: res.status,
      headers: okHeaders,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    console.error('[api/marketplace] upstream error:', aborted ? 'timeout' : 'unreachable');
    return bffError(
      aborted ? 504 : 503,
      aborted ? 'BACKEND_TIMEOUT' : 'BACKEND_UNREACHABLE',
      aborted ? 'Backend xử lý quá thời gian chờ.' : 'Không kết nối được Marketplace backend.'
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Chuyển tiếp public GET (duyệt chợ, chi tiết tin, ngữ cảnh giao dịch).
 * Không bao giờ gửi header nhận diện ví khi người dùng chưa đăng nhập (Guest).
 */
export async function forwardPublicMarketplaceGet(
  request: Request,
  upstreamPath: string,
  query?: URLSearchParams
): Promise<NextResponse> {
  const session = verifySessionFromRequest(request);
  const clientIp = extractClientIpHeader(request);
  const ifNoneMatch = request.headers.get('if-none-match');

  if (session) {
    if (isSharedBffMode()) {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (session.opsToken) {
        headers['Authorization'] = `Bearer ${session.opsToken}`;
      }
      if (clientIp) {
        headers['X-Forwarded-For'] = clientIp;
      }
      return executeBackendFetch(upstreamPath, {
        method: 'GET',
        headers,
        query,
        ifNoneMatch,
      });
    }

    const signed = buildSignedProxyHeaders({
      method: 'GET',
      upstreamPath,
      session,
    });
    if (!signed.ok) return signed.response;
    const headers = { ...signed.headers };
    if (clientIp) {
      headers['X-Forwarded-For'] = clientIp;
    }
    return executeBackendFetch(upstreamPath, {
      method: 'GET',
      headers,
      query,
      ifNoneMatch,
    });
  }

  // Tuyệt đối không gắn bất kỳ header nhận diện ví nào khi người dùng là Guest.
  const headers: Record<string, string> = { Accept: 'application/json' };
  const apiKey = (process.env.ATTEST_API_KEY || '').trim();
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  if (clientIp) {
    headers['X-Forwarded-For'] = clientIp;
  }

  return executeBackendFetch(upstreamPath, {
    method: 'GET',
    headers,
    query,
    ifNoneMatch,
  });
}

/**
 * Chuyển tiếp API Marketplace cần xác thực (`escrow_auth_session` + Ops JWT Bearer hoặc HMAC + CSRF cho ghi).
 */
export async function forwardAuthenticatedMarketplaceRequest(
  request: Request,
  opts: {
    method: 'GET' | 'POST' | 'PATCH';
    upstreamPath: string;
    queryBuilder?: (session: SessionInfo) => URLSearchParams;
    query?: URLSearchParams;
    allowedBodyFields?: readonly string[];
    forwardIdempotencyKey?: boolean;
    allowEmptyBody?: boolean;
  }
): Promise<NextResponse> {
  if (opts.method !== 'GET') {
    const csrfError = validateCsrfRequest(request, {
      expectJson: true,
      allowEmptyBody: opts.allowEmptyBody,
    });
    if (csrfError) return csrfError;
  }

  const session = verifySessionFromRequest(request);
  if (!session) {
    return bffError(
      401,
      'UNAUTHORIZED',
      'Yêu cầu đăng nhập ví để thực hiện thao tác này.'
    );
  }

  let body: Record<string, unknown> | undefined;
  if (opts.method !== 'GET' && opts.allowedBodyFields) {
    const parsed = await parseJsonBodyStrict(request, opts.allowedBodyFields, {
      allowEmptyBody: opts.allowEmptyBody,
    });
    if (!parsed.ok) return parsed.response;
    body = parsed.data;
  }

  let idemKey: string | undefined;
  if (opts.forwardIdempotencyKey) {
    const idemCheck = validateIdempotencyKeyHeader(request);
    if (!idemCheck.ok) return idemCheck.response;
    idemKey = idemCheck.key;
  }

  const signed = buildBackendRequestAuthHeaders({
    method: opts.method,
    upstreamPath: opts.upstreamPath,
    session,
    idempotencyKey: idemKey,
  });
  if (!signed.ok) return signed.response;

  const clientIp = extractClientIpHeader(request);
  const headers = { ...signed.headers };
  if (clientIp) {
    headers['X-Forwarded-For'] = clientIp;
  }

  const query = opts.queryBuilder ? opts.queryBuilder(session) : opts.query;
  return executeBackendFetch(opts.upstreamPath, {
    method: opts.method,
    headers,
    query,
    body,
  });
}
