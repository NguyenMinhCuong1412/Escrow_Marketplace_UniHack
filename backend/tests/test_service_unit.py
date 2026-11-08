"""Unit test cho backend — không cần chain."""

import json

import imagehash
import pytest
from fastapi.testclient import TestClient
from web3 import Web3

import attest_service as svc
from chain import evidence_hash_of, load_abi, TradeState


def _settings(tmp_path, **kw):
    s = svc.Settings(data_dir=tmp_path / "data", **kw)
    return s


class TestResolveUrl:
    def test_ipfs_scheme(self, tmp_path):
        s = _settings(tmp_path, ipfs_gateway="https://gw.example/ipfs/")
        assert svc.resolve_url("ipfs://QmABC/img.jpg", s) == "https://gw.example/ipfs/QmABC/img.jpg"

    @pytest.mark.parametrize("bad", ["file:///etc/passwd", "ftp://x/y", "javascript:alert(1)", "not a url", "http://"])
    def test_rejects_bad_schemes(self, tmp_path, bad):
        with pytest.raises(svc.DownloadError):
            svc.resolve_url(bad, _settings(tmp_path))

    def test_allowlist(self, tmp_path):
        s = _settings(tmp_path, allowed_hosts=["gateway.pinata.cloud"])
        assert svc.resolve_url("https://gateway.pinata.cloud/ipfs/x", s)
        with pytest.raises(svc.DownloadError):
            svc.resolve_url("http://169.254.169.254/latest/meta-data", s)


class TestDownload:
    def test_download_ok_and_extension(self, tmp_path, file_server):
        root, base = file_server
        (root / "a.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"0" * 100)
        p = svc.download(f"{base}/a.png", _settings(tmp_path), str(tmp_path), "x")
        assert p.endswith(".png")

    def test_download_404(self, tmp_path, file_server):
        _, base = file_server
        with pytest.raises(svc.DownloadError):
            svc.download(f"{base}/missing.jpg", _settings(tmp_path), str(tmp_path), "x")

    def test_download_too_large(self, tmp_path, file_server):
        root, base = file_server
        (root / "big.jpg").write_bytes(b"0" * (2 * 1024 * 1024))
        s = _settings(tmp_path, max_download_mb=1)
        with pytest.raises(svc.DownloadError, match="quá lớn"):
            svc.download(f"{base}/big.jpg", s, str(tmp_path), "x")

    def test_download_empty(self, tmp_path, file_server):
        root, base = file_server
        (root / "empty.jpg").write_bytes(b"")
        with pytest.raises(svc.DownloadError, match="rỗng"):
            svc.download(f"{base}/empty.jpg", _settings(tmp_path), str(tmp_path), "x")

    def test_connection_refused(self, tmp_path):
        with pytest.raises(svc.DownloadError):
            svc.download("http://127.0.0.1:1/x.jpg", _settings(tmp_path), str(tmp_path), "x")


class TestKnownHashStore:
    def test_persist_and_exclude_same_trade(self, tmp_path):
        f = tmp_path / "kh.json"
        st = svc.KnownHashStore(f)
        h = "f0e1d2c3b4a59687"
        st.add(1, "seller", h)
        st.add(1, "seller", h)  # trùng → bỏ qua
        st.add(2, "buyer", "0123456789abcdef")
        assert len(st) == 2

        st2 = svc.KnownHashStore(f)  # đọc lại từ file
        hashes, rows = st2.hashes_excluding(1)
        assert [r["trade_id"] for r in rows] == [2]
        assert hashes[0] == imagehash.hex_to_hash("0123456789abcdef")

    def test_corrupt_file_starts_empty(self, tmp_path):
        f = tmp_path / "kh.json"
        f.write_text("{not json")
        assert len(svc.KnownHashStore(f)) == 0


class TestModels:
    def test_legacy_field_names_accepted(self):
        r = svc.VerifyRequest(trade_id=1, listing_image_url="a", seller_evidence_image_url="b",
                              buyer_evidence_keyframe_url="c")
        assert r.seller_evidence_url == "b" and r.buyer_evidence_url == "c" and r.dry_run is False

    def test_trade_id_positive(self):
        with pytest.raises(Exception):
            svc.VerifyRequest(trade_id=0, listing_image_url="a", seller_evidence_url="b", buyer_evidence_url="c")


class TestChainHelpers:
    def test_evidence_hash_matches_solidity_keccak_of_string(self):
        uri = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
        assert evidence_hash_of(uri) == Web3.to_hex(Web3.keccak(uri.encode())).lower()
        assert evidence_hash_of(uri).startswith("0x") and len(evidence_hash_of(uri)) == 66

    def test_bundled_abi_has_required_functions(self):
        abi = load_abi(svc.BACKEND_DIR / "abi" / "Escrow.json")
        names = {x.get("name") for x in abi}
        for fn in ("getTrade", "attest", "reputationOf", "agent", "submitEvidence", "createTrade"):
            assert fn in names

    def test_state_enum_matches_contract_order(self):
        assert [s.name for s in TradeState] == ["Created", "AwaitingEvidence", "Attested", "Disputed", "Resolved", "Cancelled"]


class TestAppWithoutChain:
    def test_health_reports_missing_config(self, tmp_path):
        app = svc.create_app(_settings(tmp_path))
        body = TestClient(app).get("/health").json()
        assert body["ok"] is False and "RPC_URL" in body["error"]

    def test_verify_503_without_config(self, tmp_path):
        app = svc.create_app(_settings(tmp_path))
        r = TestClient(app).post("/verify-evidence", json={
            "trade_id": 1, "listing_image_url": "http://x/a.jpg",
            "seller_evidence_url": "http://x/b.jpg", "buyer_evidence_url": "http://x/c.jpg"})
        assert r.status_code == 503

    def test_report_404(self, tmp_path):
        app = svc.create_app(_settings(tmp_path))
        assert TestClient(app).get("/report/5").status_code == 404

    def test_report_served_from_disk(self, tmp_path):
        s = _settings(tmp_path)
        (s.data_dir / "reports").mkdir(parents=True)
        (s.data_dir / "reports" / "9.json").write_text(json.dumps({"trade_id": 9}))
        assert TestClient(svc.create_app(s)).get("/report/9").json() == {"trade_id": 9}
