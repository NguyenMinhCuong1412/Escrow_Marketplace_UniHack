import { keccak256, toBytes } from 'viem';
import { chainId } from '@/lib/contracts';

/** Giới hạn phía client (khớp FRONTEND_SPEC §5 và whitelist Content-Type của backend). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const VIDEO_TYPES = ['video/mp4'];

export interface PinResult {
  cid: string;
  uri: string; // "ipfs://<cid>" — KHÔNG thêm tên file, KHÔNG dùng gateway URL
  mock: boolean; // true = chưa cấu hình PINATA_JWT, CID là giả lập (dữ liệu mô phỏng)
}

/** Trả về thông báo lỗi tiếng Việt nếu file không hợp lệ, hoặc null nếu hợp lệ. */
export function validateEvidenceFile(file: File, opts: { allowVideo: boolean }): string | null {
  const isImage = IMAGE_TYPES.includes(file.type);
  const isVideo = VIDEO_TYPES.includes(file.type);
  if (!isImage && !(opts.allowVideo && isVideo)) {
    return opts.allowVideo
      ? 'Chỉ hỗ trợ ảnh JPG/PNG/WEBP hoặc video MP4.'
      : 'Chỉ hỗ trợ ảnh JPG/PNG/WEBP.';
  }
  if (isImage && file.size > MAX_IMAGE_BYTES) return 'Ảnh vượt quá 10 MB.';
  if (isVideo && file.size > MAX_VIDEO_BYTES) return 'Video vượt quá 50 MB.';
  return null;
}

/** Upload file qua route server-side /api/pin (PINATA_JWT chỉ nằm ở server). */
export async function uploadToIpfs(file: File): Promise<PinResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/pin', { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `Upload IPFS thất bại (HTTP ${res.status}).`);
  }
  if (typeof body?.uri !== 'string' || !body.uri.startsWith('ipfs://')) {
    throw new Error('Phản hồi upload IPFS không hợp lệ.');
  }
  return body as PinResult;
}

/** evidenceHash = keccak256(utf8(uri)) — khớp backend/chain.py evidence_hash_of(). */
export function evidenceHashOf(uri: string): `0x${string}` {
  return keccak256(toBytes(uri));
}

export function ipfsToGatewayUrl(uri?: string | null): string {
  if (!uri) return '';
  if (!uri.startsWith('ipfs://')) return uri;
  const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';
  return gateway.replace(/\/+$/, '') + '/' + uri.slice('ipfs://'.length).replace(/^\/+/, '');
}

export function isMockUri(uri?: string | null): boolean {
  return Boolean(uri && uri.startsWith('ipfs://mock'));
}

// ---------------------------------------------------------------------------
// localStorage — chain chỉ lưu hash, nên URI phải được giữ lại ở client (FRONTEND_SPEC §5)
// ---------------------------------------------------------------------------

export type EvidenceRole = 'seller' | 'buyer';

const evidenceKey = (tradeId: string | bigint, role: EvidenceRole) =>
  `evidence:${chainId}:${tradeId.toString()}:${role}`;
const listingKey = (tradeId: string | bigint) => `listing:${chainId}:${tradeId.toString()}`;

function safeGet(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // bỏ qua lỗi storage (chế độ riêng tư, đầy bộ nhớ...)
  }
}

export const getStoredEvidenceUri = (id: string | bigint, role: EvidenceRole) => safeGet(evidenceKey(id, role));
export const setStoredEvidenceUri = (id: string | bigint, role: EvidenceRole, uri: string) =>
  safeSet(evidenceKey(id, role), uri);
export const getStoredListingUri = (id: string | bigint) => safeGet(listingKey(id));
export const setStoredListingUri = (id: string | bigint, uri: string) => safeSet(listingKey(id), uri);
