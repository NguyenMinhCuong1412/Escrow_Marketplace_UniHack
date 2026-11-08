import json

import numpy as np
import pytest
from eth_utils import keccak

import evidence_check as ec
from synth import NONCE, SHORT

def _tesseract_available() -> bool:
    try:
        ec.pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


ocr = pytest.mark.skipif(ec.pytesseract is None or not _tesseract_available(), reason="Tesseract chưa cài")


# ---------------------------------------------------------------- I/O

class TestLoad:
    def test_load_bgr_ok(self, samples):
        img = ec.load_bgr(samples["listing"])
        assert img.ndim == 3 and img.shape[2] == 3

    def test_load_bgr_garbage_raises(self, samples):
        with pytest.raises(ValueError):
            ec.load_bgr(samples["garbage"])

    def test_load_bgr_missing_raises(self, tmp_path):
        with pytest.raises((ValueError, FileNotFoundError)):
            ec.load_bgr(str(tmp_path / "nope.jpg"))

    def test_load_bgr_downscales_large(self, tmp_path):
        big = np.zeros((3000, 4000, 3), np.uint8)
        path = str(tmp_path / "big.png")
        import cv2
        cv2.imencode(".png", big)[1].tofile(path)
        img = ec.load_bgr(path)
        assert max(img.shape[:2]) == ec.MAX_SIDE

    def test_unicode_path(self, tmp_path, samples):
        # Windows: cv2.imread không đọc được đường dẫn có dấu tiếng Việt
        import shutil
        dst = tmp_path / "ảnh_đóng_gói.jpg"
        shutil.copy(samples["seller"], dst)
        assert ec.load_bgr(str(dst)).size > 0

    def test_extract_keyframes(self, samples):
        frames = ec.extract_keyframes(samples["video"], n=6)
        assert 1 <= len(frames) <= 6
        assert all(f.ndim == 3 for f in frames)

    def test_extract_keyframes_bad_file(self, samples):
        with pytest.raises(ValueError):
            ec.extract_keyframes(samples["garbage"])


# ---------------------------------------------------------------- Vai 1

class TestPhash:
    def test_identical_distance_zero(self, samples):
        h = ec.compute_phash(samples["listing"])
        assert ec.hamming_distance(h, ec.compute_phash(samples["listing_png"])) <= 2

    def test_recompressed_is_still_reuse(self, samples):
        h1 = ec.compute_phash(samples["listing"])
        h2 = ec.compute_phash(samples["listing_recompressed"])
        assert ec.hamming_distance(h1, h2) <= ec.PHASH_REUSE_THRESHOLD

    def test_different_items_far(self, samples):
        h1 = ec.compute_phash(samples["listing"])
        h2 = ec.compute_phash(samples["other_item"])
        assert ec.hamming_distance(h1, h2) > ec.PHASH_REUSE_THRESHOLD

    def test_accepts_array(self, samples):
        arr = ec.load_bgr(samples["listing"])
        assert ec.compute_phash(arr) == ec.compute_phash(samples["listing"])

    def test_is_reused_empty_store(self, samples):
        assert ec.is_reused_image(ec.compute_phash(samples["listing"]), []) == (False, None)

    def test_is_reused_hit_returns_index(self, samples):
        store = [ec.compute_phash(samples["other_item"]), ec.compute_phash(samples["listing"])]
        reused, idx = ec.is_reused_image(ec.compute_phash(samples["listing_recompressed"]), store)
        assert reused and idx == 1

    def test_is_reused_miss_returns_none(self, samples):
        store = [ec.compute_phash(samples["other_item"])]
        assert ec.is_reused_image(ec.compute_phash(samples["listing"]), store) == (False, None)


class TestEmbedding:
    def test_shape_and_backend(self, samples):
        emb = ec.compute_embedding(samples["listing"])
        assert emb.ndim == 1 and emb.size > 0
        assert ec.embedding_backend() in ("clip-vit-b32", "hsv-histogram")

    def test_self_similarity_is_one(self, samples):
        e = ec.compute_embedding(samples["listing"])
        assert ec.cosine_similarity(e, e) == pytest.approx(1.0, abs=1e-5)

    def test_same_image_more_similar_than_other(self, samples):
        a = ec.compute_embedding(samples["listing"])
        b = ec.compute_embedding(samples["listing_recompressed"])
        c = ec.compute_embedding(samples["other_item"])
        assert ec.cosine_similarity(a, b) > ec.cosine_similarity(a, c)

    def test_cosine_zero_vector_safe(self):
        z = np.zeros(4, np.float32)
        assert ec.cosine_similarity(z, z) == 0.0


# ---------------------------------------------------------------- Vai 2

class TestOrb:
    def test_same_item_rephotographed_many_inliers(self, samples):
        assert ec.orb_match_score(samples["listing"], samples["seller"]) >= 50

    def test_different_item_few_inliers(self, samples):
        assert ec.orb_match_score(samples["listing"], samples["other_item_photo"]) < ec.MIN_GOOD_INLIERS

    def test_blank_image_returns_zero_without_crash(self, samples):
        assert ec.orb_match_score(samples["listing"], samples["blank"]) == 0
        assert ec.orb_match_score(samples["blank"], samples["blank"]) == 0

    def test_match_details(self, samples):
        m = ec.orb_match(samples["listing"], samples["seller"])
        assert m.keypoints_a > 0 and m.keypoints_b > 0
        assert m.good_matches >= m.inliers > 0

    def test_draw_match_visual_png(self, samples):
        png = ec.draw_match_visual(samples["listing"], samples["seller"])
        assert png[:8] == b"\x89PNG\r\n\x1a\n"

    def test_draw_match_visual_no_matches(self, samples):
        png = ec.draw_match_visual(samples["listing"], samples["blank"])
        assert png[:4] == b"\x89PNG"


# ---------------------------------------------------------------- Ý tưởng A: nonce OCR

class TestNonce:
    def test_short_nonce(self):
        assert ec.short_nonce(NONCE) == SHORT
        assert ec.short_nonce("0xABCDEF0123") == "abcdef01"
        assert ec.short_nonce("abcdef0123") == "abcdef01"

    def test_find_paper_regions(self, samples):
        crops = ec.find_paper_regions(ec.load_bgr(samples["seller"]))
        assert crops, "phải dò được tờ giấy ghi nonce"
        h, w = crops[0].shape[:2]
        assert w > h  # tờ giấy nằm ngang

    def test_find_paper_regions_blank_scene(self):
        assert ec.find_paper_regions(np.full((400, 400, 3), 120, np.uint8)) == []

    def test_levenshtein(self):
        assert ec._levenshtein("abc", "abc") == 0
        assert ec._levenshtein("abc", "abd") == 1
        assert ec._levenshtein("abc", "ab") == 1
        assert ec._levenshtein("", "abc") == 3

    @ocr
    def test_nonce_found(self, samples):
        r = ec.check_nonce(samples["seller"], NONCE)
        assert r.found and r.edit_distance == 0 and r.expected == SHORT
        assert ec.nonce_present(samples["seller"], NONCE)

    @ocr
    def test_nonce_found_buyer_darker(self, samples):
        assert ec.nonce_present(samples["buyer"], NONCE)

    @ocr
    def test_nonce_missing(self, samples):
        r = ec.check_nonce(samples["no_nonce"], NONCE)
        assert not r.found

    @ocr
    def test_wrong_nonce_rejected(self, samples):
        assert not ec.nonce_present(samples["wrong_nonce"], NONCE)

    @ocr
    def test_one_char_typo_tolerated(self, samples):
        r = ec.check_nonce(samples["one_typo"], NONCE)
        assert r.found and r.edit_distance == 1

    @ocr
    def test_one_char_typo_rejected_when_strict(self, samples):
        assert not ec.check_nonce(samples["one_typo"], NONCE, max_edits=0).found

    @ocr
    def test_nonce_split_in_two_groups(self, samples):
        assert ec.nonce_present(samples["two_groups"], NONCE)

    def test_ocr_confusion_table(self, monkeypatch):
        # OCR đọc "a3f9lc2e" (l thay cho 1) vẫn phải khớp
        monkeypatch.setattr(ec, "_ocr_passes", lambda bgr: iter(["note: A3F9LC2E\n"]))
        r = ec.check_nonce(np.zeros((10, 10, 3), np.uint8), NONCE, max_edits=0)
        assert r.found

    def test_no_text_at_all(self, monkeypatch):
        monkeypatch.setattr(ec, "_ocr_passes", lambda bgr: iter(["", "  \n"]))
        r = ec.check_nonce(np.zeros((10, 10, 3), np.uint8), NONCE)
        assert not r.found and r.best_candidate is None and r.edit_distance is None

    def test_missing_pytesseract_raises(self, monkeypatch):
        monkeypatch.setattr(ec, "pytesseract", None)
        with pytest.raises(RuntimeError):
            ec.check_nonce(np.zeros((10, 10, 3), np.uint8), NONCE)


# ---------------------------------------------------------------- Vai 3

def _inputs(**kw):
    base = dict(seller_reputation=50, buyer_reputation=50, item_value_wei=10**18,
                phash_reused=False, identity_match_inliers=60, nonce_ok_seller=True, nonce_ok_buyer=True)
    base.update(kw)
    return ec.RiskInputs(**base)


class TestRisk:
    def test_clean_trade_low_risk(self):
        score, flagged = ec.risk_score(_inputs())
        assert score == 21 and not flagged  # 0.4*50 + 0.4*0 + 0.2*5

    @pytest.mark.parametrize("kw", [
        {"phash_reused": True}, {"nonce_ok_seller": False}, {"nonce_ok_buyer": False},
    ])
    def test_hard_flags(self, kw):
        score, flagged = ec.risk_score(_inputs(**kw))
        assert flagged and score >= 80

    def test_no_identity_match_raises_score(self):
        assert ec.risk_score(_inputs(identity_match_inliers=0))[0] > ec.risk_score(_inputs())[0]

    def test_soft_threshold_flags(self):
        score, flagged = ec.risk_score(_inputs(seller_reputation=0, buyer_reputation=0,
                                               identity_match_inliers=0, item_value_wei=10 * 10**18))
        assert score == 90 and flagged

    def test_reputation_monotonic(self):
        lo = ec.risk_score(_inputs(seller_reputation=90, buyer_reputation=90))[0]
        hi = ec.risk_score(_inputs(seller_reputation=10, buyer_reputation=10))[0]
        assert lo < hi

    def test_bounds_with_extreme_inputs(self):
        for kw in ({"seller_reputation": 10**6, "buyer_reputation": 10**6},
                   {"identity_match_inliers": -5}, {"item_value_wei": 10**40},
                   {"seller_reputation": -100, "buyer_reputation": -100}):
            score, _ = ec.risk_score(_inputs(**kw))
            assert 0 <= score <= 100


# ---------------------------------------------------------------- Vai 4

class TestReport:
    def _report(self, **kw):
        return ec.build_report(7, _inputs(**kw), 0.91234567, kw.get("phash_reused", False), None)

    def test_notes(self):
        r = ec.build_report(7, _inputs(nonce_ok_buyer=False, identity_match_inliers=3, phash_reused=True),
                            0.5, True, 4)
        assert r.flagged
        assert any("index=4" in n for n in r.notes)
        assert any("buyer" in n for n in r.notes)
        assert any("3 inliers" in n for n in r.notes)

    def test_hash_is_keccak_of_canonical_json(self):
        r = self._report()
        assert r.to_hash() == keccak(r.canonical_json().encode())
        assert len(r.to_hash()) == 32

    def test_canonical_json_is_sorted_and_compact(self):
        s = self._report().canonical_json()
        parsed = json.loads(s)
        assert list(parsed.keys()) == sorted(parsed.keys())
        assert ", " not in s and ": " not in s

    def test_hash_deterministic(self):
        assert self._report().to_hash() == self._report().to_hash()

    def test_hash_changes_with_content(self):
        assert self._report().to_hash() != self._report(nonce_ok_buyer=False).to_hash()

    def test_similarity_rounded(self):
        assert self._report().embedding_similarity == 0.9123


# ---------------------------------------------------------------- orchestrator

@ocr
class TestAnalyze:
    def _run(self, samples, buyer="buyer", seller="seller", known=()):
        return ec.analyze_evidence(1, samples["listing"], samples[seller], samples[buyer], NONCE,
                                   50, 50, 10**18, known_hashes=known)

    def test_clean_trade(self, samples):
        res = self._run(samples)
        r = res.report
        assert not r.flagged, r.notes
        assert r.nonce_ok_seller and r.nonce_ok_buyer
        assert r.identity_match_inliers >= ec.MIN_GOOD_INLIERS
        assert r.details["buyer_evidence_kind"] == "image"
        assert res.report_hash == r.to_hash()
        assert res.match_visual_b64()

    def test_wrong_item_flagged_or_high_risk(self, samples):
        r = self._run(samples, seller="other_item_photo").report
        assert r.details["inliers_listing_seller"] < ec.MIN_GOOD_INLIERS
        assert r.risk_score > self._run(samples).report.risk_score

    def test_missing_nonce_flagged(self, samples):
        r = self._run(samples, buyer="no_nonce").report
        assert r.flagged and not r.nonce_ok_buyer

    def test_reused_image_flagged(self, samples):
        known = [ec.compute_phash(samples["seller"])]
        r = self._run(samples, known=known).report
        assert r.flagged and r.phash_reused and r.phash_match_idx == 0

    def test_listing_reused_as_packing(self, samples):
        r = self._run(samples, seller="listing").report
        assert r.details["listing_reused_as_packing"]
        assert r.flagged  # ảnh listing không có nonce → cờ cứng

    def test_buyer_video(self, samples):
        r = self._run(samples, buyer="video").report
        assert r.details["buyer_evidence_kind"] == "video"
        assert r.nonce_ok_buyer
        assert r.details["inliers_listing_buyer"] >= ec.MIN_GOOD_INLIERS
        assert not r.flagged, r.notes

    def test_buyer_video_without_nonce(self, samples):
        r = self._run(samples, buyer="video_no_nonce").report
        assert not r.nonce_ok_buyer and r.flagged
