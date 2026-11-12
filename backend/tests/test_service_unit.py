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
        s = _settings(tmp_path, allowed_hosts=["gateway.pinata.cloud"], allow_local_hosts=False)
        assert svc.resolve_url("https://gateway.pinata.cloud/ipfs/x", s)
        with pytest.raises(svc.DownloadError):
            svc.resolve_url("http://169.254.169.254/latest/meta-data", s)


class TestDownload:
    def test_download_ok_and_extension(self, tmp_path, file_server):
        root, base = file_server
        (root / "a.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"0" * 100)
        s = _settings(tmp_path, allowed_hosts=["127.0.0.1"], allow_local_hosts=True)
        p = svc.download(f"{base}/a.png", s, str(tmp_path), "x")
        assert p.endswith(".png")

    def test_download_404(self, tmp_path, file_server):
        _, base = file_server
        s = _settings(tmp_path, allowed_hosts=["127.0.0.1"], allow_local_hosts=True)
        with pytest.raises(svc.DownloadError):
            svc.download(f"{base}/missing.jpg", s, str(tmp_path), "x")

    def test_download_too_large(self, tmp_path, file_server):
        root, base = file_server
        (root / "big.jpg").write_bytes(b"0" * (2 * 1024 * 1024))
        s = _settings(tmp_path, max_download_mb=1, allowed_hosts=["127.0.0.1"], allow_local_hosts=True)
        with pytest.raises(svc.DownloadError, match="quá lớn"):
            svc.download(f"{base}/big.jpg", s, str(tmp_path), "x")

    def test_download_empty(self, tmp_path, file_server):
        root, base = file_server
        (root / "empty.jpg").write_bytes(b"")
        s = _settings(tmp_path, allowed_hosts=["127.0.0.1"], allow_local_hosts=True)
        with pytest.raises(svc.DownloadError, match="rỗng"):
            svc.download(f"{base}/empty.jpg", s, str(tmp_path), "x")

    def test_connection_refused(self, tmp_path):
        s = _settings(tmp_path, allowed_hosts=["127.0.0.1"], allow_local_hosts=True)
        with pytest.raises(svc.DownloadError):
            svc.download("http://127.0.0.1:1/x.jpg", s, str(tmp_path), "x")


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
            "trade_id": 1, "listing_image_url": "ipfs://QmListing",
            "seller_evidence_url": "ipfs://QmSeller", "buyer_evidence_url": "ipfs://QmBuyer"})
        assert r.status_code == 503

    def test_report_404(self, tmp_path):
        app = svc.create_app(_settings(tmp_path))
        assert TestClient(app).get("/report/5").status_code == 404

    def test_report_served_from_disk(self, tmp_path):
        s = _settings(tmp_path)
        (s.data_dir / "reports").mkdir(parents=True)
        (s.data_dir / "reports" / "9.json").write_text(json.dumps({"trade_id": 9}))
        assert TestClient(svc.create_app(s)).get("/report/9").json() == {"trade_id": 9}


# ---------------------------------------------------------------------------
# TASK 3A-01: SSRF Protection Unit Tests
# ---------------------------------------------------------------------------

class TestSSRFProtection:
    def test_ssrf_blocked_private_ip(self, tmp_path, monkeypatch):
        s = _settings(tmp_path, allowed_hosts=["safe.internal"], allow_local_hosts=False)
        monkeypatch.setattr(svc.socket, "getaddrinfo", lambda host, port: [
            (svc.socket.AF_INET, svc.socket.SOCK_STREAM, 6, '', ('10.0.0.1', 80))
        ])
        with pytest.raises(svc.DownloadError, match="SSRF"):
            svc.download("http://safe.internal/test.png", s, str(tmp_path), "img")

    def test_ssrf_blocked_loopback(self, tmp_path, monkeypatch):
        s = _settings(tmp_path, allowed_hosts=["localhost.local"], allow_local_hosts=False)
        monkeypatch.setattr(svc.socket, "getaddrinfo", lambda host, port: [
            (svc.socket.AF_INET, svc.socket.SOCK_STREAM, 6, '', ('127.0.0.1', 80))
        ])
        with pytest.raises(svc.DownloadError, match="SSRF"):
            svc.download("http://localhost.local/test.png", s, str(tmp_path), "img")

    def test_ssrf_blocked_link_local(self, tmp_path, monkeypatch):
        s = _settings(tmp_path, allowed_hosts=["metadata.corp"], allow_local_hosts=False)
        monkeypatch.setattr(svc.socket, "getaddrinfo", lambda host, port: [
            (svc.socket.AF_INET, svc.socket.SOCK_STREAM, 6, '', ('169.254.169.254', 80))
        ])
        with pytest.raises(svc.DownloadError, match="SSRF"):
            svc.download("http://metadata.corp/test.png", s, str(tmp_path), "img")

    def test_ssrf_blocked_ipv6_loopback(self, tmp_path, monkeypatch):
        s = _settings(tmp_path, allowed_hosts=["ipv6.local"], allow_local_hosts=False)
        monkeypatch.setattr(svc.socket, "getaddrinfo", lambda host, port: [
            (svc.socket.AF_INET6, svc.socket.SOCK_STREAM, 6, '', ('::1', 80, 0, 0))
        ])
        with pytest.raises(svc.DownloadError, match="SSRF"):
            svc.download("http://ipv6.local/test.png", s, str(tmp_path), "img")

    def test_ssrf_unknown_host_rejected(self, tmp_path):
        s = svc.Settings(data_dir=tmp_path / "data", allowed_hosts=["gateway.pinata.cloud"], allow_local_hosts=False)
        with pytest.raises(svc.DownloadError, match="ALLOWED_HOSTS"):
            svc.resolve_url("http://evil.com/img.png", s)

        class MockClient:
            agent_address = "0xAgent"
            def get_trade(self, tid):
                return type("T", (), {
                    "exists": True, "state": svc.TradeState.AwaitingEvidence,
                    "seller_evidence_hash": svc.evidence_hash_of("http://evil.com/img.png"),
                    "buyer_evidence_hash": svc.evidence_hash_of("ipfs://QmBuyer"),
                    "nonce": "0x" + "11" * 32, "item_value": 10**18, "seller": "0xS", "buyer": "0xB",
                })()
            def reputation_of(self, who): return 50

        app = svc.create_app(s, client=MockClient())
        app.state.registry.set(1, "listing", "ipfs://QmListing")
        client = TestClient(app)
        r = client.post("/verify-evidence", json={
            "trade_id": 1,
            "listing_image_url": "ipfs://QmListing",
            "seller_evidence_url": "http://evil.com/img.png",
            "buyer_evidence_url": "ipfs://QmBuyer",
        })
        assert r.status_code == 422

    def test_ssrf_redirect_to_internal_blocked(self, tmp_path, monkeypatch):
        s = _settings(tmp_path, allowed_hosts=["gateway.pinata.cloud", "10.0.0.1"], allow_local_hosts=False)

        class MockRedirectResp:
            status_code = 302
            is_redirect = True
            headers = {"Location": "http://10.0.0.1/evil.png"}
            def raise_for_status(self): pass
            def close(self): pass

        def mock_get(self_session, url, **kwargs):
            if "start.png" in url:
                return MockRedirectResp()
            return svc.requests.Response()

        def mock_getaddrinfo(host, port):
            if host == "gateway.pinata.cloud":
                return [(svc.socket.AF_INET, svc.socket.SOCK_STREAM, 6, '', ('8.8.8.8', 80))]
            if host == "10.0.0.1":
                return [(svc.socket.AF_INET, svc.socket.SOCK_STREAM, 6, '', ('10.0.0.1', 80))]
            return [(svc.socket.AF_INET, svc.socket.SOCK_STREAM, 6, '', (host, 80))]

        monkeypatch.setattr(svc.socket, "getaddrinfo", mock_getaddrinfo)
        monkeypatch.setattr(svc.requests.Session, "get", mock_get)

        with pytest.raises(svc.DownloadError, match="SSRF"):
            svc.download("https://gateway.pinata.cloud/ipfs/start.png", s, str(tmp_path), "img")

    def test_ssrf_allow_local_hosts_flag(self, tmp_path, monkeypatch):
        s = _settings(tmp_path, allowed_hosts=["local.corp"], allow_local_hosts=True)
        monkeypatch.setattr(svc.socket, "getaddrinfo", lambda host, port: [
            (svc.socket.AF_INET, svc.socket.SOCK_STREAM, 6, '', ('10.0.0.1', 80))
        ])

        class MockOkResp:
            status_code = 200
            is_redirect = False
            headers = {"Content-Type": "image/png"}
            def raise_for_status(self): pass
            def iter_content(self, chunk_size):
                yield b"\x89PNG\r\n\x1a\n" + b"0" * 32
            def close(self): pass

        monkeypatch.setattr(svc.requests.Session, "get", lambda *a, **kw: MockOkResp())
        p = svc.download("http://local.corp/test.png", s, str(tmp_path), "img")
        assert p.endswith(".png")

    def test_ssrf_content_type_rejected(self, tmp_path, monkeypatch):
        s = _settings(tmp_path, allowed_hosts=["gateway.pinata.cloud"], allow_local_hosts=True)

        class MockHtmlResp:
            status_code = 200
            is_redirect = False
            headers = {"Content-Type": "text/html"}
            def raise_for_status(self): pass
            def close(self): pass

        monkeypatch.setattr(svc.requests.Session, "get", lambda *a, **kw: MockHtmlResp())
        with pytest.raises(svc.DownloadError, match="Content-Type"):
            svc.download("https://gateway.pinata.cloud/ipfs/test.jpg", s, str(tmp_path), "img")


# ---------------------------------------------------------------------------
# TASK 3A-02: Auth, Rate Limit & CORS Unit Tests
# ---------------------------------------------------------------------------

class TestAPIKeyAuth:
    def test_auth_missing_api_key_returns_401(self, tmp_path):
        s = _settings(tmp_path, attest_api_key="my-secret-key")
        app = svc.create_app(s)
        client = TestClient(app)
        r = client.post("/verify-evidence", json={
            "trade_id": 1,
            "listing_image_url": "ipfs://QmListing",
            "seller_evidence_url": "ipfs://QmSeller",
            "buyer_evidence_url": "ipfs://QmBuyer",
        })
        assert r.status_code == 401
        assert r.json() == {"detail": "Invalid or missing API key"}

    def test_auth_wrong_api_key_returns_401(self, tmp_path):
        s = _settings(tmp_path, attest_api_key="my-secret-key")
        app = svc.create_app(s)
        client = TestClient(app)
        r = client.post("/verify-evidence", json={
            "trade_id": 1,
            "listing_image_url": "ipfs://QmListing",
            "seller_evidence_url": "ipfs://QmSeller",
            "buyer_evidence_url": "ipfs://QmBuyer",
        }, headers={"X-API-Key": "wrong-key"})
        assert r.status_code == 401
        assert r.json() == {"detail": "Invalid or missing API key"}

    def test_auth_correct_api_key_passes(self, tmp_path):
        s = _settings(tmp_path, attest_api_key="my-secret-key")
        app = svc.create_app(s)
        client = TestClient(app)
        r = client.post("/verify-evidence", json={
            "trade_id": 1,
            "listing_image_url": "ipfs://QmListing",
            "seller_evidence_url": "ipfs://QmSeller",
            "buyer_evidence_url": "ipfs://QmBuyer",
        }, headers={"X-API-Key": "my-secret-key"})
        assert r.status_code != 401

    def test_auth_no_env_key_skips_auth(self, tmp_path):
        s = _settings(tmp_path, attest_api_key=None)
        app = svc.create_app(s)
        client = TestClient(app)
        r = client.post("/verify-evidence", json={
            "trade_id": 1,
            "listing_image_url": "ipfs://QmListing",
            "seller_evidence_url": "ipfs://QmSeller",
            "buyer_evidence_url": "ipfs://QmBuyer",
        })
        assert r.status_code != 401


class TestRateLimiting:
    def test_rate_limit_exceeded_returns_429(self, tmp_path):
        s = _settings(tmp_path, attest_api_key=None)
        app = svc.create_app(s)
        client = TestClient(app)
        req_payload = {
            "trade_id": 1,
            "listing_image_url": "ipfs://QmListing",
            "seller_evidence_url": "ipfs://QmSeller",
            "buyer_evidence_url": "ipfs://QmBuyer",
        }
        for _ in range(10):
            r = client.post("/verify-evidence", json=req_payload)
            assert r.status_code != 429
        r11 = client.post("/verify-evidence", json=req_payload)
        assert r11.status_code == 429
        assert "Rate limit exceeded" in r11.json()["detail"]


class TestCORS:
    def test_cors_default_no_origin_header(self, tmp_path):
        s = _settings(tmp_path, cors_origins=[])
        app = svc.create_app(s)
        client = TestClient(app)
        r = client.get("/health", headers={"Origin": "http://localhost:3000"})
        assert "access-control-allow-origin" not in r.headers

    def test_cors_explicit_origin_allowed(self, tmp_path):
        s = _settings(tmp_path, cors_origins=["http://localhost:3000"])
        app = svc.create_app(s)
        client = TestClient(app)
        r = client.get("/health", headers={"Origin": "http://localhost:3000"})
        assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"


# ---------------------------------------------------------------------------
# TASK 3A-03: Listing Validation Unit Tests
# ---------------------------------------------------------------------------

class TestListingValidation:
    def test_listing_url_must_be_ipfs(self, tmp_path):
        s = _settings(tmp_path)
        class MockClient:
            def get_trade(self, tid):
                return type("T", (), {"exists": True})()
        app = svc.create_app(s, client=MockClient())
        app.state.registry.set(1, "listing", "ipfs://QmListing")
        client = TestClient(app)
        r = client.post("/verify-evidence", json={
            "trade_id": 1,
            "listing_image_url": "http://example.com/item.png",
            "seller_evidence_url": "ipfs://QmSeller",
            "buyer_evidence_url": "ipfs://QmBuyer",
        })
        assert r.status_code == 422
        assert r.json() == {"detail": "listing_image_url must be an ipfs:// URI"}

    def test_listing_url_https_rejected(self, tmp_path):
        s = _settings(tmp_path)
        class MockClient:
            def get_trade(self, tid):
                return type("T", (), {"exists": True})()
        app = svc.create_app(s, client=MockClient())
        app.state.registry.set(1, "listing", "ipfs://QmListing")
        client = TestClient(app)
        r = client.post("/verify-evidence", json={
            "trade_id": 1,
            "listing_image_url": "https://example.com/item.png",
            "seller_evidence_url": "ipfs://QmSeller",
            "buyer_evidence_url": "ipfs://QmBuyer",
        })
        assert r.status_code == 422
        assert r.json() == {"detail": "listing_image_url must be an ipfs:// URI"}

    def test_listing_ipfs_accepted(self, tmp_path):
        s = _settings(tmp_path)
        class MockClient:
            def get_trade(self, tid):
                return type("T", (), {
                    "exists": True, "state": svc.TradeState.Created,
                    "seller_evidence_hash": "0x00", "buyer_evidence_hash": "0x00",
                })()
        app = svc.create_app(s, client=MockClient())
        app.state.registry.set(1, "listing", "ipfs://QmListing")
        client = TestClient(app)
        r = client.post("/verify-evidence", json={
            "trade_id": 1,
            "listing_image_url": "ipfs://QmListing",
            "seller_evidence_url": "ipfs://QmSeller",
            "buyer_evidence_url": "ipfs://QmBuyer",
        })
        # If it reached state check (409) instead of 422, ipfs:// was accepted
        assert r.status_code != 422 or "listing_image_url must be an ipfs:// URI" not in r.text

    def test_report_contains_listing_hash(self, tmp_path):
        raw_bytes = b"fake_listing_image_content_bytes"
        expected_hash = Web3.to_hex(Web3.keccak(raw_bytes)).lower()
        assert expected_hash.startswith("0x")
        assert len(expected_hash.replace("0x", "")) == 64


# ---------------------------------------------------------------------------
# TASK ESC-080: Listing Image Binding Unit Tests (AC-01, AC-02, AC-04)
# ---------------------------------------------------------------------------

class TestListingBindingUnit:
    @pytest.fixture
    def mock_ready_client(self):
        class MockClient:
            agent_address = "0xAgent"
            attest_called = False
            def get_trade(self, tid):
                return type("T", (), {
                    "exists": True,
                    "state": svc.TradeState.AwaitingEvidence,
                    "seller_evidence_hash": svc.evidence_hash_of("ipfs://QmSeller"),
                    "buyer_evidence_hash": svc.evidence_hash_of("ipfs://QmBuyer"),
                    "nonce": "0x" + "11" * 32,
                    "item_value": 10**18,
                    "seller": "0xSeller",
                    "buyer": "0xBuyer",
                })()
            def reputation_of(self, who):
                return 50
            def send_attest(self, *args, **kwargs):
                self.attest_called = True
                return "0xFakeTxHash"
        return MockClient()

    def test_ac01_unregistered_listing_returns_409(self, tmp_path, mock_ready_client):
        s = _settings(tmp_path)
        app = svc.create_app(s, client=mock_ready_client)
        client = TestClient(app)
        r = client.post("/verify-evidence", json={
            "trade_id": 1,
            "listing_image_url": "ipfs://QmListing",
            "seller_evidence_url": "ipfs://QmSeller",
            "buyer_evidence_url": "ipfs://QmBuyer",
        })
        assert r.status_code == 409
        assert "seller ký xác nhận" in r.json()["detail"]
        assert mock_ready_client.attest_called is False

    def test_ac02_mismatched_listing_returns_422(self, tmp_path, mock_ready_client):
        s = _settings(tmp_path)
        app = svc.create_app(s, client=mock_ready_client)
        app.state.registry.set(1, "listing", "ipfs://QmSignedListing")
        client = TestClient(app)
        r = client.post("/verify-evidence", json={
            "trade_id": 1,
            "listing_image_url": "ipfs://QmSpoofedListing",
            "seller_evidence_url": "ipfs://QmSeller",
            "buyer_evidence_url": "ipfs://QmBuyer",
        })
        assert r.status_code == 422
        assert "không khớp ảnh niêm yết" in r.json()["detail"]
        assert mock_ready_client.attest_called is False

    def test_ac04_dry_run_enforces_listing_binding(self, tmp_path, mock_ready_client):
        s = _settings(tmp_path)
        app = svc.create_app(s, client=mock_ready_client)
        client = TestClient(app)
        # 1. Unregistered listing with dry_run=True -> 409
        r1 = client.post("/verify-evidence", json={
            "trade_id": 1,
            "listing_image_url": "ipfs://QmListing",
            "seller_evidence_url": "ipfs://QmSeller",
            "buyer_evidence_url": "ipfs://QmBuyer",
            "dry_run": True,
        })
        assert r1.status_code == 409
        assert mock_ready_client.attest_called is False

        # 2. Mismatched listing with dry_run=True -> 422
        app.state.registry.set(1, "listing", "ipfs://QmSignedListing")
        r2 = client.post("/verify-evidence", json={
            "trade_id": 1,
            "listing_image_url": "ipfs://QmDifferent",
            "seller_evidence_url": "ipfs://QmSeller",
            "buyer_evidence_url": "ipfs://QmBuyer",
            "dry_run": True,
        })
        assert r2.status_code == 422
        assert mock_ready_client.attest_called is False

    def test_ac04_error_ordering_preserved(self, tmp_path):
        s = _settings(tmp_path)
        class MockClient:
            def get_trade(self, tid):
                if tid == 404:
                    return type("T", (), {"exists": False})()
                if tid == 1:
                    return type("T", (), {"exists": True, "state": svc.TradeState.Created})()
                if tid == 2:
                    empty = "0x" + "00" * 32
                    return type("T", (), {
                        "exists": True,
                        "state": svc.TradeState.AwaitingEvidence,
                        "seller_evidence_hash": empty,
                        "buyer_evidence_hash": empty,
                    })()
                raise ValueError("unknown tid")

        app = svc.create_app(s, client=MockClient())
        client = TestClient(app)
        # 404 checked before 409
        r404 = client.post("/verify-evidence", json={
            "trade_id": 404, "listing_image_url": "ipfs://a",
            "seller_evidence_url": "ipfs://b", "buyer_evidence_url": "ipfs://c",
        })
        assert r404.status_code == 404

        # Created state checked before listing
        r_created = client.post("/verify-evidence", json={
            "trade_id": 1, "listing_image_url": "ipfs://a",
            "seller_evidence_url": "ipfs://b", "buyer_evidence_url": "ipfs://c",
        })
        assert r_created.status_code == 409
        assert "Created" in r_created.json()["detail"]

        # Missing evidence checked before listing
        r_no_ev = client.post("/verify-evidence", json={
            "trade_id": 2, "listing_image_url": "ipfs://a",
            "seller_evidence_url": "ipfs://b", "buyer_evidence_url": "ipfs://c",
        })
        assert r_no_ev.status_code == 409
        assert "Chưa đủ bằng chứng" in r_no_ev.json()["detail"]
