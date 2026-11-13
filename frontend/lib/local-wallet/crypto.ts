import {
  bytesToHex,
  hexToBytes,
  type Address,
  type Hex,
  getAddress,
} from 'viem';
import {
  generateMnemonic,
  mnemonicToAccount,
  generatePrivateKey,
  privateKeyToAccount,
  english,
} from 'viem/accounts';
import type { EncryptedKeystoreV1, KeystorePayload } from './types';

const PBKDF2_ITERATIONS = 100_000;
const AES_KEY_LENGTH = 256;
const SALT_BYTE_LENGTH = 16;
const IV_BYTE_LENGTH = 12;

function getCrypto(): Crypto {
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  throw new Error('Môi trường không hỗ trợ Web Crypto API an toàn.');
}

/**
 * Validates password strength (minimum 8 characters).
 */
export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (!password || password.length < 8) {
    return { valid: false, reason: 'Mật khẩu phải có độ dài tối thiểu 8 ký tự.' };
  }
  return { valid: true };
}

/**
 * Derives an AES-GCM 256-bit CryptoKey from a password and salt using PBKDF2 with HMAC-SHA256.
 */
async function deriveAesKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
  usages: KeyUsage[]
): Promise<CryptoKey> {
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
      salt: salt as unknown as BufferSource,
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

/**
 * Encrypts a KeystorePayload with a user password using AES-256-GCM.
 */
export async function encryptKeystore(
  payload: KeystorePayload,
  password: string,
  address: Address,
  meta: { name?: string; hasMnemonic: boolean }
): Promise<EncryptedKeystoreV1> {
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
    {
      name: 'AES-GCM',
      iv,
    },
    aesKey,
    plaintext
  );

  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `kw-${Date.now()}`;

  return {
    version: 1,
    id,
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

/**
 * Decrypts an EncryptedKeystoreV1 using the user's password.
 * Throws if the password is wrong or the ciphertext has been tampered with.
 */
export async function decryptKeystore(
  keystore: EncryptedKeystoreV1,
  password: string
): Promise<KeystorePayload> {
  if (keystore.version !== 1) {
    throw new Error(`Phiên bản keystore không được hỗ trợ: ${keystore.version}`);
  }

  if (keystore.crypto.cipher !== 'aes-256-gcm') {
    throw new Error(`Thuật toán mã hóa không được hỗ trợ: ${keystore.crypto.cipher}`);
  }

  const salt = hexToBytes(keystore.crypto.kdfparams.salt as Hex);
  const iv = hexToBytes(keystore.crypto.cipherparams.iv as Hex);
  const ciphertext = hexToBytes(keystore.crypto.ciphertext as Hex);
  const iterations = keystore.crypto.kdfparams.iterations;

  const crypto = getCrypto();
  const aesKey = await deriveAesKey(password, salt, iterations, ['decrypt']);

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
      },
      aesKey,
      ciphertext as unknown as BufferSource
    );
  } catch (err) {
    throw new Error('Mật khẩu không chính xác hoặc dữ liệu ví đã bị sửa đổi.');
  }

  const dec = new TextDecoder();
  const jsonString = dec.decode(decryptedBuffer);
  const payload = JSON.parse(jsonString) as KeystorePayload;

  if (!payload.privateKey) {
    throw new Error('Dữ liệu giải mã không hợp lệ: thiếu private key.');
  }

  return payload;
}

/**
 * Generates a fresh EVM wallet using cryptographically secure mnemonic (BIP-39).
 */
export async function generateLocalWallet(password: string): Promise<{
  keystore: EncryptedKeystoreV1;
  payload: KeystorePayload;
}> {
  const mnemonic = generateMnemonic(english);
  const account = mnemonicToAccount(mnemonic);
  const hdKey = account.getHdKey();
  const privateKey = bytesToHex(hdKey.privateKey!);

  const payload: KeystorePayload = {
    privateKey,
    mnemonic,
    createdAt: Date.now(),
  };

  const keystore = await encryptKeystore(payload, password, account.address, {
    name: 'Ví thiết bị (Local)',
    hasMnemonic: true,
  });

  return { keystore, payload };
}

/**
 * Imports an EVM wallet from an existing 12-word BIP-39 mnemonic phrase.
 */
export async function importWalletFromMnemonic(
  mnemonic: string,
  password: string
): Promise<{
  keystore: EncryptedKeystoreV1;
  payload: KeystorePayload;
}> {
  const cleanMnemonic = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
  const words = cleanMnemonic.split(' ');
  if (words.length !== 12 && words.length !== 24) {
    throw new Error('Cụm từ khôi phục phải có 12 hoặc 24 từ khóa hợp lệ.');
  }

  const account = mnemonicToAccount(cleanMnemonic);
  const hdKey = account.getHdKey();
  const privateKey = bytesToHex(hdKey.privateKey!);

  const payload: KeystorePayload = {
    privateKey,
    mnemonic: cleanMnemonic,
    createdAt: Date.now(),
  };

  const keystore = await encryptKeystore(payload, password, account.address, {
    name: 'Ví khôi phục (Mnemonic)',
    hasMnemonic: true,
  });

  return { keystore, payload };
}

/**
 * Imports an EVM wallet from an existing private key (0x...).
 */
export async function importWalletFromPrivateKey(
  privateKey: Hex,
  password: string
): Promise<{
  keystore: EncryptedKeystoreV1;
  payload: KeystorePayload;
}> {
  const cleanPk = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex;
  if (cleanPk.length !== 66) {
    throw new Error('Khóa riêng tư (Private Key) phải có 64 ký tự hex (bắt đầu bằng 0x).');
  }

  const account = privateKeyToAccount(cleanPk);

  const payload: KeystorePayload = {
    privateKey: cleanPk,
    createdAt: Date.now(),
  };

  const keystore = await encryptKeystore(payload, password, account.address, {
    name: 'Ví khôi phục (Private Key)',
    hasMnemonic: false,
  });

  return { keystore, payload };
}
