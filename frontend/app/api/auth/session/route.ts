import { NextResponse } from 'next/server';
import { verifyMessage, getAddress, type Hex } from 'viem';
import { randomBytes } from 'crypto';
import { buildAuthChallengeMessage } from '@/lib/auth-challenge';
import {
  SESSION_COOKIE_NAME,
  SESSION_EXPIRY_MS,
  NONCE_EXPIRY_MS,
  TARGET_CHAINS,
  SessionConfigError,
  createSessionToken,
  isSharedAuthBffMode,
  verifySessionFromRequest,
} from '@/lib/auth-session';
import {
  bffError,
  configuredChainId,
  resolveBackendTarget,
  resolveRequestOrigin,
  shouldUseSecureCookie,
} from '@/lib/marketplace-bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AUTH_UPSTREAM_TIMEOUT_MS = 15_000;

function resolveClientDomain(request: Request): string {
  return resolveRequestOrigin(request);
}

// In-memory nonce store (nonce -> { address, expiresAt })
const activeNonces = new Map<string, { address?: string; expiresAt: number }>();

function cleanupNonces() {
  const now = Date.now();
  for (const [nonce, data] of activeNonces.entries()) {
    if (data.expiresAt < now) {
      activeNonces.delete(nonce);
    }
  }
}

/**
 * GET: Retrieves current session status or a fresh challenge nonce.
 */
export async function GET(request: Request) {
  cleanupNonces();

  const sharedMode = isSharedAuthBffMode();
  const verified = verifySessionFromRequest(request);
  if (verified && (!sharedMode || Boolean(verified.opsToken))) {
    return NextResponse.json({
      authenticated: true,
      address: verified.address,
      chainId: verified.chainId,
    });
  }

  if (sharedMode) {
    const reqUrl = new URL(request.url);
    const addressParam = (reqUrl.searchParams.get('address') || '').trim();
    const defaultChainId = configuredChainId();
    const chainIdParam = Number(reqUrl.searchParams.get('chainId') || defaultChainId);

    if (!addressParam) {
      const targetCheck = resolveBackendTarget();
      return NextResponse.json({
        authenticated: false,
        targetChainId: Number.isFinite(chainIdParam) ? chainIdParam : defaultChainId,
        mode: 'shared',
        sharedBackendConfigured: targetCheck.ok,
      });
    }

    let formattedAddress: string;
    try {
      formattedAddress = getAddress(addressParam);
    } catch {
      return NextResponse.json({ error: 'Địa chỉ ví không hợp lệ.' }, { status: 422 });
    }

    if (!TARGET_CHAINS.includes(chainIdParam)) {
      return NextResponse.json(
        { error: `Chain ID ${chainIdParam} không được hỗ trợ.` },
        { status: 400 }
      );
    }

    const target = resolveBackendTarget();
    if (!target.ok) {
      return bffError(503, target.errorCode, target.message);
    }

    const domain = resolveClientDomain(request);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUTH_UPSTREAM_TIMEOUT_MS);
    try {
      const upstreamRes = await fetch(`${target.url}/auth/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: domain },
        body: JSON.stringify({
          address: formattedAddress,
          chain_id: chainIdParam,
          domain,
        }),
        signal: controller.signal,
        cache: 'no-store',
      });
      const data = (await upstreamRes.json().catch(() => ({}))) as Record<string, unknown>;
      if (!upstreamRes.ok) {
        return NextResponse.json(
          {
            error_code: data.error_code || `HTTP_${upstreamRes.status}`,
            error:
              (typeof data.message === 'string' && data.message) ||
              (typeof data.detail === 'string' && data.detail) ||
              'Không tạo được challenge xác thực từ Ops Backend.',
          },
          { status: upstreamRes.status }
        );
      }

      return NextResponse.json({
        authenticated: false,
        nonce: data.nonce,
        message: data.message,
        challengeToken: data.challenge_token,
        domain: data.domain,
        expiresAt: data.expires_at,
        targetChainId: data.chain_id ?? chainIdParam,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      return NextResponse.json(
        {
          error_code: aborted ? 'BACKEND_TIMEOUT' : 'BACKEND_UNREACHABLE',
          error: aborted
            ? 'Ops Backend xử lý challenge quá thời gian chờ.'
            : 'Không kết nối được Ops Backend để cấp challenge.',
        },
        { status: aborted ? 504 : 503 }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // Generate a fresh cryptographically secure nonce (Local / Dev mode)
  const nonce = randomBytes(16).toString('hex');
  activeNonces.set(nonce, {
    expiresAt: Date.now() + NONCE_EXPIRY_MS,
  });

  return NextResponse.json({
    authenticated: false,
    nonce,
    targetChainId: 43113,
  });
}

/**
 * POST: Verifies signature challenge and establishes server-side session.
 */
export async function POST(request: Request) {
  cleanupNonces();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body phải là định dạng JSON.' }, { status: 400 });
  }

  const { address, chainId, nonce, signature, challengeToken } = body;

  if (!address || !nonce || !signature || !chainId) {
    return NextResponse.json({ error: 'Thiếu thông tin xác thực bắt buộc.' }, { status: 400 });
  }

  if (!TARGET_CHAINS.includes(Number(chainId))) {
    return NextResponse.json(
      { error: `Chain ID ${chainId} không được hỗ trợ. Vui lòng chuyển sang Avalanche Fuji (43113).` },
      { status: 400 }
    );
  }

  const sharedMode = isSharedAuthBffMode();
  let formattedAddress: `0x${string}`;
  try {
    formattedAddress = getAddress(address);
  } catch {
    return NextResponse.json({ error: 'Địa chỉ ví không hợp lệ.' }, { status: 422 });
  }

  let opsToken: string | undefined;

  if (sharedMode) {
    if (typeof challengeToken !== 'string' || !challengeToken.trim()) {
      return NextResponse.json(
        { error_code: 'MISSING_CHALLENGE_TOKEN', error: 'Thiếu challengeToken xác thực từ Ops Backend.' },
        { status: 400 }
      );
    }
    const target = resolveBackendTarget();
    if (!target.ok) {
      return bffError(503, target.errorCode, target.message);
    }
    const domain = resolveClientDomain(request);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AUTH_UPSTREAM_TIMEOUT_MS);
    try {
      const upstreamRes = await fetch(`${target.url}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: domain },
        body: JSON.stringify({
          address: formattedAddress,
          chain_id: Number(chainId),
          nonce,
          signature,
          challenge_token: challengeToken.trim(),
          domain,
        }),
        signal: controller.signal,
        cache: 'no-store',
      });
      const data = (await upstreamRes.json().catch(() => ({}))) as Record<string, unknown>;
      if (!upstreamRes.ok) {
        return NextResponse.json(
          {
            error_code: data.error_code || `HTTP_${upstreamRes.status}`,
            error:
              (typeof data.message === 'string' && data.message) ||
              (typeof data.detail === 'string' && data.detail) ||
              'Xác thực chữ ký với Ops Backend thất bại.',
          },
          { status: upstreamRes.status }
        );
      }
      if (typeof data.ops_token !== 'string' || !data.ops_token.trim()) {
        return NextResponse.json(
          { error_code: 'UPSTREAM_INVALID_RESPONSE', error: 'Ops Backend không trả ops_token hợp lệ.' },
          { status: 502 }
        );
      }
      opsToken = data.ops_token.trim();
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      return NextResponse.json(
        {
          error_code: aborted ? 'BACKEND_TIMEOUT' : 'BACKEND_UNREACHABLE',
          error: aborted
            ? 'Ops Backend xác thực chữ ký quá thời gian chờ.'
            : 'Không kết nối được Ops Backend.',
        },
        { status: aborted ? 504 : 503 }
      );
    } finally {
      clearTimeout(timer);
    }
  } else {
    // Validate nonce (Local / Dev mode)
    const nonceEntry = activeNonces.get(nonce);
    if (!nonceEntry || nonceEntry.expiresAt < Date.now()) {
      return NextResponse.json(
        { error: 'Nonce đã hết hạn hoặc không hợp lệ. Vui lòng làm mới trang.' },
        { status: 401 }
      );
    }

    // Invalidate nonce to prevent replay attacks
    activeNonces.delete(nonce);

    const challengeMessage = buildAuthChallengeMessage(formattedAddress, nonce, Number(chainId));

    // Cryptographic signature verification on server
    try {
      const isValidSignature = await verifyMessage({
        address: formattedAddress,
        message: challengeMessage,
        signature: signature as Hex,
      });

      if (!isValidSignature) {
        return NextResponse.json({ error: 'Chữ ký không hợp lệ với địa chỉ ví.' }, { status: 401 });
      }
    } catch (err: any) {
      console.error('[auth/session] Lỗi verifyMessage:', err);
      return NextResponse.json({ error: 'Xác thực chữ ký thất bại.' }, { status: 401 });
    }
  }

  // Create session token and set HttpOnly cookie (fail-closed if SESSION_SECRET missing on non-31337 Local/Dev)
  let token: string;
  try {
    token = createSessionToken(formattedAddress, Number(chainId), opsToken);
  } catch (err: any) {
    if (err instanceof SessionConfigError || err?.name === 'SessionConfigError') {
      return NextResponse.json(
        {
          error_code: 'SESSION_MISCONFIGURED',
          error: 'Dịch vụ xác thực phiên chưa được cấu hình bảo mật (thiếu SESSION_SECRET).',
        },
        { status: 503 }
      );
    }
    throw err;
  }
  const secureCookie = shouldUseSecureCookie(request);

  const response = NextResponse.json({
    ok: true,
    authenticated: true,
    address: formattedAddress,
    chainId: Number(chainId),
  });

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_EXPIRY_MS / 1000,
  });

  return response;
}

/**
 * DELETE: Clears the authenticated session cookie.
 */
export async function DELETE(request: Request) {
  const secureCookie = shouldUseSecureCookie(request);
  const response = NextResponse.json({ ok: true, authenticated: false });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });
  return response;
}
