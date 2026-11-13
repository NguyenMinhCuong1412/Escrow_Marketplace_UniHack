import { NextResponse } from 'next/server';
import { verifyMessage, getAddress, type Hex } from 'viem';
import { randomBytes } from 'crypto';
import { buildAuthChallengeMessage } from '@/lib/auth-challenge';
import {
  SESSION_COOKIE_NAME,
  SESSION_EXPIRY_MS,
  NONCE_EXPIRY_MS,
  TARGET_CHAINS,
  createSessionToken,
  verifySessionFromRequest,
} from '@/lib/auth-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const verified = verifySessionFromRequest(request);
  if (verified) {
    return NextResponse.json({
      authenticated: true,
      address: verified.address,
      chainId: verified.chainId,
    });
  }

  // Generate a fresh cryptographically secure nonce
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

  const { address, chainId, nonce, signature } = body;

  if (!address || !nonce || !signature || !chainId) {
    return NextResponse.json({ error: 'Thiếu thông tin xác thực bắt buộc.' }, { status: 400 });
  }

  if (!TARGET_CHAINS.includes(Number(chainId))) {
    return NextResponse.json(
      { error: `Chain ID ${chainId} không được hỗ trợ. Vui lòng chuyển sang Avalanche Fuji (43113).` },
      { status: 400 }
    );
  }

  // Validate nonce
  const nonceEntry = activeNonces.get(nonce);
  if (!nonceEntry || nonceEntry.expiresAt < Date.now()) {
    return NextResponse.json(
      { error: 'Nonce đã hết hạn hoặc không hợp lệ. Vui lòng làm mới trang.' },
      { status: 401 }
    );
  }

  // Invalidate nonce to prevent replay attacks
  activeNonces.delete(nonce);

  const formattedAddress = getAddress(address);
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

  // Create session token and set HttpOnly cookie
  const token = createSessionToken(formattedAddress, Number(chainId));
  const isProd = process.env.NODE_ENV === 'production';

  const response = NextResponse.json({
    ok: true,
    authenticated: true,
    address: formattedAddress,
    chainId: Number(chainId),
  });

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_EXPIRY_MS / 1000,
  });

  return response;
}

/**
 * DELETE: Clears the authenticated session cookie.
 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true, authenticated: false });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/',
  });
  return response;
}
