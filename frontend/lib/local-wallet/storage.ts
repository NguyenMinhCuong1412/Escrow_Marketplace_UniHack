import type { EncryptedKeystoreV1 } from './types';

export const LOCAL_WALLET_STORAGE_KEY = 'escrow_local_wallet';

/**
 * Saves the encrypted keystore to localStorage.
 * NEVER saves plaintext private keys or seed phrases.
 */
export function saveKeystoreToStorage(keystore: EncryptedKeystoreV1): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(keystore);
    window.localStorage.setItem(LOCAL_WALLET_STORAGE_KEY, serialized);
  } catch (err) {
    console.error('[storage] Không thể lưu keystore vào localStorage:', err);
    throw new Error('Bộ nhớ trình duyệt đầy hoặc không cho phép ghi.');
  }
}

/**
 * Loads the encrypted keystore from localStorage.
 */
export function loadKeystoreFromStorage(): EncryptedKeystoreV1 | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_WALLET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EncryptedKeystoreV1;
    if (parsed && parsed.version === 1 && parsed.crypto && parsed.crypto.ciphertext) {
      return parsed;
    }
    return null;
  } catch (err) {
    console.error('[storage] Lỗi khi đọc keystore từ localStorage:', err);
    return null;
  }
}

/**
 * Removes the encrypted keystore from localStorage.
 */
export function removeKeystoreFromStorage(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LOCAL_WALLET_STORAGE_KEY);
}

/**
 * Exports the encrypted keystore as a downloadable JSON file.
 * Requirement 7: Cung cấp tùy chọn sao lưu an toàn.
 */
export function exportKeystoreBackup(keystore: EncryptedKeystoreV1): void {
  if (typeof window === 'undefined') return;
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(keystore, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `escrow-wallet-backup-${keystore.address.slice(0, 8)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

/**
 * Validates and parses an imported backup JSON file.
 */
export function parseKeystoreBackupFile(fileContent: string): EncryptedKeystoreV1 {
  try {
    const parsed = JSON.parse(fileContent);
    if (
      parsed.version === 1 &&
      parsed.address &&
      parsed.crypto &&
      parsed.crypto.cipher === 'aes-256-gcm' &&
      parsed.crypto.ciphertext &&
      parsed.crypto.cipherparams?.iv &&
      parsed.crypto.kdfparams?.salt
    ) {
      return parsed as EncryptedKeystoreV1;
    }
    throw new Error('Định dạng file sao lưu keystore không hợp lệ.');
  } catch (err: any) {
    throw new Error(`Lỗi đọc file sao lưu: ${err.message || 'File hỏng.'}`);
  }
}
