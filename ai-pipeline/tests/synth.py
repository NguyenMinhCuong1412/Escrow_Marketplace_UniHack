"""
Sinh ảnh/video tổng hợp cho test pipeline (không cần ảnh thật).

- make_item(seed): "món đồ sưu tầm" giả — thẻ bài nhiều hoa văn/chữ, giàu keypoint ORB.
- photograph(item, ...): chụp lại món đồ ở góc khác (biến đổi phối cảnh, đổi sáng,
  nền khác), tuỳ chọn đặt tờ giấy ghi nonce bên cạnh.
- write_video(frames, path): ghép khung thành video unbox.

Chạy trực tiếp để xuất bộ mẫu xem bằng mắt:
    python ai-pipeline/tests/synth.py out_dir 0xa3f91c2e...
"""

from __future__ import annotations

import os
import sys

import cv2
import numpy as np

# Nonce mẫu dùng chung cho unit test
NONCE = "0xa3f91c2e" + "7b" * 28
SHORT = "a3f91c2e"


def make_item(seed: int, size: tuple[int, int] = (520, 380)) -> np.ndarray:
    rng = np.random.default_rng(seed)
    h, w = size
    img = np.zeros((h, w, 3), np.uint8)
    # nền gradient
    c1, c2 = rng.integers(40, 220, 3), rng.integers(40, 220, 3)
    for y in range(h):
        img[y] = (c1 * (1 - y / h) + c2 * (y / h)).astype(np.uint8)
    # hoa văn ngẫu nhiên
    for _ in range(60):
        color = tuple(int(v) for v in rng.integers(0, 255, 3))
        kind = rng.integers(0, 3)
        x, y = int(rng.integers(0, w)), int(rng.integers(0, h))
        if kind == 0:
            cv2.circle(img, (x, y), int(rng.integers(5, 40)), color, int(rng.choice([-1, 2, 3])))
        elif kind == 1:
            x2, y2 = int(rng.integers(0, w)), int(rng.integers(0, h))
            cv2.rectangle(img, (x, y), (x2, y2), color, int(rng.choice([-1, 2])))
        else:
            pts = rng.integers(0, [w, h], (5, 2)).astype(np.int32)
            cv2.polylines(img, [pts], True, color, 2)
    for i in range(6):
        txt = "".join(rng.choice(list("ABCDEFGHJKMNPQRSTUVWXYZ"), 5))
        cv2.putText(img, txt, (int(rng.integers(5, w - 150)), 40 + i * 75),
                    cv2.FONT_HERSHEY_DUPLEX, 1.1, (255, 255, 255), 3)
        cv2.putText(img, txt, (int(rng.integers(5, w - 150)), 40 + i * 75),
                    cv2.FONT_HERSHEY_DUPLEX, 1.1, (20, 20, 20), 1)
    cv2.rectangle(img, (0, 0), (w - 1, h - 1), (10, 10, 10), 6)
    return img


def nonce_card(text: str, size: tuple[int, int] = (130, 420)) -> np.ndarray:
    """Tờ giấy trắng ghi nonce nét to, ký tự cách nhau — mô phỏng hướng dẫn
    "viết rõ, tách từng ký tự" mà frontend hiển thị cho người dùng."""
    h, w = size
    card = np.full((h, w, 3), 250, np.uint8)
    font, thick, gap = cv2.FONT_HERSHEY_SIMPLEX, 4, 10
    scale = 1.6
    widths = [cv2.getTextSize(ch, font, scale, thick)[0][0] for ch in text]
    total = sum(widths) + gap * (len(text) - 1)
    if total > w - 30:
        scale *= (w - 30) / total
        widths = [cv2.getTextSize(ch, font, scale, thick)[0][0] for ch in text]
        total = sum(widths) + gap * (len(text) - 1)
    th = cv2.getTextSize("0", font, scale, thick)[0][1]
    x, y = (w - total) // 2, (h + th) // 2
    for ch, cw in zip(text, widths):
        cv2.putText(card, ch, (x, y), font, scale, (15, 15, 15), thick, cv2.LINE_AA)
        x += cw + gap
    return card


def photograph(item: np.ndarray, seed: int = 0, nonce_text: str | None = None,
               canvas: tuple[int, int] = (900, 1100), tilt: float = 0.08,
               brightness: float = 1.0) -> np.ndarray:
    """Đặt món hàng (+ giấy nonce) lên nền, biến đổi phối cảnh nhẹ, đổi sáng, thêm nhiễu."""
    rng = np.random.default_rng(seed + 1000)
    ch, cw = canvas
    bg_color = rng.integers(90, 180, 3)
    scene = np.empty((ch, cw, 3), np.uint8)
    scene[:] = bg_color
    noise = rng.normal(0, 6, scene.shape)
    scene = np.clip(scene + noise, 0, 255).astype(np.uint8)

    ih, iw = item.shape[:2]
    src = np.float32([[0, 0], [iw, 0], [iw, ih], [0, ih]])
    ox, oy = 120, 80
    jitter = lambda: float(rng.uniform(-tilt, tilt)) * iw  # noqa: E731
    dst = np.float32([
        [ox + jitter(), oy + jitter()],
        [ox + iw * 1.15 + jitter(), oy + jitter()],
        [ox + iw * 1.15 + jitter(), oy + ih * 1.15 + jitter()],
        [ox + jitter(), oy + ih * 1.15 + jitter()],
    ])
    M = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(item, M, (cw, ch))
    mask = cv2.warpPerspective(np.full((ih, iw), 255, np.uint8), M, (cw, ch))
    scene[mask > 0] = warped[mask > 0]

    if nonce_text:
        card = nonce_card(nonce_text)
        y0, x0 = ch - card.shape[0] - 60, (cw - card.shape[1]) // 2
        scene[y0:y0 + card.shape[0], x0:x0 + card.shape[1]] = card

    scene = np.clip(scene.astype(np.float32) * brightness, 0, 255).astype(np.uint8)
    return scene


def write_image(img: np.ndarray, path: str, quality: int = 92) -> str:
    ext = os.path.splitext(path)[1].lower()
    params = [cv2.IMWRITE_JPEG_QUALITY, quality] if ext in (".jpg", ".jpeg") else []
    ok, buf = cv2.imencode(ext, img, params)
    assert ok, path
    buf.tofile(path)
    return path


def write_video(frames: list[np.ndarray], path: str, fps: int = 8) -> str:
    """Ghi video; thử mp4v trước, nếu OpenCV build không hỗ trợ thì đổi sang .avi MJPG."""
    h, w = frames[0].shape[:2]
    for fourcc, ext in (("mp4v", os.path.splitext(path)[1] or ".mp4"), ("MJPG", ".avi")):
        out_path = os.path.splitext(path)[0] + ext
        vw = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*fourcc), fps, (w, h))
        if not vw.isOpened():
            continue
        for f in frames:
            vw.write(f)
        vw.release()
        if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
            return out_path
    raise RuntimeError("OpenCV không ghi được video ở định dạng nào")


def unbox_frames(item: np.ndarray, nonce_text: str | None, n: int = 12, seed: int = 7) -> list[np.ndarray]:
    """Chuỗi khung: hộp đóng (nền trơn) → món hàng lộ dần → món hàng + giấy nonce."""
    frames = []
    for i in range(n):
        if i < n // 3:
            frame = np.full((900, 1100, 3), 140, np.uint8)
            cv2.rectangle(frame, (250, 200), (850, 700), (60, 90, 140), -1)  # hộp carton
        else:
            frame = photograph(item, seed=seed + i, nonce_text=nonce_text if i >= n // 2 else None, tilt=0.05)
        frames.append(frame)
    return frames


if __name__ == "__main__":  # pragma: no cover - tiện ích xem mẫu
    out = sys.argv[1] if len(sys.argv) > 1 else "synth_samples"
    nonce = sys.argv[2] if len(sys.argv) > 2 else "0xa3f91c2e" + "0" * 56
    short = nonce.lower().removeprefix("0x")[:8]
    os.makedirs(out, exist_ok=True)
    item = make_item(1)
    write_image(item, os.path.join(out, "listing.jpg"))
    write_image(photograph(item, 1, short), os.path.join(out, "seller_packing.jpg"))
    write_image(photograph(item, 2, short, brightness=0.85), os.path.join(out, "buyer_unbox.jpg"))
    write_image(photograph(make_item(99), 3, short), os.path.join(out, "wrong_item.jpg"))
    write_image(photograph(item, 4, None), os.path.join(out, "no_nonce.jpg"))
    print("video:", write_video(unbox_frames(item, short), os.path.join(out, "buyer_unbox.mp4")))
    print("Đã ghi mẫu vào", out)
