import type { PrivateKeyAccount } from 'viem/accounts';
import type { ConfirmationRequest, EncryptedKeystoreV1, LocalWalletStatus } from './types';
import { loadKeystoreFromStorage } from './storage';

let activeAccount: PrivateKeyAccount | null = null;
let activeKeystore: EncryptedKeystoreV1 | null = null;
const stateListeners = new Set<() => void>();

let confirmationHandler: ((req: ConfirmationRequest) => Promise<boolean>) | null = null;

function notifyListeners() {
  stateListeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('[session] Lỗi listener:', e);
    }
  });
}

/**
 * Subscribes to local wallet session changes (unlock, lock, logout).
 */
export function subscribeLocalWalletSession(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

/**
 * Gets the active decrypted account from volatile memory.
 */
export function getActiveLocalAccount(): PrivateKeyAccount | null {
  return activeAccount;
}

/**
 * Sets the active decrypted account in volatile memory.
 */
export function setActiveLocalAccount(
  account: PrivateKeyAccount | null,
  keystore?: EncryptedKeystoreV1 | null
): void {
  activeAccount = account;
  if (keystore !== undefined) {
    activeKeystore = keystore;
  }
  notifyListeners();
}

/**
 * Gets the encrypted keystore metadata (from memory or storage).
 */
export function getActiveKeystore(): EncryptedKeystoreV1 | null {
  if (activeKeystore) return activeKeystore;
  return loadKeystoreFromStorage();
}

/**
 * Locks the wallet: securely clears the private key from memory.
 * Requirement 6: Hỗ trợ khóa ví.
 */
export function lockLocalWallet(): void {
  activeAccount = null;
  notifyListeners();
}

/**
 * Checks the current status of the local wallet.
 */
export function getLocalWalletStatus(): LocalWalletStatus {
  if (activeAccount) {
    return 'unlocked';
  }
  const saved = loadKeystoreFromStorage();
  if (saved) {
    return 'locked';
  }
  return 'uninitialized';
}

/**
 * Sets the global transaction & signature confirmation UI handler.
 * Enforces Requirement 8: "Không tự động gửi giao dịch hoặc ký thông điệp khi người dùng chưa xác nhận."
 */
export function setLocalWalletConfirmationHandler(
  handler: ((req: ConfirmationRequest) => Promise<boolean>) | null
): void {
  confirmationHandler = handler;
}

/**
 * Requests explicit user confirmation before signing a transaction or message.
 */
export async function requestUserConfirmation(req: ConfirmationRequest): Promise<boolean> {
  if (!confirmationHandler) {
    // If no UI handler is mounted, fail closed!
    console.error('[session] Không tìm thấy Confirmation Modal. Từ chối ký tự động.');
    return false;
  }
  return confirmationHandler(req);
}
