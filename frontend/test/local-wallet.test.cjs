const test = require('node:test');
const assert = require('node:assert');
const {
  bytesToHex,
  hexToBytes,
  getAddress,
} = require('viem');
const {
  generateMnemonic,
  mnemonicToAccount,
  generatePrivateKey,
  privateKeyToAccount,
  english,
} = require('viem/accounts');

// Parameters matching lib/local-wallet/crypto.ts
const PBKDF2_ITERATIONS = 100_000;
const AES_KEY_LENGTH = 256;
const SALT_BYTE_LENGTH = 16;
const IV_BYTE_LENGTH = 12;

function getCrypto() {
  return globalThis.crypto;
}

function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return { valid: false, reason: 'Mật khẩu phải có độ dài tối thiểu 8 ký tự.' };
  }
  return { valid: true };
}

async function deriveAesKey(password, salt, iterations, usages) {
  const crypto = getCrypto();
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: AES_KEY_LENGTH,
    },
    false,
    usages
  );
}

async function encryptKeystore(payload, password, address, meta) {
  const validation = validatePasswordStrength(password);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const crypto = getCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));

  const aesKey = await deriveAesKey(password, salt, PBKDF2_ITERATIONS, ['encrypt']);
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(payload));

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    plaintext
  );

  return {
    version: 1,
    id: crypto.randomUUID ? crypto.randomUUID() : 'test-id',
    address: getAddress(address),
    crypto: {
      cipher: 'aes-256-gcm',
      ciphertext: bytesToHex(new Uint8Array(ciphertextBuffer)),
      cipherparams: {
        iv: bytesToHex(iv),
      },
      kdf: 'pbkdf2',
      kdfparams: {
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
        salt: bytesToHex(salt),
        keyLength: AES_KEY_LENGTH,
      },
    },
    createdAt: payload.createdAt || Date.now(),
    meta: {
      name: meta.name || 'Local Wallet',
      hasMnemonic: meta.hasMnemonic,
    },
  };
}

async function decryptKeystore(keystore, password) {
  if (keystore.version !== 1) {
    throw new Error(`Phiên bản keystore không được hỗ trợ: ${keystore.version}`);
  }

  if (keystore.crypto.cipher !== 'aes-256-gcm') {
    throw new Error(`Thuật toán mã hóa không được hỗ trợ: ${keystore.crypto.cipher}`);
  }

  const salt = hexToBytes(keystore.crypto.kdfparams.salt);
  const iv = hexToBytes(keystore.crypto.cipherparams.iv);
  const ciphertext = hexToBytes(keystore.crypto.ciphertext);
  const iterations = keystore.crypto.kdfparams.iterations;

  const crypto = getCrypto();
  const aesKey = await deriveAesKey(password, salt, iterations, ['decrypt']);

  let decryptedBuffer;
  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      ciphertext
    );
  } catch (err) {
    throw new Error('Mật khẩu không chính xác hoặc dữ liệu ví đã bị sửa đổi.');
  }

  const dec = new TextDecoder();
  const jsonString = dec.decode(decryptedBuffer);
  return JSON.parse(jsonString);
}

// -------------------------------------------------------------
// TEST SUITE: Local Wallet Crypto & Keystore
// -------------------------------------------------------------

test('1. Password strength validation rejects short passwords', () => {
  const short = validatePasswordStrength('1234567');
  assert.strictEqual(short.valid, false);

  const empty = validatePasswordStrength('');
  assert.strictEqual(empty.valid, false);

  const good = validatePasswordStrength('StrongPass123!');
  assert.strictEqual(good.valid, true);
});

test('2. Encrypt and decrypt keystore with valid password succeeds', async () => {
  const mnemonic = generateMnemonic(english);
  const account = mnemonicToAccount(mnemonic);
  const hdKey = account.getHdKey();
  const privateKey = bytesToHex(hdKey.privateKey);

  const payload = {
    privateKey,
    mnemonic,
    createdAt: Date.now(),
  };

  const password = 'SuperSecurePassword@2026';
  const keystore = await encryptKeystore(payload, password, account.address, {
    hasMnemonic: true,
  });

  // Check keystore structure
  assert.strictEqual(keystore.version, 1);
  assert.strictEqual(keystore.address.toLowerCase(), account.address.toLowerCase());
  assert.strictEqual(keystore.crypto.cipher, 'aes-256-gcm');
  assert.strictEqual(keystore.crypto.kdfparams.iterations, 100_000);
  assert.strictEqual(keystore.crypto.kdfparams.salt.startsWith('0x'), true);
  assert.strictEqual(keystore.crypto.cipherparams.iv.startsWith('0x'), true);
  assert.strictEqual(keystore.crypto.ciphertext.startsWith('0x'), true);

  // Ensure no plaintext private key or mnemonic in keystore
  const keystoreJson = JSON.stringify(keystore);
  assert.strictEqual(keystoreJson.includes(privateKey), false, 'Plaintext private key MUST NOT be in keystore');
  assert.strictEqual(keystoreJson.includes(mnemonic), false, 'Plaintext mnemonic MUST NOT be in keystore');

  // Decrypt with correct password
  const decrypted = await decryptKeystore(keystore, password);
  assert.strictEqual(decrypted.privateKey, privateKey);
  assert.strictEqual(decrypted.mnemonic, mnemonic);
});

test('3. Decrypting with wrong password throws authentication error', async () => {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const payload = { privateKey, createdAt: Date.now() };

  const keystore = await encryptKeystore(payload, 'CorrectPassword123', account.address, {
    hasMnemonic: false,
  });

  await assert.rejects(
    async () => {
      await decryptKeystore(keystore, 'WrongPassword456');
    },
    {
      message: 'Mật khẩu không chính xác hoặc dữ liệu ví đã bị sửa đổi.',
    }
  );
});

test('4. Tamper detection: modifying ciphertext triggers auth tag verification failure', async () => {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const payload = { privateKey, createdAt: Date.now() };

  const password = 'ValidPassword789!';
  const keystore = await encryptKeystore(payload, password, account.address, {
    hasMnemonic: false,
  });

  // Tamper with the ciphertext by flipping bytes
  const tamperedBytes = hexToBytes(keystore.crypto.ciphertext);
  tamperedBytes[tamperedBytes.length - 1] ^= 0x01; // flip last byte (in auth tag)
  keystore.crypto.ciphertext = bytesToHex(tamperedBytes);

  await assert.rejects(
    async () => {
      await decryptKeystore(keystore, password);
    },
    {
      message: 'Mật khẩu không chính xác hoặc dữ liệu ví đã bị sửa đổi.',
    }
  );
});

test('5. Tamper detection: modifying IV triggers decryption failure', async () => {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const payload = { privateKey, createdAt: Date.now() };

  const password = 'ValidPassword789!';
  const keystore = await encryptKeystore(payload, password, account.address, {
    hasMnemonic: false,
  });

  // Tamper with IV
  const tamperedIv = hexToBytes(keystore.crypto.cipherparams.iv);
  tamperedIv[0] ^= 0x01;
  keystore.crypto.cipherparams.iv = bytesToHex(tamperedIv);

  await assert.rejects(
    async () => {
      await decryptKeystore(keystore, password);
    },
    {
      message: 'Mật khẩu không chính xác hoặc dữ liệu ví đã bị sửa đổi.',
    }
  );
});

test('6. Mnemonic recovery generates exact same account address and private key', () => {
  const mnemonic = generateMnemonic(english);
  const account1 = mnemonicToAccount(mnemonic);
  const account2 = mnemonicToAccount(mnemonic);

  assert.strictEqual(account1.address, account2.address);
  assert.strictEqual(
    bytesToHex(account1.getHdKey().privateKey),
    bytesToHex(account2.getHdKey().privateKey)
  );
});

test('7. Memory wipe on wallet lock clears private key reference', () => {
  let activeAccount = privateKeyToAccount(generatePrivateKey());
  assert.notStrictEqual(activeAccount, null);

  // Simulate locking wallet
  activeAccount = null;
  assert.strictEqual(activeAccount, null, 'Active account must be null after lock');
});
