/**
 * Kiểm tra bảo mật tệp upload IPFS phía server (MKT-003):
 * - Nhận diện định dạng thật qua magic bytes (không tin `file.type` client gửi).
 * - Chỉ cho phép JPEG, PNG, WEBP, MP4.
 * - Giới hạn kích thước (ảnh 10 MB, video MP4 50 MB) và chặn file rỗng.
 * - Fail-closed trên mọi mạng khác Anvil local (31337) khi thiếu `PINATA_JWT`.
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const LOCAL_ANVIL_CHAIN_ID = 31337;

export type AllowedMediaMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4';

const ALLOWED_MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'hvc1',
  'hev1',
  'M4V ',
  'mp4v',
  'dash',
  'f4v ',
  'MSNV',
]);

function readAscii(bytes: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i += 1) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/** Nhận diện định dạng MIME thực tế hoàn toàn từ magic bytes. */
export function detectMediaMimeFromBytes(bytes: Uint8Array): AllowedMediaMime | null {
  if (!bytes || bytes.length < 4) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF <marker>
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[3] !== 0x00 &&
    bytes[3] !== 0xff
  ) {
    return 'image/jpeg';
  }

  // WEBP: "RIFF" <4-byte size> "WEBP"
  if (
    bytes.length >= 12 &&
    readAscii(bytes, 0, 4) === 'RIFF' &&
    readAscii(bytes, 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  // MP4: ISO BMFF <4-byte big-endian size >= 16> "ftyp" <4-byte major brand>
  if (bytes.length >= 16 && readAscii(bytes, 4, 8) === 'ftyp') {
    const boxSize =
      ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    const majorBrand = readAscii(bytes, 8, 12);
    if (boxSize >= 16 && boxSize <= bytes.length && ALLOWED_MP4_BRANDS.has(majorBrand)) {
      return 'video/mp4';
    }
  }

  return null;
}

export function extensionForMime(mime: AllowedMediaMime): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'video/mp4':
      return 'mp4';
  }
}

export function normalizeDeclaredMime(raw?: string | null): string {
  if (!raw) return '';
  const base = raw.split(';')[0].trim().toLowerCase();
  if (base === 'image/jpg') return 'image/jpeg';
  if (base === 'image/x-png') return 'image/png';
  return base;
}

export type PinValidationResult =
  | {
      ok: true;
      mime: AllowedMediaMime;
      mode: 'pinata' | 'mock';
      maxBytes: number;
    }
  | {
      ok: false;
      status: number;
      errorCode: string;
      error: string;
    };

/**
 * Kiểm tra đầy đủ magic bytes, đối chiếu MIME khai báo, giới hạn kích thước
 * và chính sách fail-closed khi thiếu PINATA_JWT trên Fuji / non-31337.
 */
export function validatePinUpload(params: {
  bytes: Uint8Array;
  declaredMime?: string | null;
  configuredChainId: number;
  sessionChainId: number;
  pinataJwt?: string | null;
}): PinValidationResult {
  const { bytes, declaredMime, configuredChainId, sessionChainId, pinataJwt } = params;

  if (!bytes || bytes.length === 0) {
    return {
      ok: false,
      status: 400,
      errorCode: 'EMPTY_FILE',
      error: 'Tệp tải lên bị rỗng.',
    };
  }

  const detectedMime = detectMediaMimeFromBytes(bytes);
  if (!detectedMime) {
    return {
      ok: false,
      status: 415,
      errorCode: 'UNSUPPORTED_MEDIA_TYPE',
      error: 'Nội dung tệp không hợp lệ. Chỉ hỗ trợ ảnh JPEG, PNG, WEBP hoặc video MP4.',
    };
  }

  const declared = normalizeDeclaredMime(declaredMime);
  if (declared && declared !== 'application/octet-stream' && declared !== detectedMime) {
    return {
      ok: false,
      status: 415,
      errorCode: 'MIME_MISMATCH',
      error: 'Định dạng tệp không khớp với nội dung thực tế.',
    };
  }

  const maxBytes = detectedMime === 'video/mp4' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (bytes.length > maxBytes) {
    return {
      ok: false,
      status: 413,
      errorCode: 'FILE_TOO_LARGE',
      error: 'File vượt quá giới hạn (ảnh tối đa 10 MB, video MP4 tối đa 50 MB).',
    };
  }

  const jwt = (pinataJwt || '').trim();
  if (!jwt) {
    const allowMock =
      configuredChainId === LOCAL_ANVIL_CHAIN_ID && sessionChainId === LOCAL_ANVIL_CHAIN_ID;
    if (!allowMock) {
      return {
        ok: false,
        status: 503,
        errorCode: 'IPFS_PROVIDER_UNCONFIGURED',
        error: 'Dịch vụ lưu trữ IPFS chưa được cấu hình trên mạng này.',
      };
    }
    return { ok: true, mime: detectedMime, mode: 'mock', maxBytes };
  }

  return { ok: true, mime: detectedMime, mode: 'pinata', maxBytes };
}
