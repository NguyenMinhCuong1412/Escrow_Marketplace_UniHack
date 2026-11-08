import os
import sys

import pytest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..")))  # evidence_check
sys.path.insert(0, HERE)                                        # synth

import synth  # noqa: E402

from synth import NONCE, SHORT  # noqa: E402,F401


@pytest.fixture(scope="session")
def samples(tmp_path_factory):
    """Bộ ảnh tổng hợp dùng chung cho cả session (sinh 1 lần)."""
    d = tmp_path_factory.mktemp("samples")
    item = synth.make_item(1)
    other = synth.make_item(99)
    p = lambda name: str(d / name)  # noqa: E731
    paths = {
        "listing": synth.write_image(item, p("listing.jpg")),
        "listing_png": synth.write_image(item, p("listing.png")),
        "listing_recompressed": synth.write_image(item, p("listing_q40.jpg"), quality=40),
        "seller": synth.write_image(synth.photograph(item, 1, SHORT), p("seller.jpg")),
        "buyer": synth.write_image(synth.photograph(item, 2, SHORT, brightness=0.85), p("buyer.jpg")),
        "no_nonce": synth.write_image(synth.photograph(item, 4, None), p("no_nonce.jpg")),
        "wrong_nonce": synth.write_image(synth.photograph(item, 5, "77e0b5d1"), p("wrong_nonce.jpg")),
        "one_typo": synth.write_image(synth.photograph(item, 6, "a3f91c2f"), p("one_typo.jpg")),
        "two_groups": synth.write_image(synth.photograph(item, 7, "a3f9 1c2e"), p("two_groups.jpg")),
        "other_item": synth.write_image(other, p("other_item.jpg")),
        "other_item_photo": synth.write_image(synth.photograph(other, 3, SHORT), p("other_item_photo.jpg")),
        "blank": synth.write_image(__import__("numpy").full((300, 300, 3), 128, "uint8"), p("blank.png")),
        "video": synth.write_video(synth.unbox_frames(item, SHORT), p("unbox.mp4")),
        "video_no_nonce": synth.write_video(synth.unbox_frames(item, None), p("unbox_no_nonce.mp4")),
    }
    garbage = d / "garbage.jpg"
    garbage.write_bytes(b"this is not an image")
    paths["garbage"] = str(garbage)
    return paths
