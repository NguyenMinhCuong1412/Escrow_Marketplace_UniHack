import { NextResponse } from 'next/server';
import {
  bffError,
  extractClientIpHeader,
  resolveBackendTarget,
} from '@/lib/marketplace-bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROXY_TIMEOUT_MS = 15_000;
const NUMERIC_ID_RE = /^\d{1,18}$/;

type RouteContext = { params: Promise<{ path?: string[] }> };

interface WhitelistedTarget {
  upstreamPath: string;
  responseKind: 'json' | 'png';
  cacheControl: string;
}

function clampQrSize(raw: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  if (!/^\d{1,5}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  if (!Number.isSafeInteger(n) || n < 160 || n > 1024) {
    return String(Math.max(160, Math.min(1024, Math.floor(n) || 480)));
  }
  return String(n);
}

function resolveWhitelistedTarget(
  segments: string[],
  searchParams: URLSearchParams
): WhitelistedTarget | null {
  if (!Array.isArray(segments) || segments.length === 0) {
    return null;
  }
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..' || seg.includes('/') || seg.includes('\\')) {
      return null;
    }
  }

  // Strictly whitelisted 5 public read endpoints (matching OD-P3-T4-02)
  if (segments.length === 1 && segments[0] === 'health') {
    return {
      upstreamPath: '/health',
      responseKind: 'json',
      cacheControl: 'no-store',
    };
  }
  if (segments.length === 2 && segments[0] === 'report' && NUMERIC_ID_RE.test(segments[1])) {
    return {
      upstreamPath: `/report/${segments[1]}`,
      responseKind: 'json',
      cacheControl: 'no-store',
    };
  }
  if (
    segments.length === 3 &&
    segments[0] === 'agent' &&
    segments[1] === 'status' &&
    NUMERIC_ID_RE.test(segments[2])
  ) {
    return {
      upstreamPath: `/agent/status/${segments[2]}`,
      responseKind: 'json',
      cacheControl: 'no-store',
    };
  }
  if (
    segments.length === 3 &&
    segments[0] === 'trade' &&
    NUMERIC_ID_RE.test(segments[1]) &&
    segments[2] === 'uris'
  ) {
    return {
      upstreamPath: `/trade/${segments[1]}/uris`,
      responseKind: 'json',
      cacheControl: 'no-store',
    };
  }
  if (
    segments.length === 3 &&
    segments[0] === 'trade' &&
    NUMERIC_ID_RE.test(segments[1]) &&
    segments[2] === 'nonce-qr.png'
  ) {
    const sizeParam = clampQrSize(searchParams.get('size'));
    const qs = sizeParam ? `?size=${sizeParam}` : '';
    return {
      upstreamPath: `/trade/${segments[1]}/nonce-qr.png${qs}`,
      responseKind: 'png',
      cacheControl: 'public, max-age=3600',
    };
  }

  return null;
}

export async function GET(request: Request, context: RouteContext) {
  const { path: rawSegments } = await context.params;
  const reqUrl = new URL(request.url);
  const resolved = resolveWhitelistedTarget(rawSegments ?? [], reqUrl.searchParams);
  if (!resolved) {
    return bffError(
      404,
      'BACKEND_PROXY_NOT_FOUND',
      'Đường dẫn backend không nằm trong danh sách cho phép.'
    );
  }

  const target = resolveBackendTarget();
  if (!target.ok) {
    return bffError(503, target.errorCode, target.message);
  }

  const upstreamUrl = `${target.url}${resolved.upstreamPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      Accept: resolved.responseKind === 'png' ? 'image/png' : 'application/json',
    };
    const clientIp = extractClientIpHeader(request);
    if (clientIp) {
      headers['X-Forwarded-For'] = clientIp;
    }

    const res = await fetch(upstreamUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });

    if (resolved.responseKind === 'png' && res.ok) {
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!contentType.startsWith('image/')) {
        return bffError(
          502,
          'UPSTREAM_INVALID_RESPONSE',
          'Backend không trả về dữ liệu ảnh QR hợp lệ.'
        );
      }
      const bytes = await res.arrayBuffer();
      return new NextResponse(bytes, {
        status: res.status,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': res.headers.get('cache-control') || resolved.cacheControl,
        },
      });
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

    return NextResponse.json(parsed, {
      status: res.status,
      headers: { 'Cache-Control': resolved.cacheControl },
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return bffError(
      aborted ? 504 : 503,
      aborted ? 'BACKEND_TIMEOUT' : 'BACKEND_UNREACHABLE',
      aborted
        ? 'Backend xử lý quá thời gian chờ.'
        : 'Không kết nối được Marketplace backend.'
    );
  } finally {
    clearTimeout(timer);
  }
}

function methodNotAllowed() {
  return bffError(405, 'METHOD_NOT_ALLOWED', 'Public backend proxy chỉ hỗ trợ phương thức GET.');
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
