import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { verifySessionFromRequest } from '@/lib/auth-session';
import {
  LOCAL_ANVIL_CHAIN_ID,
  MAX_VIDEO_BYTES,
  extensionForMime,
  validatePinUpload,
} from '@/lib/pin-security';
import { backendBaseUrl, isSharedBffMode, validateCsrfRequest } from '@/lib/marketplace-bff';

// Route handler chạy phía server: PINATA_JWT KHÔNG BAO GIỜ được gửi xuống trình duyệt.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PINATA_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const PINATA_TIMEOUT_MS = 30_000;

export async function POST(request: Request) {
  const csrfError = validateCsrfRequest(request, { expectJson: false });
  if (csrfError) return csrfError;

  // 1. Kiểm tra session xác thực ví để chống lạm dụng tải tệp rác
  const session = verifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      {
        error_code: 'UNAUTHORIZED',
        error: 'Yêu cầu đăng nhập. Vui lòng xác thực ví trước khi tải tệp lên.',
      },
      { status: 401 }
    );
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get('file');
    file = value instanceof File ? value : null;
  } catch {
    return NextResponse.json(
      {
        error_code: 'INVALID_MULTIPART',
        error: 'Request phải là multipart/form-data có trường "file".',
      },
      { status: 400 }
    );
  }

  if (!file) {
    return NextResponse.json(
      { error_code: 'MISSING_FILE', error: 'Thiếu file upload.' },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { error_code: 'EMPTY_FILE', error: 'Tệp tải lên bị rỗng.' },
      { status: 400 }
    );
  }

  if (file.size > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      {
        error_code: 'FILE_TOO_LARGE',
        error: 'File vượt quá giới hạn (ảnh tối đa 10 MB, video MP4 tối đa 50 MB).',
      },
      { status: 413 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const configuredChainId = Number(
    process.env.CHAIN_ID ?? process.env.NEXT_PUBLIC_CHAIN_ID ?? '43113'
  );
  const sharedMode = isSharedBffMode();
  const jwt = (process.env.PINATA_JWT || '').trim();

  // 2. Xác thực magic bytes + giới hạn theo loại thực tế + fail-closed nếu chain != 31337
  const check = validatePinUpload({
    bytes,
    declaredMime: file.type,
    configuredChainId,
    sessionChainId: session.chainId,
    pinataJwt: sharedMode ? 'shared-ops-relay' : jwt,
  });

  if (!check.ok) {
    return NextResponse.json(
      { error_code: check.errorCode, error: check.error },
      { status: check.status }
    );
  }

  if (sharedMode) {
    if (!session.opsToken) {
      return NextResponse.json(
        {
          error_code: 'UNAUTHORIZED',
          error: 'Phiên đăng nhập chưa có Ops JWT hợp lệ. Vui lòng kết nối lại ví.',
        },
        { status: 401 }
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PINATA_TIMEOUT_MS);
    try {
      const ext = extensionForMime(check.mime);
      const safeName = `marketplace-${randomBytes(6).toString('hex')}.${ext}`;
      const cleanBlob = new Blob(
        [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
        { type: check.mime }
      );
      const upstream = new FormData();
      upstream.append('file', cleanBlob, safeName);

      const headers: Record<string, string> = {
        Authorization: `Bearer ${session.opsToken}`,
      };
      const xff = request.headers.get('x-forwarded-for');
      const realIp = (request.headers.get('x-real-ip') || '').trim();
      const clientIp = (xff ? xff.split(',')[0].trim() : '') || realIp;
      if (clientIp && /^[A-Za-z0-9.:_-]{3,64}$/.test(clientIp)) {
        headers['X-Forwarded-For'] = clientIp;
      }

      const res = await fetch(`${backendBaseUrl()}/pin`, {
        method: 'POST',
        headers,
        body: upstream,
        signal: controller.signal,
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        return NextResponse.json(
          {
            error_code: (typeof data?.error_code === 'string' && data.error_code) || `HTTP_${res.status}`,
            error:
              (typeof data?.message === 'string' && data.message) ||
              (typeof data?.detail === 'string' && data.detail) ||
              `Tải tệp qua Ops Relay thất bại (HTTP ${res.status}).`,
          },
          { status: res.status }
        );
      }
      if (!data || typeof data.cid !== 'string' || typeof data.uri !== 'string') {
        return NextResponse.json(
          { error_code: 'IPFS_INVALID_RESPONSE', error: 'Ops Relay không trả về CID hợp lệ.' },
          { status: 502 }
        );
      }
      return NextResponse.json({
        cid: data.cid,
        uri: data.uri,
        mock: Boolean(data.mock),
        mime_type: data.mime_type || check.mime,
        size: typeof data.size === 'number' ? data.size : bytes.length,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      return NextResponse.json(
        {
          error_code: aborted ? 'IPFS_TIMEOUT' : 'IPFS_UNREACHABLE',
          error: aborted ? 'Tải tệp lên IPFS quá thời gian chờ.' : 'Không kết nối được Ops Relay IPFS.',
        },
        { status: aborted ? 504 : 502 }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // 3. Mock CID chỉ được phép trên local Anvil (31337) khi không có PINATA_JWT
  if (check.mode === 'mock') {
    if (configuredChainId !== LOCAL_ANVIL_CHAIN_ID || session.chainId !== LOCAL_ANVIL_CHAIN_ID) {
      return NextResponse.json(
        {
          error_code: 'IPFS_PROVIDER_UNCONFIGURED',
          error: 'Dịch vụ lưu trữ IPFS chưa được cấu hình trên mạng này.',
        },
        { status: 503 }
      );
    }
    const digest = createHash('sha256').update(bytes).digest('hex');
    const cid = `mock${digest.slice(0, 46)}`;
    return NextResponse.json({
      cid,
      uri: `ipfs://${cid}`,
      mock: true,
      mime_type: check.mime,
      size: bytes.length,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PINATA_TIMEOUT_MS);

  try {
    const ext = extensionForMime(check.mime);
    const safeName = `marketplace-${randomBytes(6).toString('hex')}.${ext}`;
    const cleanBlob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
      type: check.mime,
    });
    const upstream = new FormData();
    upstream.append('file', cleanBlob, safeName);

    const res = await fetch(PINATA_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: upstream,
      signal: controller.signal,
    });

    if (!res.ok) {
      // Không trả nguyên văn lỗi upstream để tránh lộ thông tin token/cấu hình
      console.error('[api/pin] Pinata error status:', res.status);
      return NextResponse.json(
        {
          error_code: 'IPFS_PROVIDER_ERROR',
          error: `Dịch vụ lưu trữ IPFS từ chối tải tệp (HTTP ${res.status}).`,
        },
        { status: 502 }
      );
    }

    const data = (await res.json().catch(() => null)) as { IpfsHash?: unknown } | null;
    const cid = typeof data?.IpfsHash === 'string' ? data.IpfsHash.trim() : '';
    if (!cid || !/^[A-Za-z0-9]{10,128}$/.test(cid)) {
      return NextResponse.json(
        { error_code: 'IPFS_INVALID_RESPONSE', error: 'IPFS provider không trả về CID hợp lệ.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      cid,
      uri: `ipfs://${cid}`,
      mock: false,
      mime_type: check.mime,
      size: bytes.length,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    console.error('[api/pin] upload failed:', aborted ? 'timeout' : 'network error');
    return NextResponse.json(
      {
        error_code: aborted ? 'IPFS_TIMEOUT' : 'IPFS_UNREACHABLE',
        error: aborted ? 'Tải tệp lên IPFS quá thời gian chờ.' : 'Không kết nối được dịch vụ IPFS.',
      },
      { status: aborted ? 504 : 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
