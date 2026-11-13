import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { verifySessionFromRequest } from '@/lib/auth-session';

// Route handler chạy phía server: PINATA_JWT KHÔNG BAO GIỜ được gửi xuống trình duyệt.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_TYPES = ['video/mp4'];
const PINATA_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

export async function POST(request: Request) {
  // 1. Kiểm tra session xác thực ví để chống lạm dụng tải tệp rác
  const session = verifySessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { error: 'Yêu cầu đăng nhập. Vui lòng xác thực ví trước khi tải tệp lên.' },
      { status: 401 }
    );
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get('file');
    file = value instanceof File ? value : null;
  } catch {
    return NextResponse.json({ error: 'Request phải là multipart/form-data có trường "file".' }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: 'Thiếu file upload.' }, { status: 400 });
  }

  // Kiểm tra lại ở server (không tin client)
  const isImage = IMAGE_TYPES.includes(file.type);
  const isVideo = VIDEO_TYPES.includes(file.type);
  if (!isImage && !isVideo) {
    return NextResponse.json({ error: 'Chỉ hỗ trợ ảnh JPG/PNG/WEBP hoặc video MP4.' }, { status: 415 });
  }
  if ((isImage && file.size > MAX_IMAGE_BYTES) || (isVideo && file.size > MAX_VIDEO_BYTES)) {
    return NextResponse.json({ error: 'File vượt quá giới hạn (ảnh 10 MB, video 50 MB).' }, { status: 413 });
  }

  const jwt = process.env.PINATA_JWT;

  // Chế độ MOCK (chưa cấu hình PINATA_JWT): trả CID giả lập, gắn cờ mock=true để UI hiển thị rõ.
  // CID giả là "mock" + sha256(nội dung) — tất định, nhưng KHÔNG tải được qua IPFS gateway.
  if (!jwt) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const digest = createHash('sha256').update(bytes).digest('hex');
    const cid = `mock${digest.slice(0, 46)}`;
    return NextResponse.json({ cid, uri: `ipfs://${cid}`, mock: true });
  }

  try {
    const upstream = new FormData();
    upstream.append('file', file, file.name || 'evidence');
    const res = await fetch(PINATA_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: upstream,
    });

    if (!res.ok) {
      // Không trả nguyên văn lỗi upstream (có thể chứa thông tin cấu hình)
      console.error('[api/pin] Pinata error status', res.status);
      return NextResponse.json({ error: `Pinata từ chối upload (HTTP ${res.status}).` }, { status: 502 });
    }

    const data = (await res.json()) as { IpfsHash?: string };
    if (!data.IpfsHash) {
      return NextResponse.json({ error: 'Pinata không trả về CID.' }, { status: 502 });
    }
    return NextResponse.json({ cid: data.IpfsHash, uri: `ipfs://${data.IpfsHash}`, mock: false });
  } catch (err) {
    console.error('[api/pin] upload failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Không kết nối được Pinata.' }, { status: 502 });
  }
}
