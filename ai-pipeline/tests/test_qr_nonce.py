"""Nonce dạng mã QR: đọc ổn định hơn chữ viết tay; OCR vẫn là phương án dự phòng."""

import cv2
import numpy as np
import pytest

import evidence_check as ec
import synth

NONCE = "0x" + "a3f91c2e5b7d4086" + "11" * 24
OTHER = "0x" + "0123456789abcdef" + "22" * 24


def _scene_with_qr(nonce_hex, qr_px=170, seed=0, *, tilt=0.06, blur=1.2, brightness=0.75, quality=60,
                   item_seed=5):
    """Ảnh 'chụp' món hàng + mã QR hiển thị bên cạnh, có nghiêng/mờ/tối/nén JPEG."""
    scene = synth.photograph(synth.make_item(item_seed), seed, None)
    h, w = scene.shape[:2]
    qr = cv2.cvtColor(ec.make_nonce_qr(nonce_hex, qr_px), cv2.COLOR_GRAY2BGR)
    y0, x0 = h - qr_px - 50, (w - qr_px) // 2
    scene[y0:y0 + qr_px, x0:x0 + qr_px] = qr
    rng = np.random.default_rng(seed)
    j = lambda: float(rng.uniform(-tilt, tilt)) * w  # noqa: E731
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([[abs(j()), abs(j())], [w - abs(j()), abs(j())], [w - abs(j()), h - abs(j())], [abs(j()), h - abs(j())]])
    scene = cv2.warpPerspective(scene, cv2.getPerspectiveTransform(src, dst), (w, h), borderValue=(110, 110, 110))
    if blur:
        scene = cv2.GaussianBlur(scene, (5, 5), blur)
    scene = np.clip(scene.astype(np.float32) * brightness, 0, 255).astype(np.uint8)
    ok, buf = cv2.imencode(".jpg", scene, [cv2.IMWRITE_JPEG_QUALITY, quality])
    assert ok
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)


def test_payload_is_16_hex_with_prefix():
    assert ec.qr_payload(NONCE) == "TP1:a3f91c2e5b7d4086"
    assert ec.qr_payload(NONCE.upper().replace("0X", "0x")) == "TP1:a3f91c2e5b7d4086"


def test_qr_roundtrip_clean():
    img = cv2.cvtColor(ec.make_nonce_qr(NONCE), cv2.COLOR_GRAY2BGR)
    assert ec.read_qr_texts(img) and ec.read_qr_texts(img)[0] == ec.qr_payload(NONCE)
    nc = ec.check_nonce(img, NONCE)
    assert nc.found and nc.method == "qr" and nc.edit_distance == 0 and nc.expected == "a3f91c2e"


@pytest.mark.parametrize("seed", range(8))
def test_qr_found_in_degraded_photo(seed):
    nc = ec.check_nonce(_scene_with_qr(NONCE, seed=seed), NONCE)
    assert nc.found and nc.method == "qr"


@pytest.mark.parametrize("qr_px", [110, 140, 260])
def test_qr_found_at_various_sizes(qr_px):
    nc = ec.check_nonce(_scene_with_qr(NONCE, qr_px=qr_px, seed=3), NONCE)
    assert nc.found and nc.method == "qr"


def test_qr_of_another_trade_is_rejected():
    nc = ec.check_nonce(_scene_with_qr(OTHER, seed=1), NONCE)
    assert nc.found is False
    assert nc.method == "qr" and nc.best_candidate == "01234567"  # report nói rõ: có QR nhưng sai giao dịch


def test_foreign_qr_is_ignored():
    scene = synth.photograph(synth.make_item(7), 2, None)
    params = cv2.QRCodeEncoder_Params()
    qr = cv2.QRCodeEncoder.create(params).encode("https://example.com/a3f91c2e5b7d4086")
    qr = cv2.cvtColor(cv2.resize(cv2.copyMakeBorder(qr, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=255), (200, 200),
                                 interpolation=cv2.INTER_NEAREST), cv2.COLOR_GRAY2BGR)
    scene[600:800, 300:500] = qr
    nc = ec.check_nonce(scene, NONCE)
    assert nc.found is False and nc.method != "qr"


def test_no_qr_no_nonce_not_found():
    nc = ec.check_nonce(synth.photograph(synth.make_item(9), 4, None), NONCE)
    assert nc.found is False


def test_handwritten_path_still_works_and_reports_ocr():
    if ec.pytesseract is None:
        pytest.skip("Tesseract chưa cài")
    try:
        ec.pytesseract.get_tesseract_version()
    except Exception:
        pytest.skip("Tesseract chưa cài")
    short = ec.short_nonce(NONCE)
    for k in range(6):
        nc = ec.check_nonce(synth.photograph(synth.make_item(11), 1000 * k, short), NONCE)
        if nc.found:
            break
    assert nc.found and nc.method == "ocr"


def test_analyze_evidence_accepts_qr_evidence(tmp_path):
    item = synth.make_item(21)
    listing = synth.write_image(item, str(tmp_path / "listing.jpg"))
    seller = synth.write_image(_scene_with_qr(NONCE, seed=1, item_seed=21, blur=0, brightness=1.0, quality=90), str(tmp_path / "seller.jpg"))
    buyer = synth.write_image(_scene_with_qr(NONCE, seed=2, item_seed=21, blur=0, brightness=0.9, quality=90), str(tmp_path / "buyer.jpg"))
    res = ec.analyze_evidence(1, listing, seller, buyer, NONCE, 50, 50, 10**18)
    rep = res.report
    assert rep.nonce_ok_seller and rep.nonce_ok_buyer
    assert rep.details["nonce_seller"]["method"] == "qr" and rep.details["nonce_buyer"]["method"] == "qr"
    assert rep.flagged is False, rep.notes
