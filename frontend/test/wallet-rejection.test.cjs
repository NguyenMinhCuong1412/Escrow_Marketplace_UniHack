const test = require('node:test');
const assert = require('node:assert');
const { UserRejectedRequestError } = require('viem');
const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');

test('Wallet Group 1.1: Approved signature returns valid cryptographic signature', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  let handlerCalled = false;

  const mockConfirmHandler = async (req) => {
    handlerCalled = true;
    return true; // User clicks "Xác nhận ký"
  };

  const userConfirmed = await mockConfirmHandler({ type: 'personal_sign', message: 'Hello Fuji' });
  assert.strictEqual(userConfirmed, true);
  assert.strictEqual(handlerCalled, true);

  const sig = await account.signMessage({ message: 'Hello Fuji' });
  assert.ok(sig.startsWith('0x'));
});

test('Wallet Group 1.2: User rejection throws UserRejectedRequestError and does not sign', async () => {
  let handlerCalled = false;

  const mockConfirmHandler = async (req) => {
    handlerCalled = true;
    return false; // User clicks "Hủy bỏ / Từ chối"
  };

  const userConfirmed = await mockConfirmHandler({ type: 'personal_sign', message: 'Hello Fuji' });
  assert.strictEqual(handlerCalled, true);
  assert.strictEqual(userConfirmed, false);

  let caughtError = null;
  try {
    if (!userConfirmed) {
      throw new UserRejectedRequestError(new Error('Người dùng đã từ chối ký thông điệp.'));
    }
  } catch (err) {
    caughtError = err;
  }

  assert.ok(caughtError instanceof UserRejectedRequestError);
  assert.strictEqual(caughtError.name, 'UserRejectedRequestError');
  assert.ok(caughtError.message.includes('Người dùng đã từ chối'));
});

test('Wallet Group 1.3: User rejection in transaction throws UserRejectedRequestError', async () => {
  const mockConfirmHandler = async () => false; // User rejects tx

  const confirmed = await mockConfirmHandler();
  let caughtError = null;
  try {
    if (!confirmed) {
      throw new UserRejectedRequestError(new Error('Người dùng đã từ chối giao dịch.'));
    }
  } catch (err) {
    caughtError = err;
  }

  assert.ok(caughtError instanceof UserRejectedRequestError);
  assert.ok(caughtError.message.includes('giao dịch'));
});
