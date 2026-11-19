import { NextResponse } from 'next/server';
import { verifySessionFromRequest } from '@/lib/auth-session';
import {
  backendBaseUrl,
  buildSignedProxyHeaders,
  isSharedBffMode,
  validateCsrfRequest,
} from '@/lib/marketplace-bff';

// Proxy server-side tới backend POST /verify-evidence.
// ATTEST_API_KEY / Ops JWT chỉ xử lý phía server => không lộ ra trình duyệt.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 120_000; // FRONTEND_SPEC §4.2: video có thể tới ~40s
const MAX_URI_LEN = 2048;

function isValidUri(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_URI_LEN;
}

export async function POST(request: Request) {
  const csrfError = validateCsrfRequest(request);
  if (csrfError) return csrfError;

  // 1. Kiểm tra session xác thực ví để ngăn ngừa lạm dụng kích hoạt pipeline AI
  const session = verifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { detail: 'Yêu cầu đăng nhập. Vui lòng xác thực ví trước khi yêu cầu thẩm định.' },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: 'Body phải là JSON.' }, { status: 400 });
  }

  const tradeId = Number(body.trade_id);
  if (!Number.isSafeInteger(tradeId) || tradeId <= 0) {
    return NextResponse.json({ detail: 'trade_id không hợp lệ.' }, { status: 400 });
  }
  if (!isValidUri(body.listing_image_url) || !isValidUri(body.seller_evidence_url) || !isValidUri(body.buyer_evidence_url)) {
    return NextResponse.json({ detail: 'Thiếu hoặc sai định dạng URL bằng chứng.' }, { status: 400 });
  }

  // Chỉ chuyển tiếp các trường được phép — client không điều khiển dry_run.
  const payload = {
    trade_id: tradeId,
    listing_image_url: body.listing_image_url,
    seller_evidence_url: body.seller_evidence_url,
    buyer_evidence_url: body.buyer_evidence_url,
    include_visual: true,
    dry_run: false,
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isSharedBffMode()) {
    if (!session.opsToken) {
      return NextResponse.json(
        {
          error_code: 'UNAUTHORIZED',
          detail: 'Phiên đăng nhập chưa có Ops JWT hợp lệ. Vui lòng kết nối lại ví.',
        },
        { status: 401 }
      );
    }
    headers['Authorization'] = `Bearer ${session.opsToken}`;
  } else {
    const apiKey = (process.env.ATTEST_API_KEY || '').trim();
    if (apiKey) {
      const signed = buildSignedProxyHeaders({
        method: 'POST',
        upstreamPath: '/verify-evidence',
        session,
        apiKey,
      });
      if (!signed.ok) return signed.response;
      Object.assign(headers, signed.headers);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${backendBaseUrl()}/verify-evidence`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store',
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: `Backend trả phản hồi không phải JSON (HTTP ${res.status}).` };
    }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    console.error('[api/verify] backend unreachable:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { detail: aborted ? 'AI agent xử lý quá 120 giây (timeout).' : 'Không kết nối được AI agent (backend offline).' },
      { status: aborted ? 504 : 503 }
    );
  } finally {
    clearTimeout(timer);
  }
}
