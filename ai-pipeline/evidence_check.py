"""
evidence_check.py
------------------
Pipeline xác thực bằng chứng giao dịch (Vai 1, 2, 3, 4 trong CLAUDE.md).

Input : ảnh listing (seller đăng khi tạo trade), ảnh đóng gói (seller),
        ảnh hoặc video unbox (buyer), nonce mong đợi (đọc từ on-chain).
Output: EvidenceReport + report_hash (keccak256, bytes32) để agent gửi vào
        Escrow.attest(tradeId, riskScore, flagged, reportHash).

Độ phức tạp từng bước được ghi ngay dưới hàm tương ứng (Big-O thời gian/không gian).

Embedding: ưu tiên CLIP (open_clip) nếu đã cài và tải được model; nếu không,
tự động fallback về histogram màu HSV. Report luôn ghi rõ backend nào đã dùng.
OCR: cần Tesseract ở OS. Windows: đặt TESSERACT_CMD hoặc cài vào
"C:\\Program Files\\Tesseract-OCR" (tự dò).
"""

from __future__ import annotations

import base64
import json
import os
import re
import shutil
from dataclasses import dataclass, field, asdict
from functools import lru_cache
from typing import Optional, Sequence

import cv2
import numpy as np
from PIL import Image
import imagehash

try:
    import pytesseract
except ImportError:  # pragma: no cover - optional dependency
    pytesseract = None

try:
    from eth_utils import keccak as _keccak
except ImportError:  # pragma: no cover - fallback khi không có web3 stack
    from Crypto.Hash import keccak as _ck

    def _keccak(data: bytes) -> bytes:
        return _ck.new(digest_bits=256, data=data).digest()


REPORT_VERSION = 1
MAX_SIDE = 1024            # resize ảnh điện thoại (4000px) về cạnh dài 1024 trước ORB/OCR
PHASH_REUSE_THRESHOLD = 8  # Hamming <= 8 / 64 bit => nghi tái sử dụng
NONCE_LEN = 8              # số ký tự hex đầu của nonce mà người dùng viết tay
MIN_GOOD_INLIERS = 15      # dưới ngưỡng này ghi chú "khớp vật thể thấp"


def _configure_tesseract() -> None:
    if pytesseract is None:
        return
    cmd = os.environ.get("TESSERACT_CMD")
    if not cmd and not shutil.which("tesseract"):
        default = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if os.path.exists(default):
            cmd = default
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd


_configure_tesseract()


# ---------------------------------------------------------------------------
# Tiện ích đọc ảnh / video
# ---------------------------------------------------------------------------

def load_bgr(image_path: str, max_side: int = MAX_SIDE) -> np.ndarray:
    """Đọc ảnh thành mảng BGR, báo lỗi rõ ràng nếu file hỏng, resize nếu quá lớn."""
    # cv2.imread không đọc được đường dẫn Unicode trên Windows → đọc bytes rồi decode.
    data = np.fromfile(image_path, dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR) if data.size else None
    if img is None:
        raise ValueError(f"Không đọc được ảnh: {image_path}")
    h, w = img.shape[:2]
    scale = max_side / max(h, w)
    if scale < 1.0:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img
# O(w*h) thời gian (decode + resize), O(w*h) không gian


def extract_keyframes(video_path: str, n: int = 8) -> list[np.ndarray]:
    """Lấy n khung hình rải đều trong video unbox (buyer) để OCR + so khớp."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Không mở được video: {video_path}")
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    frames: list[np.ndarray] = []
    if total > 0:
        for idx in np.linspace(0, max(total - 1, 0), num=min(n, total), dtype=int):
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
            ok, frame = cap.read()
            if ok:
                frames.append(_downscale(frame))
    else:  # một số container không báo frame count → đọc tuần tự
        while len(frames) < n:
            ok, frame = cap.read()
            if not ok:
                break
            frames.append(_downscale(frame))
    cap.release()
    if not frames:
        raise ValueError(f"Video không có khung hình đọc được: {video_path}")
    return frames
# O(n * w*h) thời gian (decode n khung), O(n * w*h) không gian


def _downscale(img: np.ndarray, max_side: int = MAX_SIDE) -> np.ndarray:
    h, w = img.shape[:2]
    scale = max_side / max(h, w)
    if scale < 1.0:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def _as_bgr(src) -> np.ndarray:
    return src if isinstance(src, np.ndarray) else load_bgr(src)


# ---------------------------------------------------------------------------
# Vai 1: Evidence Integrity — chống ảnh tái sử dụng / lấy từ nguồn khác
# ---------------------------------------------------------------------------

def compute_phash(image) -> imagehash.ImageHash:
    """Perceptual hash (DCT pHash, 64 bit) của ảnh (đường dẫn hoặc mảng BGR)."""
    bgr = _as_bgr(image)
    pil = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    return imagehash.phash(pil)
# O(w*h) thời gian (resize 32x32 + DCT cố định), O(1) không gian (hash 64 bit)


def hamming_distance(h1: imagehash.ImageHash, h2: imagehash.ImageHash) -> int:
    """Khoảng cách Hamming giữa hai pHash. <= PHASH_REUSE_THRESHOLD là nghi tái sử dụng."""
    return int(h1 - h2)
# O(1) — so sánh 64 bit cố định


def is_reused_image(new_hash: imagehash.ImageHash, known_hashes: Sequence[imagehash.ImageHash],
                    threshold: int = PHASH_REUSE_THRESHOLD) -> tuple[bool, Optional[int]]:
    """Quét kho hash đã biết, trả về (có_trùng, index_gần_nhất). Kho rỗng → (False, None)."""
    best_idx, best_dist = None, 999
    for idx, kh in enumerate(known_hashes):
        d = hamming_distance(new_hash, kh)
        if d < best_dist:
            best_dist, best_idx = d, idx
    reused = best_idx is not None and best_dist <= threshold
    return reused, (best_idx if reused else None)
# O(N) thời gian với N = số ảnh trong kho, O(1) không gian ngoài kho đầu vào.
# Mở rộng về sau: thay quét tuyến tính bằng BK-tree để còn O(log N) khi kho lớn.


@lru_cache(maxsize=1)
def _load_clip():
    """Tải CLIP một lần duy nhất; trả None nếu không có thư viện/mạng."""
    try:
        import torch  # noqa: F401
        import open_clip  # type: ignore

        model, _, preprocess = open_clip.create_model_and_transforms("ViT-B-32", pretrained="openai")
        model.eval()
        return model, preprocess
    except Exception:
        return None


def embedding_backend() -> str:
    return "clip-vit-b32" if _load_clip() is not None else "hsv-histogram"


def compute_embedding(image) -> np.ndarray:
    """
    Embedding ngữ nghĩa cho ảnh, dùng để bắt ảnh bị crop/xoay/chỉnh màu mà
    pHash không bắt được. Ưu tiên CLIP (pretrained, không cần train),
    fallback về color histogram nếu môi trường không tải được model.
    """
    bgr = _as_bgr(image)
    clip = _load_clip()
    if clip is not None:
        import torch

        model, preprocess = clip
        pil = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        with torch.no_grad():
            emb = model.encode_image(preprocess(pil).unsqueeze(0))
        return emb.squeeze(0).cpu().numpy().astype(np.float32)

    # Fallback: histogram màu HSV 3D, chuẩn hoá — không mạnh bằng CLIP
    # nhưng không cần tải model, chạy offline được ngay.
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1, 2], None, [8, 8, 8], [0, 180, 0, 256, 0, 256])
    return cv2.normalize(hist, hist).flatten().astype(np.float32)
# O(w*h) thời gian cho cả hai nhánh (forward pass hoặc tính histogram),
# O(d) không gian với d = chiều embedding (512 cho CLIP ViT-B/32, 512 cho histogram 8^3).


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b)) or 1e-9
    return float(np.dot(a, b) / denom)
# O(d) thời gian/không gian, d = chiều embedding


# ---------------------------------------------------------------------------
# Vai 2: Item Identity Matching — cùng một vật thể cụ thể giữa các ảnh
# ---------------------------------------------------------------------------

@dataclass
class OrbMatch:
    inliers: int
    good_matches: int
    keypoints_a: int
    keypoints_b: int
    # (pts_a, pts_b, inlier_mask) để vẽ — không đưa vào report/hash
    _pts_a: Optional[np.ndarray] = field(default=None, repr=False)
    _pts_b: Optional[np.ndarray] = field(default=None, repr=False)
    _mask: Optional[np.ndarray] = field(default=None, repr=False)


def orb_match(image_a, image_b, ratio_thresh: float = 0.75, nfeatures: int = 1500) -> OrbMatch:
    """ORB + Lowe ratio test + RANSAC homography giữa hai ảnh."""
    gray_a = cv2.cvtColor(_as_bgr(image_a), cv2.COLOR_BGR2GRAY)
    gray_b = cv2.cvtColor(_as_bgr(image_b), cv2.COLOR_BGR2GRAY)
    orb = cv2.ORB_create(nfeatures=nfeatures)

    kp_a, des_a = orb.detectAndCompute(gray_a, None)
    kp_b, des_b = orb.detectAndCompute(gray_b, None)
    n_a, n_b = len(kp_a or []), len(kp_b or [])
    if des_a is None or des_b is None or n_a < 8 or n_b < 8:
        return OrbMatch(0, 0, n_a, n_b)

    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    raw_matches = bf.knnMatch(des_a, des_b, k=2)
    # knnMatch có thể trả về cặp chỉ 1 phần tử khi ảnh b có ít descriptor → lọc trước khi unpack
    good = [p[0] for p in raw_matches if len(p) == 2 and p[0].distance < ratio_thresh * p[1].distance]
    if len(good) < 8:
        return OrbMatch(0, len(good), n_a, n_b)

    pts_a = np.float32([kp_a[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    pts_b = np.float32([kp_b[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    _, mask = cv2.findHomography(pts_a, pts_b, cv2.RANSAC, 5.0)
    inliers = int(mask.sum()) if mask is not None else 0
    return OrbMatch(inliers, len(good), n_a, n_b, pts_a, pts_b, mask)
# O(n_a * n_b) thời gian cho brute-force knn (n ~1500 keypoint), RANSAC O(iter * m),
# O(n) không gian cho keypoint/descriptor.


def orb_match_score(image_a, image_b, ratio_thresh: float = 0.75) -> int:
    """Số inlier RANSAC — càng cao càng chắc là cùng MỘT vật thể cụ thể."""
    return orb_match(image_a, image_b, ratio_thresh).inliers


def draw_match_visual(image_a, image_b, match: Optional[OrbMatch] = None, max_lines: int = 80) -> bytes:
    """
    Ảnh PNG ghép 2 ảnh cạnh nhau, vẽ đường nối các keypoint inlier (xanh lá) —
    dùng cho Explainable Evidence Report trên frontend.
    """
    a, b = _as_bgr(image_a), _as_bgr(image_b)
    match = match or orb_match(a, b)
    h = max(a.shape[0], b.shape[0])
    canvas = np.full((h, a.shape[1] + b.shape[1], 3), 255, np.uint8)
    canvas[: a.shape[0], : a.shape[1]] = a
    canvas[: b.shape[0], a.shape[1]:] = b
    if match._mask is not None:
        idx = np.flatnonzero(match._mask.ravel())[:max_lines]
        for i in idx:
            xa, ya = match._pts_a[i, 0]
            xb, yb = match._pts_b[i, 0]
            p1, p2 = (int(xa), int(ya)), (int(xb) + a.shape[1], int(yb))
            cv2.line(canvas, p1, p2, (60, 200, 60), 1, cv2.LINE_AA)
            cv2.circle(canvas, p1, 3, (40, 160, 255), -1)
            cv2.circle(canvas, p2, 3, (40, 160, 255), -1)
    cv2.putText(canvas, f"{match.inliers} inliers", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)
    ok, buf = cv2.imencode(".png", canvas)
    if not ok:
        raise RuntimeError("Không encode được ảnh minh hoạ")
    return buf.tobytes()
# O(w*h) thời gian/không gian cho canvas + O(L) đường vẽ


# ---------------------------------------------------------------------------
# Ý tưởng A (differentiator chính): Nonce-in-frame proof qua OCR
# ---------------------------------------------------------------------------

# Các nhầm lẫn OCR phổ biến khi đọc chữ viết tay → ký tự hex tương ứng.
_OCR_CONFUSIONS = str.maketrans({"o": "0", "q": "0", "i": "1", "l": "1", "|": "1", "s": "5", "g": "9", "z": "2"})


def short_nonce(nonce_hex: str, length: int = NONCE_LEN) -> str:
    """8 ký tự hex đầu của nonce on-chain — dạng người dùng viết tay lên giấy."""
    return nonce_hex.lower().removeprefix("0x")[:length]


def _ocr_variants(bgr: np.ndarray) -> list[np.ndarray]:
    """Các phiên bản tiền xử lý để OCR — chữ viết tay/ánh sáng xấu cần nhiều cách thử."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    if max(gray.shape) < 1200:
        gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _, otsu = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    adaptive = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10)
    return [gray, otsu, adaptive]


def find_paper_regions(bgr: np.ndarray, max_regions: int = 3) -> list[np.ndarray]:
    """
    Dò các vùng "giấy trắng" (sáng, ít bão hoà màu, gần chữ nhật) — nơi người dùng
    ghi nonce. OCR trên vùng crop chính xác hơn hẳn OCR cả khung hình có nhiều hoa văn.
    """
    h, w = bgr.shape[:2]
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    # Ngưỡng sáng thích ứng: giấy thường là vùng sáng nhất khung hình, nên lấy theo
    # phân vị 99 thay vì số cố định (nền sáng ~200 sẽ dính vào giấy nếu ngưỡng thấp).
    v_thr = int(np.clip(np.percentile(hsv[..., 2], 99) - 35, 160, 225))
    mask = cv2.inRange(hsv, (0, 0, v_thr), (180, 60, 255))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    regions = []
    for c in contours:
        x, y, cw, ch = cv2.boundingRect(c)
        area = cw * ch
        if area < 0.005 * w * h or area > 0.6 * w * h:
            continue
        if cv2.contourArea(c) < 0.6 * area:  # không đủ "đặc" như một tờ giấy
            continue
        aspect = cw / max(ch, 1)
        if not 0.3 <= aspect <= 8:
            continue
        pad = 6
        regions.append((area, bgr[max(0, y - pad):y + ch + pad, max(0, x - pad):x + cw + pad]))
    regions.sort(key=lambda r: -r[0])
    return [r[1] for r in regions[:max_regions]]
# O(w*h) thời gian (threshold + contour), O(w*h) không gian cho mask


_HEX_WHITELIST = "-c tessedit_char_whitelist=0123456789abcdefABCDEF"


def _ocr_passes(bgr: np.ndarray):
    """Sinh text OCR lần lượt, từ cách rẻ + chính xác nhất tới cách tốn nhất — dùng
    generator để check_nonce dừng ngay khi đã thấy nonce:
      1. vùng giấy đã crop, whitelist ký tự hex (psm 7 = một dòng, psm 6 = khối)
      2. toàn ảnh, 3 biến thể tiền xử lý x 2 chế độ psm (fallback khi không dò được giấy)."""
    if pytesseract is None:
        raise RuntimeError("pytesseract chưa cài — chạy: pip install pytesseract, và cài tesseract-ocr ở OS")
    for crop in find_paper_regions(bgr):
        for variant in _ocr_variants(crop):
            for psm in (7, 6):
                yield pytesseract.image_to_string(variant, config=f"--psm {psm} {_HEX_WHITELIST}")
    for variant in _ocr_variants(bgr):
        for psm in (6, 11):
            yield pytesseract.image_to_string(variant, config=f"--psm {psm}")


def ocr_read_text(image) -> str:
    """Toàn bộ text đọc được (gộp các biến thể tiền xử lý + chế độ phân trang)."""
    return "\n".join(_ocr_passes(_as_bgr(image)))
# O(V * P * w*h) thời gian với V=3 biến thể, P=2 chế độ psm; O(k) không gian, k = số ký tự


def _nonce_tokens(text: str) -> list[str]:
    tokens = re.findall(r"[A-Za-z0-9|]{6,}", text)
    # Người dùng hay viết nonce thành 2 cụm "a3f9 1c2e" → nối các cụm ngắn liền nhau trên cùng dòng.
    for line in text.splitlines():
        joined = re.sub(r"[^A-Za-z0-9|]", "", line)
        if len(joined) >= 6:
            tokens.append(joined)
    return [t.lower() for t in tokens]


def ocr_read_nonce(image) -> list[str]:
    """Danh sách ứng viên nonce (chuỗi alphanumeric >= 6 ký tự, đã chuẩn hoá chữ thường)."""
    return _nonce_tokens(ocr_read_text(image))


def _levenshtein(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]
# O(|a|*|b|) thời gian, O(|b|) không gian


@dataclass
class NonceCheck:
    expected: str               # 8 ký tự hex mong đợi
    found: bool
    best_candidate: Optional[str]
    edit_distance: Optional[int]
    method: Optional[str] = None  # "qr" | "ocr" — cách đã đọc được ứng viên tốt nhất


# --- Nonce dạng mã QR -------------------------------------------------------
# Chữ viết tay khiến OCR thiếu ổn định. Mã QR mang 16 ký tự hex đầu của nonce
# (64 bit, so khớp CHÍNH XÁC, không nới lỗi) đọc được ổn định hơn nhiều qua ảnh
# chụp màn hình điện thoại / giấy in. Payload ngắn → QR version 2 (25x25 ô), ô to,
# chịu được ảnh mờ/nghiêng/nén JPEG. OCR chữ viết tay vẫn là phương án dự phòng.

QR_PREFIX = "TP1:"
QR_NONCE_LEN = 16


def qr_payload(nonce_hex: str) -> str:
    return QR_PREFIX + short_nonce(nonce_hex, QR_NONCE_LEN)


def make_nonce_qr(nonce_hex: str, size: int = 480) -> np.ndarray:
    """Ảnh QR (grayscale, có viền trắng) cho nonce của một giao dịch."""
    params = cv2.QRCodeEncoder_Params()
    params.correction_level = cv2.QRCodeEncoder_CORRECT_LEVEL_Q  # phục hồi được ~25% diện tích hỏng
    qr = cv2.QRCodeEncoder.create(params).encode(qr_payload(nonce_hex))
    qr = cv2.copyMakeBorder(qr, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=255)  # quiet zone đủ 4 ô
    return cv2.resize(qr, (size, size), interpolation=cv2.INTER_NEAREST)


def read_qr_texts(bgr: np.ndarray) -> list[str]:
    """Mọi chuỗi QR đọc được trong ảnh. Thử 2 bộ dò + bản phóng to cho QR nhỏ; lỗi OpenCV → coi như không có."""
    found: list[str] = []
    h, w = bgr.shape[:2]
    variants = [bgr]
    if max(h, w) <= 1400:
        variants.append(cv2.resize(bgr, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC))
    for img in variants:
        for make in (cv2.QRCodeDetector, getattr(cv2, "QRCodeDetectorAruco", None)):
            if make is None:
                continue
            try:
                ok, texts, _, _ = make().detectAndDecodeMulti(img)
            except cv2.error:
                continue
            if ok:
                found += [t for t in texts if t]
        if found:
            break
    return found


def _check_nonce_qr(bgr: np.ndarray, expected_nonce_hex: str) -> Optional[NonceCheck]:
    """None nếu ảnh không có QR của hệ thống; ngược lại kết quả so khớp chính xác."""
    target = short_nonce(expected_nonce_hex)
    wrong = None
    for text in read_qr_texts(bgr):
        t = text.strip().lower()
        if t == qr_payload(expected_nonce_hex).lower():
            return NonceCheck(target, True, target, 0, "qr")
        if t.startswith(QR_PREFIX.lower()):
            cand = t[len(QR_PREFIX):][:NONCE_LEN]
            wrong = NonceCheck(target, False, cand, _levenshtein(target, cand), "qr")
    return wrong


def check_nonce(image, expected_nonce_hex: str, max_edits: int = 1) -> NonceCheck:
    """
    So khớp nonce on-chain (8 ký tự hex đầu) với text OCR trong ảnh. Chấp nhận
    tối đa `max_edits` lỗi OCR (Levenshtein) — 8 hex = 32 bit, nới 1 lỗi chỉ
    tăng xác suất trùng ngẫu nhiên lên ~2^-24, vẫn an toàn.
    """
    target = short_nonce(expected_nonce_hex)
    bgr = _as_bgr(image)
    # Mã QR trước: nhanh và chính xác. Có QR đúng → xong. Không có / QR của giao dịch khác → thử OCR.
    qr = _check_nonce_qr(bgr, expected_nonce_hex)
    if qr is not None and qr.found:
        return qr
    best, best_d = None, None
    for text in _ocr_passes(bgr):
        for cand in _nonce_tokens(text):
            norm = cand.translate(_OCR_CONFUSIONS)
            for c in {cand, norm}:
                if target in c:
                    return NonceCheck(target, True, target, 0, "ocr")
                # trượt cửa sổ dài len±1 để bắt lỗi thêm/bớt 1 ký tự
                for w in (len(target) - 1, len(target), len(target) + 1):
                    for i in range(0, max(len(c) - w + 1, 0)):
                        d = _levenshtein(target, c[i:i + w])
                        if best_d is None or d < best_d:
                            best, best_d = c[i:i + w], d
        if best_d is not None and best_d <= max_edits:
            break
    ocr = NonceCheck(target, best_d is not None and best_d <= max_edits, best, best_d, "ocr" if best else None)
    if not ocr.found and qr is not None:
        return qr  # có QR nhưng là của giao dịch khác → báo rõ trong report
    return ocr
# O(C * L * 64) thời gian với C ứng viên, L độ dài ứng viên; O(1) không gian thêm


def nonce_present(image, expected_nonce_hex: str) -> bool:
    """Giữ API cũ: True nếu tìm thấy nonce (cho phép 1 lỗi OCR)."""
    return check_nonce(image, expected_nonce_hex).found


# ---------------------------------------------------------------------------
# Vai 3: Risk Scoring — công thức minh bạch, KHÔNG train blackbox
# ---------------------------------------------------------------------------

@dataclass
class RiskInputs:
    seller_reputation: int          # 0-100, mặc định 50
    buyer_reputation: int
    item_value_wei: int
    phash_reused: bool              # Vai 1 phát hiện ảnh trùng ảnh cũ
    identity_match_inliers: int     # Vai 2, số inlier ORB+RANSAC (min của listing↔seller, listing↔buyer)
    nonce_ok_seller: bool           # Ý tưởng A
    nonce_ok_buyer: bool


def risk_score(x: RiskInputs) -> tuple[int, bool]:
    """
    Công thức trọng số tay (minh bạch, dễ giải thích với giám khảo
    thay vì model train trên dữ liệu không rõ nguồn gốc).

    score in [0, 100], cao = rủi ro cao.
    flagged = True nếu có bất kỳ cờ đỏ cứng nào (nonce sai hoặc ảnh tái sử dụng) hoặc score >= 70.
    """
    hard_flag = x.phash_reused or (not x.nonce_ok_seller) or (not x.nonce_ok_buyer)

    reputation_term = 100 - ((x.seller_reputation + x.buyer_reputation) / 2)
    reputation_term = max(0.0, min(100.0, reputation_term))

    identity_term = 100 - min(max(x.identity_match_inliers, 0), 50) * 2  # inlier càng cao điểm càng thấp

    value_term = min(max(x.item_value_wei, 0) / 1e18, 10) * 5  # giá trị càng cao, rủi ro nền càng cao (tối đa +50)

    raw = 0.4 * reputation_term + 0.4 * identity_term + 0.2 * value_term
    if hard_flag:
        raw = max(raw, 80)  # cờ đỏ cứng luôn kéo điểm lên vùng nguy hiểm

    score = int(max(0, min(100, round(raw))))
    return score, bool(hard_flag or score >= 70)
# O(1) thời gian/không gian — chỉ là tổ hợp tuyến tính của các input đã tính sẵn


# ---------------------------------------------------------------------------
# Vai 4: Dispute Triage — gom tất cả lại thành Evidence Report
# ---------------------------------------------------------------------------

@dataclass
class EvidenceReport:
    trade_id: int
    phash_reused: bool
    phash_match_idx: Optional[int]
    embedding_similarity: float
    identity_match_inliers: int
    nonce_ok_seller: bool
    nonce_ok_buyer: bool
    risk_score: int
    flagged: bool
    notes: list[str] = field(default_factory=list)
    # Chi tiết bổ sung cho Explainable Evidence Report (mặc định rỗng để giữ API cũ)
    details: dict = field(default_factory=dict)
    version: int = REPORT_VERSION

    def to_dict(self) -> dict:
        return asdict(self)

    def canonical_json(self) -> str:
        """JSON chuẩn hoá (sort key, không khoảng trắng) — frontend tính lại keccak256
        của chuỗi này để đối chiếu với reportHash on-chain."""
        return json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":"), ensure_ascii=False)

    def to_hash(self) -> bytes:
        """keccak256(utf8(canonical_json)) — đúng hàm băm của EVM, 32 byte."""
        return _keccak(self.canonical_json().encode("utf-8"))
# O(1) — chỉ gom các giá trị đã tính, hash một chuỗi ngắn


def build_report(trade_id: int, x: RiskInputs, embedding_sim: float,
                 phash_reused: bool, phash_match_idx: Optional[int],
                 details: Optional[dict] = None) -> EvidenceReport:
    score, flagged = risk_score(x)
    notes = []
    if phash_reused:
        notes.append(f"Ảnh trùng ảnh cũ (index={phash_match_idx})")
    if not x.nonce_ok_seller:
        notes.append("Không đọc được nonce hợp lệ trong ảnh seller")
    if not x.nonce_ok_buyer:
        notes.append("Không đọc được nonce hợp lệ trong ảnh/keyframe buyer")
    if x.identity_match_inliers < MIN_GOOD_INLIERS:
        notes.append(f"Số điểm khớp vật thể thấp ({x.identity_match_inliers} inliers)")

    return EvidenceReport(
        trade_id=trade_id,
        phash_reused=phash_reused,
        phash_match_idx=phash_match_idx,
        embedding_similarity=round(float(embedding_sim), 4),
        identity_match_inliers=x.identity_match_inliers,
        nonce_ok_seller=x.nonce_ok_seller,
        nonce_ok_buyer=x.nonce_ok_buyer,
        risk_score=score,
        flagged=flagged,
        notes=notes,
        details=details or {},
    )


# ---------------------------------------------------------------------------
# Orchestrator: chạy trọn pipeline cho một giao dịch (backend chỉ cần gọi hàm này)
# ---------------------------------------------------------------------------

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"}


@dataclass
class AnalysisResult:
    report: EvidenceReport
    report_hash: bytes
    seller_phash: str
    buyer_phash: str
    match_visual_png: Optional[bytes] = None  # listing ↔ seller, vẽ inlier

    def match_visual_b64(self) -> Optional[str]:
        return base64.b64encode(self.match_visual_png).decode() if self.match_visual_png else None


def analyze_evidence(trade_id: int, listing_path: str, seller_path: str, buyer_path: str,
                     expected_nonce_hex: str, seller_reputation: int, buyer_reputation: int,
                     item_value_wei: int, known_hashes: Sequence[imagehash.ImageHash] = (),
                     with_visual: bool = True) -> AnalysisResult:
    """
    Chạy Vai 1 → 4 trên 3 file đã tải về. buyer_path có thể là ảnh hoặc video
    (video → lấy keyframe, nonce đạt nếu BẤT KỲ khung nào có nonce, identity
    lấy khung khớp tốt nhất).
    """
    listing = load_bgr(listing_path)
    seller = load_bgr(seller_path)
    if os.path.splitext(buyer_path)[1].lower() in VIDEO_EXTS:
        buyer_frames = extract_keyframes(buyer_path)
        buyer_kind = "video"
    else:
        buyer_frames = [load_bgr(buyer_path)]
        buyer_kind = "image"

    # Vai 1: Evidence Integrity — kiểm tra cả ảnh seller và buyer với kho đã biết
    seller_hash = compute_phash(seller)
    buyer_hash = compute_phash(buyer_frames[0])
    reused_s, idx_s = is_reused_image(seller_hash, known_hashes)
    reused_b, idx_b = is_reused_image(buyer_hash, known_hashes)
    phash_reused = reused_s or reused_b
    match_idx = idx_s if reused_s else idx_b
    # Seller tải lại chính ảnh listing làm "ảnh đóng gói" — dấu hiệu không chụp mới
    listing_reused_as_packing = hamming_distance(compute_phash(listing), seller_hash) <= PHASH_REUSE_THRESHOLD

    embedding_sim = cosine_similarity(compute_embedding(listing), compute_embedding(seller))

    # Vai 2: Item Identity Matching — listing↔seller và listing↔buyer (khung tốt nhất).
    # So với listing chứ không so seller↔buyer: hai ảnh bằng chứng cùng có tờ giấy nonce,
    # tự nó đã tạo hàng trăm keypoint khớp dù món hàng bên trong khác nhau.
    m_ls = orb_match(listing, seller)
    best_sb, best_frame_idx = OrbMatch(0, 0, 0, 0), 0
    for i, fr in enumerate(buyer_frames):
        m = orb_match(listing, fr)
        if m.inliers >= best_sb.inliers:
            best_sb, best_frame_idx = m, i
    identity_inliers = min(m_ls.inliers, best_sb.inliers)

    # Ý tưởng A: Nonce-in-frame proof
    nc_seller = check_nonce(seller, expected_nonce_hex)
    nc_buyer = NonceCheck(short_nonce(expected_nonce_hex), False, None, None)
    for fr in buyer_frames:
        nc = check_nonce(fr, expected_nonce_hex)
        if nc.found or (nc.edit_distance is not None and
                        (nc_buyer.edit_distance is None or nc.edit_distance < nc_buyer.edit_distance)):
            nc_buyer = nc
        if nc.found:
            break

    # Vai 3: Risk Scoring
    inputs = RiskInputs(
        seller_reputation=seller_reputation,
        buyer_reputation=buyer_reputation,
        item_value_wei=item_value_wei,
        phash_reused=phash_reused,
        identity_match_inliers=identity_inliers,
        nonce_ok_seller=nc_seller.found,
        nonce_ok_buyer=nc_buyer.found,
    )

    details = {
        "embedding_backend": embedding_backend(),
        "expected_nonce_short": short_nonce(expected_nonce_hex),
        "nonce_seller": asdict(nc_seller),
        "nonce_buyer": asdict(nc_buyer),
        "inliers_listing_seller": m_ls.inliers,
        "inliers_listing_buyer": best_sb.inliers,
        "buyer_evidence_kind": buyer_kind,
        "buyer_frames_checked": len(buyer_frames),
        "buyer_best_frame_index": best_frame_idx,
        "phash_seller": str(seller_hash),
        "phash_buyer": str(buyer_hash),
        "listing_reused_as_packing": listing_reused_as_packing,
        "seller_reputation": seller_reputation,
        "buyer_reputation": buyer_reputation,
        "item_value_wei": str(item_value_wei),
    }

    # Vai 4: Report
    report = build_report(trade_id, inputs, embedding_sim, phash_reused, match_idx, details)
    if listing_reused_as_packing:
        report.notes.append("Ảnh đóng gói gần như trùng ảnh listing — seller có thể không chụp ảnh mới")

    visual = draw_match_visual(listing, seller, m_ls) if with_visual else None
    return AnalysisResult(report, report.to_hash(), str(seller_hash), str(buyer_hash), visual)
# Tổng: O(F * w*h) với F = số khung buyer (OCR chiếm phần lớn thời gian thực tế)
