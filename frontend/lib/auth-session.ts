import { getAddress, type Address } from 'viem';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const SESSION_COOKIE_NAME = 'escrow_auth_session';
export const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
export const NONCE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
export const LOCAL_ANVIL_CHAIN_ID = 31337;
export const TARGET_CHAINS = [43113, LOCAL_ANVIL_CHAIN_ID]; // Fuji & Anvil

const LEGACY_INSECURE_SECRET = 'escrow-marketplace-fuji-session-secret-2026';
let localDevEphemeralSecret: string | null = null;

export class SessionConfigError extends Error {
  constructor(message = 'Thiếu cấu hình SESSION_SECRET bảo mật cho môi trường hiện tại.') {
    super(message);
    this.name = 'SessionConfigError';
  }
}

function getConfiguredChainId(): number {
  const raw = Number(process.env.CHAIN_ID ?? process.env.NEXT_PUBLIC_CHAIN_ID ?? '43113');
  return Number.isFinite(raw) ? raw : 43113;
}

/**
 * Resolves the HMAC secret used to sign/verify `escrow_auth_session`.
 * - Prioritizes `SESSION_SECRET` independently from `ATTEST_API_KEY`.
 * - Fails closed on Fuji (43113) and any non-31337 network when missing or equal
 *   to the legacy hardcoded default.
 * - Keeps an ephemeral per-process fallback only when both server & session chain are 31337.
 */
export function getSecretKey(targetChainId?: number): string {
  const sessionSecret = (process.env.SESSION_SECRET || '').trim();
  const attestApiKey = (process.env.ATTEST_API_KEY || '').trim();
  const configured = sessionSecret || attestApiKey;

  const serverChain = getConfiguredChainId();
  const effectiveChain = targetChainId ?? serverChain;
  const isLocalAnvilOnly =
    serverChain === LOCAL_ANVIL_CHAIN_ID && effectiveChain === LOCAL_ANVIL_CHAIN_ID;

  if (configured) {
    if (!isLocalAnvilOnly && configured === LEGACY_INSECURE_SECRET) {
      throw new SessionConfigError(
        'Không được phép dùng session secret mặc định trên Avalanche Fuji / non-31337.'
      );
    }
    return configured;
  }

  if (isLocalAnvilOnly) {
    if (!localDevEphemeralSecret) {
      localDevEphemeralSecret = randomBytes(32).toString('hex');
    }
    return localDevEphemeralSecret;
  }

  throw new SessionConfigError(
    'Thiếu SESSION_SECRET trên môi trường không phải local Anvil (31337).'
  );
}

/**
 * Creates an authenticated HMAC session token.
 */
export function createSessionToken(address: Address, chainId: number): string {
  const secret = getSecretKey(chainId);
  const now = Date.now();
  const payload = {
    address: getAddress(address),
    chainId,
    iat: now,
    exp: now + SESSION_EXPIRY_MS,
  };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString('base64url');
  const hmac = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${hmac}`;
}

/**
 * Verifies and decodes a session token.
 */
export function verifySessionToken(token: string): { address: Address; chainId: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, hmac] = parts;
    if (!payloadB64 || !hmac) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!TARGET_CHAINS.includes(payload.chainId)) return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;

    const secret = getSecretKey(Number(payload.chainId));
    const expectedHmac = createHmac('sha256', secret).update(payloadB64).digest('base64url');
    const a = Buffer.from(hmac, 'utf8');
    const b = Buffer.from(expectedHmac, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

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
