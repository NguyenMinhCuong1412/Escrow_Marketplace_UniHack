import { getAddress, type Address } from 'viem';
import { createHmac } from 'crypto';

export const SESSION_COOKIE_NAME = 'escrow_auth_session';
export const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
export const NONCE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
export const TARGET_CHAINS = [43113, 31337]; // Fuji & Anvil

export function getSecretKey(): string {
  return process.env.SESSION_SECRET || process.env.ATTEST_API_KEY || 'escrow-marketplace-fuji-session-secret-2026';
}

/**
 * Creates an authenticated HMAC session token.
 */
export function createSessionToken(address: Address, chainId: number): string {
  const now = Date.now();
  const payload = {
    address: getAddress(address),
    chainId,
    iat: now,
    exp: now + SESSION_EXPIRY_MS,
  };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString('base64url');
  const hmac = createHmac('sha256', getSecretKey()).update(payloadB64).digest('base64url');
  return `${payloadB64}.${hmac}`;
}

/**
 * Verifies and decodes a session token.
 */
export function verifySessionToken(token: string): { address: Address; chainId: number } | null {
  try {
    const [payloadB64, hmac] = token.split('.');
    if (!payloadB64 || !hmac) return null;

    const expectedHmac = createHmac('sha256', getSecretKey()).update(payloadB64).digest('base64url');
    if (hmac !== expectedHmac) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.exp < Date.now()) return null;
    if (!TARGET_CHAINS.includes(payload.chainId)) return null;

    return {
      address: getAddress(payload.address),
      chainId: payload.chainId,
    };
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies the session token from a Next.js Request object.
 * Returns decoded session or null if unauthenticated.
 */
export function verifySessionFromRequest(request: Request): { address: Address; chainId: number } | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  const token = match ? match[1] : null;
  if (!token) return null;
  return verifySessionToken(token);
}
