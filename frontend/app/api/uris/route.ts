import { NextResponse } from 'next/server';
import { verifySessionFromRequest } from '@/lib/auth-session';

// Proxy server-side tới backend POST /trade/{id}/uris — báo cho AI Agent tự động biết
// đường dẫn ipfs:// của ảnh niêm yết / bằng chứng. ATTEST_API_KEY chỉ đọc ở server.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 20_000;
const MAX_URI_LEN = 2048;
const ROLES = ['listing', 'seller', 'buyer'];

function backendBaseUrl(): string {
  const url = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
  return url.replace(/\/+$/, '');
}

export async function POST(request: Request) {
  // 1. Kiểm tra session xác thực ví
  const session = verifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { detail: 'Yêu cầu đăng nhập. Vui lòng xác thực ví trước khi đăng ký URI.' },
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
  if (typeof body.role !== 'string' || !ROLES.includes(body.role)) {
    return NextResponse.json({ detail: 'role không hợp lệ.' }, { status: 400 });
  }
  if (typeof body.uri !== 'string' || !body.uri.startsWith('ipfs://') || body.uri.length > MAX_URI_LEN) {
    return NextResponse.json({ detail: 'uri phải là ipfs://...' }, { status: 400 });
  }
  if (body.signature !== undefined && (typeof body.signature !== 'string' || body.signature.length > 200)) {
    return NextResponse.json({ detail: 'signature không hợp lệ.' }, { status: 400 });
  }

  // Chỉ chuyển tiếp các trường được phép.
  const payload: Record<string, unknown> = { role: body.role, uri: body.uri };
  if (body.signature) payload.signature = body.signature;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = process.env.ATTEST_API_KEY;
  if (apiKey) headers['X-API-Key'] = apiKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${backendBaseUrl()}/trade/${tradeId}/uris`, {
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
    console.error('[api/uris] backend unreachable:', err instanceof Error ? err.message : err);
    return NextResponse.json({ detail: 'Không kết nối được AI agent (backend offline).' }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}
