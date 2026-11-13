import type { Address, Hex } from 'viem';

/**
 * Standard encrypted keystore structure for local device storage (Version 1).
 * Inspired by Web3 Secret Storage Definition (V3 Keystore) adapted for Web Crypto AES-256-GCM.
 */
export interface EncryptedKeystoreV1 {
  version: 1;
  id: string; // UUID v4
  address: Address;
  crypto: {
    cipher: 'aes-256-gcm';
    ciphertext: string; // Hex-encoded ciphertext with appended 128-bit authentication tag
    cipherparams: {
      iv: string; // 12-byte hex IV
    };
    kdf: 'pbkdf2';
    kdfparams: {
      iterations: number; // 100,000 iterations
      hash: 'SHA-256';
      salt: string; // 16-byte hex salt
      keyLength: 256;
    };
  };
  createdAt: number;
  meta: {
    name?: string;
    hasMnemonic: boolean;
    derivationPath?: string;
  };
}

/**
 * Decrypted payload - kept ONLY in volatile memory while the wallet is unlocked.
 * NEVER saved in localStorage, IndexedDB, cookies, or logs.
 */
export interface KeystorePayload {
  privateKey: Hex;
  mnemonic?: string; // 12-word recovery phrase
  createdAt: number;
}

/**
 * In-memory status of the local wallet
 */
export type LocalWalletStatus = 'uninitialized' | 'locked' | 'unlocked';

/**
 * Transaction / Signature Confirmation Request
 * Enforces Requirement 8: "Không tự động gửi giao dịch hoặc ký thông điệp khi người dùng chưa xác nhận."
 */
export type ConfirmationType = 'sendTransaction' | 'personal_sign' | 'signTypedData';

export interface BaseConfirmationRequest {
  id: string;
  type: ConfirmationType;
  chainId: number;
  from: Address;
  createdAt: number;
  resolve: (confirmed: boolean) => void;
}

export interface TxConfirmationRequest extends BaseConfirmationRequest {
  type: 'sendTransaction';
  to?: Address;
  value?: bigint;
  data?: Hex;
  gas?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

export interface MessageConfirmationRequest extends BaseConfirmationRequest {
  type: 'personal_sign';
  message: string;
  rawMessage: Hex | string;
}

export interface TypedDataConfirmationRequest extends BaseConfirmationRequest {
  type: 'signTypedData';
  typedData: any;
}

export type ConfirmationRequest =
  | TxConfirmationRequest
  | MessageConfirmationRequest
  | TypedDataConfirmationRequest;
