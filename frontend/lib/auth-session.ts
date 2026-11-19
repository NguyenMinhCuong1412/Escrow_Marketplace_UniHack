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

export const MIN_SESSION_SECRET_LENGTH = 32;

export function isSharedAuthBffMode(): boolean {
  const sharedUrl = (process.env.SHARED_API_URL || '').trim();
  const mode = (process.env.BFF_AUTH_MODE || '').trim().toLowerCase();
  return Boolean(sharedUrl || mode === 'shared');
}

function isOpsJwtExpired(opsToken: string): boolean {
  const parts = opsToken.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { exp?: unknown };
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
      return payload.exp <= Math.floor(Date.now() / 1000);
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Resolves the HMAC secret used to sign/verify `escrow_auth_session`.
 * - Requires `SESSION_SECRET` independently; never falls back to `ATTEST_API_KEY`.
 * - Fails closed on Fuji (43113) and any non-31337 network when missing, blank,
 *   equal to the legacy default, shorter than 32 characters, or equal to `ATTEST_API_KEY`.
 * - Uses an ephemeral per-process secret on local Anvil (31337) when `SESSION_SECRET` is unset.
 */
export function getSecretKey(targetChainId?: number): string {
  const sessionSecret = (process.env.SESSION_SECRET || '').trim();
  const attestApiKey = (process.env.ATTEST_API_KEY || '').trim();

  const serverChain = getConfiguredChainId();
  const effectiveChain = targetChainId ?? serverChain;
  const isLocalAnvilOnly =
    serverChain === LOCAL_ANVIL_CHAIN_ID && effectiveChain === LOCAL_ANVIL_CHAIN_ID;

  if (sessionSecret) {
    if (!isLocalAnvilOnly) {
      if (sessionSecret === LEGACY_INSECURE_SECRET) {
        throw new SessionConfigError(
          'Không được phép dùng session secret mặc định trên Avalanche Fuji / non-31337.'
        );
      }
      if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
        throw new SessionConfigError(
          'SESSION_SECRET phải có độ dài tối thiểu trên môi trường không phải local Anvil (31337).'
        );
      }
      if (attestApiKey && sessionSecret === attestApiKey) {
        throw new SessionConfigError(
          'SESSION_SECRET phải độc lập và không được trùng với ATTEST_API_KEY trên non-31337.'
        );
      }
    }
    return sessionSecret;
  }

  if (isLocalAnvilOnly || isSharedAuthBffMode()) {
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
export function createSessionToken(address: Address, chainId: number, opsToken?: string): string {
  const secret = getSecretKey(chainId);
  const now = Date.now();
  const payload: {
    address: Address;
    chainId: number;
    iat: number;
    exp: number;
    opsToken?: string;
  } = {
    address: getAddress(address),
    chainId,
    iat: now,
    exp: now + SESSION_EXPIRY_MS,
  };
  if (typeof opsToken === 'string' && opsToken.trim()) {
    payload.opsToken = opsToken.trim();
  }
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString('base64url');
  const hmac = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${hmac}`;
}

/**
 * Verifies and decodes a session token.
 */
export function verifySessionToken(
  token: string
): { address: Address; chainId: number; opsToken?: string } | null {
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

    const opsToken =
      typeof payload.opsToken === 'string' && payload.opsToken.trim()
        ? payload.opsToken.trim()
        : undefined;
    if (opsToken && isOpsJwtExpired(opsToken)) {
      return null;
    }

    return {
      address: getAddress(payload.address),
      chainId: payload.chainId,
      ...(opsToken ? { opsToken } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies the session token from a Next.js Request object.
 * Returns decoded session or null if unauthenticated.
 */
export function verifySessionFromRequest(
  request: Request
): { address: Address; chainId: number; opsToken?: string } | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  const rawToken = match ? match[1] : null;
  if (!rawToken) return null;
  let token = rawToken;
  try {
    token = decodeURIComponent(rawToken);
  } catch {
    token = rawToken;
  }
  return verifySessionToken(token);
}
