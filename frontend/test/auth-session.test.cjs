const test = require('node:test');
const assert = require('node:assert');
const { createHmac, randomBytes } = require('crypto');
const { verifyMessage, getAddress } = require('viem');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');

const TARGET_CHAINS = [43113, 31337];
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;
const SECRET_KEY = 'test-session-secret-key-for-unit-tests';

function buildAuthChallengeMessage(address, nonce, chainId) {
  return [
    'Escrow Marketplace Authentication Challenge',
    '',
    'Vui lòng ký thông điệp này để xác thực phiên làm việc an toàn trên Escrow Marketplace.',
    '',
    `Địa chỉ ví: ${address}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    '',
    'Lưu ý: Thao tác này không tốn phí gas và không gửi bất kỳ giao dịch on-chain nào.',
  ].join('\n');
}

function createSessionToken(address, chainId, secret = SECRET_KEY, expiryMs = SESSION_EXPIRY_MS) {
  const now = Date.now();
  const payload = {
    address: getAddress(address),
    chainId,
    iat: now,
    exp: now + expiryMs,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${hmac}`;
}

function verifySessionToken(token, secret = SECRET_KEY) {
  try {
    const [payloadB64, hmac] = token.split('.');
    if (!payloadB64 || !hmac) return null;

    const expectedHmac = createHmac('sha256', secret).update(payloadB64).digest('base64url');
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

// -------------------------------------------------------------
// TEST SUITE: Auth Session & Cryptographic Server Verification
// -------------------------------------------------------------

test('1. Challenge message contains required address, nonce, and chainId', () => {
  const address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
  const nonce = 'abcd1234efgh5678';
  const chainId = 43113;

  const msg = buildAuthChallengeMessage(address, nonce, chainId);
  assert.strictEqual(msg.includes(address), true);
  assert.strictEqual(msg.includes(nonce), true);
  assert.strictEqual(msg.includes('Chain ID: 43113'), true);
});

test('2. Server verifies signature successfully with correct private key', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const nonce = randomBytes(16).toString('hex');
  const chainId = 43113;

  const message = buildAuthChallengeMessage(account.address, nonce, chainId);
  const signature = await account.signMessage({ message });

  const isValid = await verifyMessage({
    address: account.address,
    message,
    signature,
  });

  assert.strictEqual(isValid, true, 'Valid signature must be verified by server');
});

test('3. Server rejects forged signature or spoofed address', async () => {
  const victimAccount = privateKeyToAccount(generatePrivateKey());
  const attackerAccount = privateKeyToAccount(generatePrivateKey());

  const nonce = randomBytes(16).toString('hex');
  const message = buildAuthChallengeMessage(victimAccount.address, nonce, 43113);
  // Attacker signs message claiming to be victim
  const signature = await attackerAccount.signMessage({ message });

  const isValid = await verifyMessage({
    address: victimAccount.address,
    message,
    signature,
  });

  assert.strictEqual(isValid, false, 'Forged signature must be rejected');
});

test('4. Session token generation and HMAC verification succeeds', () => {
  const address = '0x1234567890123456789012345678901234567890';
  const chainId = 43113;

  const token = createSessionToken(address, chainId);
  const decoded = verifySessionToken(token);

  assert.notStrictEqual(decoded, null);
  assert.strictEqual(decoded.address.toLowerCase(), address.toLowerCase());
  assert.strictEqual(decoded.chainId, 43113);
});

test('5. Session token verification fails when HMAC secret is wrong or tampered', () => {
  const address = '0x1234567890123456789012345678901234567890';
  const token = createSessionToken(address, 43113, 'secret-1');

  // Verify with different secret
  const decoded = verifySessionToken(token, 'different-secret');
  assert.strictEqual(decoded, null, 'Tampered or wrongly signed token must be rejected');

  // Tamper with payload
  const [b64, hmac] = token.split('.');
  const tamperedToken = `${b64}x.${hmac}`;
  assert.strictEqual(verifySessionToken(tamperedToken), null);
});

test('6. Expired session token is rejected', () => {
  const address = '0x1234567890123456789012345678901234567890';
  // Create token with negative expiry
  const expiredToken = createSessionToken(address, 43113, SECRET_KEY, -1000);

  const decoded = verifySessionToken(expiredToken);
  assert.strictEqual(decoded, null, 'Expired session token must be rejected');
});

test('7. Unauthorized network token is rejected', () => {
  const address = '0x1234567890123456789012345678901234567890';
  // Create token with Ethereum Mainnet (1)
  const mainnetToken = createSessionToken(address, 1);

  const decoded = verifySessionToken(mainnetToken);
  assert.strictEqual(decoded, null, 'Token for non-Fuji/Anvil chain must be rejected');
});
