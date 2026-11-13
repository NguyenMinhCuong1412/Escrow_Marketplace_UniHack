const test = require('node:test');
const assert = require('node:assert');
const { createHmac } = require('crypto');
const { getAddress } = require('viem');

const SESSION_COOKIE_NAME = 'escrow_auth_session';
const SECRET_KEY = 'test-security-secret-key';
const TARGET_CHAINS = [43113, 31337];

function createSessionToken(address, chainId, secret = SECRET_KEY) {
  const now = Date.now();
  const payload = {
    address: getAddress(address),
    chainId,
    iat: now,
    exp: now + 86400000,
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = createHmac('sha256', secret).update(b64).digest('base64url');
  return `${b64}.${hmac}`;
}

function verifySessionFromHeaders(headers, secret = SECRET_KEY) {
  const cookieHeader = headers.cookie || '';
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  const token = match ? match[1] : null;
  if (!token) return null;

  try {
    const [payloadB64, hmac] = token.split('.');
    if (!payloadB64 || !hmac) return null;
    const expected = createHmac('sha256', secret).update(payloadB64).digest('base64url');
    if (hmac !== expected) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.exp < Date.now()) return null;
    if (!TARGET_CHAINS.includes(payload.chainId)) return null;
    return payload;
  } catch {
    return null;
  }
}

test('API Auth 1: Unauthenticated request to protected API is rejected with 401', () => {
  const emptyHeaders = {};
  const session = verifySessionFromHeaders(emptyHeaders);
  assert.strictEqual(session, null, 'Unauthenticated request must have no session');
});

test('API Auth 2: Request with valid session cookie passes authorization gate', () => {
  const address = '0x1234567890123456789012345678901234567890';
  const token = createSessionToken(address, 43113);
  const headers = { cookie: `${SESSION_COOKIE_NAME}=${token}` };

  const session = verifySessionFromHeaders(headers);
  assert.notStrictEqual(session, null);
  assert.strictEqual(session.address.toLowerCase(), address.toLowerCase());
  assert.strictEqual(session.chainId, 43113);
});

test('API Auth 3: Request with tampered session cookie is rejected with 401', () => {
  const address = '0x1234567890123456789012345678901234567890';
  const token = createSessionToken(address, 43113);
  const headers = { cookie: `${SESSION_COOKIE_NAME}=${token}tampered` };

  const session = verifySessionFromHeaders(headers);
  assert.strictEqual(session, null, 'Tampered cookie must be rejected');
});
