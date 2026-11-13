const test = require('node:test');
const assert = require('node:assert');
const { randomBytes, createHmac } = require('crypto');
const { verifyMessage } = require('viem');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');

const TARGET_CHAINS = [43113, 31337];
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;
const NONCE_EXPIRY_MS = 15 * 60 * 1000;
const SECRET_KEY = 'test-security-secret-key';

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

// Simulated server-side auth route logic
class MockAuthServer {
  constructor() {
    this.activeNonces = new Map();
  }

  generateNonce() {
    const nonce = randomBytes(16).toString('hex');
    this.activeNonces.set(nonce, { expiresAt: Date.now() + NONCE_EXPIRY_MS });
    return nonce;
  }

  async verifyAndCreateSession(address, chainId, nonce, signature) {
    const entry = this.activeNonces.get(nonce);
    if (!entry || entry.expiresAt < Date.now()) {
      return { status: 401, error: 'Nonce đã hết hạn hoặc không hợp lệ. Vui lòng làm mới trang.' };
    }

    // Invalidate nonce immediately to prevent replay
    this.activeNonces.delete(nonce);

    if (!TARGET_CHAINS.includes(Number(chainId))) {
      return { status: 400, error: 'Chain ID không được hỗ trợ.' };
    }

    const challenge = buildAuthChallengeMessage(address, nonce, Number(chainId));
    const valid = await verifyMessage({ address, message: challenge, signature });
    if (!valid) {
      return { status: 401, error: 'Chữ ký không hợp lệ với địa chỉ ví.' };
    }

    const now = Date.now();
    const payload = { address, chainId, exp: now + SESSION_EXPIRY_MS };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const hmac = createHmac('sha256', SECRET_KEY).update(b64).digest('base64url');
    return { status: 200, token: `${b64}.${hmac}` };
  }
}

test('Auth Group 3.1: Nonce single-use - first verification succeeds', async () => {
  const server = new MockAuthServer();
  const account = privateKeyToAccount(generatePrivateKey());
  const nonce = server.generateNonce();

  const msg = buildAuthChallengeMessage(account.address, nonce, 43113);
  const signature = await account.signMessage({ message: msg });

  const res1 = await server.verifyAndCreateSession(account.address, 43113, nonce, signature);
  assert.strictEqual(res1.status, 200);
  assert.ok(res1.token);
});

test('Auth Group 3.2: Replay protection - reusing consumed nonce is rejected with 401', async () => {
  const server = new MockAuthServer();
  const account = privateKeyToAccount(generatePrivateKey());
  const nonce = server.generateNonce();

  const msg = buildAuthChallengeMessage(account.address, nonce, 43113);
  const signature = await account.signMessage({ message: msg });

  // First use consumes nonce
  const res1 = await server.verifyAndCreateSession(account.address, 43113, nonce, signature);
  assert.strictEqual(res1.status, 200);

  // Replay attempt using same nonce and signature
  const res2 = await server.verifyAndCreateSession(account.address, 43113, nonce, signature);
  assert.strictEqual(res2.status, 401);
  assert.ok(res2.error.includes('Nonce đã hết hạn hoặc không hợp lệ'));
});

test('Auth Group 3.3: Expired nonce is rejected with 401', async () => {
  const server = new MockAuthServer();
  const account = privateKeyToAccount(generatePrivateKey());
  const nonce = server.generateNonce();

  // Expire the nonce manually
  server.activeNonces.set(nonce, { expiresAt: Date.now() - 5000 });

  const msg = buildAuthChallengeMessage(account.address, nonce, 43113);
  const signature = await account.signMessage({ message: msg });

  const res = await server.verifyAndCreateSession(account.address, 43113, nonce, signature);
  assert.strictEqual(res.status, 401);
  assert.ok(res.error.includes('Nonce đã hết hạn'));
});

test('Auth Group 3.4: Rejection on unsupported network (e.g. Ethereum Mainnet 1)', async () => {
  const server = new MockAuthServer();
  const account = privateKeyToAccount(generatePrivateKey());
  const nonce = server.generateNonce();

  const msg = buildAuthChallengeMessage(account.address, nonce, 1);
  const signature = await account.signMessage({ message: msg });

  const res = await server.verifyAndCreateSession(account.address, 1, nonce, signature);
  assert.strictEqual(res.status, 400);
  assert.ok(res.error.includes('Chain ID không được hỗ trợ'));
});
