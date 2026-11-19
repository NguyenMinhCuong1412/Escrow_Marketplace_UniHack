"""
test_phase2_shared_ops.py
-------------------------
Comprehensive unit + integration + Anvil E2E tests for Shared Marketplace Phase 2:
- DEC-023: Shared Auth (EIP-191 Challenge -> HS256 Ops JWT), binding, replay, fail-closed, HMAC parity
- DEC-024: Ops Pinata Upload Relay (PINATA_JWT isolation, magic bytes/MIME, SQLite WAL wallet+IP quotas)
- DEC-025: Manual Verify Hardening (party-only authorization, keyless API -> isolated Worker delegation)
- Read Optimization: SQLite-trigger ETag/304 zero-stale coherency & NAT-friendly read rate limits

Uses strictly synthetic test data and public local Anvil test keys — never touches Owner demo data.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from web3 import Web3

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import attest_service as svc  # noqa: E402
import evidence_check as ec  # noqa: E402
import ops_auth  # noqa: E402
import pin_relay  # noqa: E402
import synth  # noqa: E402
from auto_agent import listing_message  # noqa: E402
from chain import ChainError, Trade, TradeState, evidence_hash_of  # noqa: E402
from listings import compute_proxy_signature  # noqa: E402
from worker import AgentWorker  # noqa: E402

ROOT = svc.ROOT_DIR
OUT = ROOT / "contracts" / "out"

ANVIL_DEPLOYER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ANVIL_AGENT = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
ANVIL_SELLER = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
ANVIL_BUYER = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
ANVIL_STRANGER = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"

STRONG_JWT_SECRET = "phase2-ops-jwt-secret-must-be-at-least-32-bytes-long!"
STRONG_ATTEST_KEY = "phase2-internal-attest-api-key-independent-32bytes!"
SAMPLE_PNG = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
    b"\x00\x00\x00\x0cIDATx\x9cc```\x00\x00\x00\x04\x00\x01\xf6\x178U"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


class _DummyReadClient:
    def __init__(self, cid: int = 31337, escrow_addr: str = "0x1234567890123456789012345678901234567890"):
        self._cid = cid
        self.escrow = type("Escrow", (), {"address": escrow_addr})()
        self.trades: dict[int, Trade] = {}
        self.reps: dict[str, int] = {}

    def chain_id(self) -> int:
        return self._cid

    def get_trade(self, tid: int) -> Trade:
        if tid in self.trades:
            return self.trades[tid]
        return Trade(
            trade_id=tid,
            seller="0x0000000000000000000000000000000000000000",
            buyer="0x0000000000000000000000000000000000000000",
            item_value=0,
            deposit_required=0,
            seller_deposit=0,
            buyer_deposit=0,
            nonce="0x" + "00" * 32,
            seller_evidence_hash="0x" + "00" * 32,
            buyer_evidence_hash="0x" + "00" * 32,
            report_hash="0x" + "00" * 32,
            risk_score=0,
            flagged=False,
            created_at=0,
            evidence_deadline=0,
            dispute_deadline=0,
            state=TradeState.AwaitingDeposits,
        )

    def next_trade_id(self) -> int:
        return (max(self.trades.keys()) + 1) if self.trades else 1

    def reputation_of(self, wallet: str) -> int:
        return self.reps.get(wallet.lower(), 50)


def _settings(tmp_path: Path, **kw) -> svc.Settings:
    defaults = dict(
        data_dir=tmp_path / "data",
        allow_local_hosts=True,
        allowed_hosts=["127.0.0.1", "localhost"],
        inspect_listing_images=False,
        require_proxy_signature=False,
        verify_chain_before_ttl_release=True,
        enable_shared_auth=True,
        ops_jwt_secret=STRONG_JWT_SECRET,
        attest_api_key=None,
    )
    defaults.update(kw)
    return svc.Settings(**defaults)


def _login_ops_jwt(
    client: TestClient,
    private_key: str,
    *,
    chain_id: int = 31337,
    origin: str = "http://localhost:3000",
) -> tuple[str, dict]:
    acct = Account.from_key(private_key)
    ch_res = client.post(
        "/auth/challenge",
        json={"address": acct.address, "chain_id": chain_id},
        headers={"Origin": origin},
    )
    assert ch_res.status_code == 200, ch_res.text
    ch = ch_res.json()
    sig = Account.sign_message(encode_defunct(text=ch["message"]), private_key=private_key).signature.hex()
    vr_res = client.post(
        "/auth/verify",
        json={
            "address": acct.address,
            "chain_id": chain_id,
            "nonce": ch["nonce"],
            "signature": sig,
            "challenge_token": ch["challenge_token"],
        },
        headers={"Origin": origin},
    )
    assert vr_res.status_code == 200, vr_res.text
    vr = vr_res.json()
    return vr["ops_token"], vr


# ---------------------------------------------------------------------------
# 1. Shared Auth (DEC-023)
# ---------------------------------------------------------------------------

class TestSharedAuthOpsJwt:
    def test_eip191_challenge_verify_and_marketplace_write_without_api_key(self, tmp_path):
        c = _DummyReadClient(cid=31337)
        s = _settings(tmp_path)
        app = svc.create_app(s, client=c)
        tc = TestClient(app)

        # Unauthenticated session status works cleanly
        sess0 = tc.get("/auth/session")
        assert sess0.status_code == 200
        assert sess0.json()["authenticated"] is False

        token, vr = _login_ops_jwt(tc, ANVIL_SELLER, chain_id=31337, origin="https://market.example.com")
        assert vr["token_type"] == "Bearer"
        assert vr["domain"] == "https://market.example.com"
        assert vr["address"].lower() == Account.from_key(ANVIL_SELLER).address.lower()

        sess1 = tc.get("/auth/session", headers={"Authorization": f"Bearer {token}"})
        assert sess1.status_code == 200
        assert sess1.json()["authenticated"] is True
        assert sess1.json()["domain"] == "https://market.example.com"

        # Listing mutation succeeds via Bearer Ops JWT alone (no ATTEST_API_KEY / HMAC required)
        res = tc.post(
            "/listings",
            json={
                "sku": "OPS-JWT-001",
                "category": "TRADING_CARD",
                "title": "PSA 10 Shared Auth Card",
                "description": "Authenticated solely by Ops JWT",
                "price_wei": str(10**18),
                "condition": "SEALED_NEW",
                "quantity_total": 1,
                "images": [{"uri": "ipfs://QmOpsJwtCard001", "is_primary": True}],
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 201, res.text
        created = res.json()
        assert created["seller_wallet"] == Account.from_key(ANVIL_SELLER).address.lower()

        # Replaying same challenge must be rejected atomically
        acct = Account.from_key(ANVIL_SELLER)
        ch = tc.post("/auth/challenge", json={"address": acct.address, "chain_id": 31337}, headers={"Origin": "http://localhost:3000"}).json()
        sig = Account.sign_message(encode_defunct(text=ch["message"]), private_key=ANVIL_SELLER).signature.hex()
        first = tc.post(
            "/auth/verify",
            json={
                "address": acct.address,
                "chain_id": 31337,
                "nonce": ch["nonce"],
                "signature": sig,
                "challenge_token": ch["challenge_token"],
            },
            headers={"Origin": "http://localhost:3000"},
        )
        assert first.status_code == 200
        replay = tc.post(
            "/auth/verify",
            json={
                "address": acct.address,
                "chain_id": 31337,
                "nonce": ch["nonce"],
                "signature": sig,
                "challenge_token": ch["challenge_token"],
            },
            headers={"Origin": "http://localhost:3000"},
        )
        assert replay.status_code == 401
        assert replay.json()["error_code"] == "CHALLENGE_REPLAYED"

    def test_rejects_domain_mismatch_chain_mismatch_tampered_and_spoofed_headers(self, tmp_path):
        c = _DummyReadClient(cid=31337)
        s = _settings(
            tmp_path,
            ops_auth_allowed_origins=["https://trusted.example.com"],
        )
        app = svc.create_app(s, client=c)
        tc = TestClient(app)
        seller = Account.from_key(ANVIL_SELLER).address

        # Disallowed origin must be rejected on challenge
        bad_origin = tc.post(
            "/auth/challenge",
            json={"address": seller, "chain_id": 31337},
            headers={"Origin": "https://evil.example.com"},
        )
        assert bad_origin.status_code == 403
        assert bad_origin.json()["error_code"] == "ORIGIN_NOT_ALLOWED"

        # Valid origin challenge -> verifying from different origin must fail
        ch = tc.post(
            "/auth/challenge",
            json={"address": seller, "chain_id": 31337},
            headers={"Origin": "https://trusted.example.com"},
        ).json()
        sig = Account.sign_message(encode_defunct(text=ch["message"]), private_key=ANVIL_SELLER).signature.hex()
        mismatch = tc.post(
            "/auth/verify",
            json={
                "address": seller,
                "chain_id": 31337,
                "nonce": ch["nonce"],
                "signature": sig,
                "challenge_token": ch["challenge_token"],
            },
            headers={"Origin": "https://other.trusted.example.com"},
        )
        assert mismatch.status_code in (401, 403)

        # Obtain valid JWT for chain 31337
        token, _ = _login_ops_jwt(tc, ANVIL_SELLER, chain_id=31337, origin="https://trusted.example.com")

        # Tamper alg=none JWT
        hdr_none = ops_auth._b64url_encode(b'{"alg":"none","typ":"JWT"}')
        parts = token.split(".")
        alg_none_tok = f"{hdr_none}.{parts[1]}."
        r_none = tc.get("/auth/session", headers={"Authorization": f"Bearer {alg_none_tok}"})
        assert r_none.status_code == 401

        # Tamper sub claim (privilege escalation)
        payload = json.loads(ops_auth._b64url_decode(parts[1]).decode("utf-8"))
        payload["sub"] = Account.from_key(ANVIL_BUYER).address.lower()
        tampered_tok = f"{parts[0]}.{ops_auth._b64url_encode(json.dumps(payload).encode())}.{parts[2]}"
        r_tamper = tc.get("/auth/session", headers={"Authorization": f"Bearer {tampered_tok}"})
        assert r_tamper.status_code == 401

        # Expired JWT rejected
        expired_tok = ops_auth.encode_hs256_jwt(
            {
                "iss": ops_auth.ISSUER,
                "typ": ops_auth.TOKEN_TYP_SESSION,
                "sub": seller.lower(),
                "chain_id": 31337,
                "domain": "https://trusted.example.com",
                "iat": 100,
                "exp": 200,
                "jti": "expired-jti",
            },
            STRONG_JWT_SECRET,
        )
        r_exp = tc.get("/auth/session", headers={"Authorization": f"Bearer {expired_tok}"})
        assert r_exp.status_code == 401
        assert r_exp.json()["error_code"] == "TOKEN_EXPIRED"

        # Spoofed X-Authenticated-Wallet disagreeing with Bearer JWT must fail 401 WALLET_MISMATCH
        buyer = Account.from_key(ANVIL_BUYER).address
        r_spoof = tc.post(
            "/listings",
            json={
                "sku": "SPOOF-001",
                "category": "OTHER",
                "title": "Spoof attempt",
                "description": "Spoof",
                "price_wei": str(10**18),
                "condition": "LIKE_NEW",
                "quantity_total": 1,
                "images": [{"uri": "ipfs://QmSpoof001", "is_primary": True}],
            },
            headers={
                "Authorization": f"Bearer {token}",
                "X-Authenticated-Wallet": buyer,
            },
        )
        assert r_spoof.status_code == 401
        assert r_spoof.json()["error_code"] == "WALLET_MISMATCH"

        # Bare X-Authenticated-Wallet without Bearer or ATTEST_API_KEY+HMAC rejected when enable_shared_auth=True
        r_bare = tc.post(
            "/listings",
            json={
                "sku": "BARE-001",
                "category": "OTHER",
                "title": "Bare header attempt",
                "description": "Bare",
                "price_wei": str(10**18),
                "condition": "LIKE_NEW",
                "quantity_total": 1,
                "images": [{"uri": "ipfs://QmBare001", "is_primary": True}],
            },
            headers={"X-Authenticated-Wallet": seller},
        )
        assert r_bare.status_code == 401

    def test_chain_mismatch_and_fail_closed_ops_jwt_secret_and_hmac_parity(self, tmp_path):
        # 1. Missing/weak OPS_JWT_SECRET fails closed on /auth/challenge & /listings (Fuji 43113)
        c_fuji = _DummyReadClient(cid=43113)
        s_missing = _settings(
            tmp_path / "m1",
            enable_shared_auth=True,
            ops_jwt_secret="",
            attest_api_key=STRONG_ATTEST_KEY,
            allow_local_hosts=False,
            enforce_evidence_hash=True,
            require_proxy_signature=True,
        )
        tc_missing = TestClient(svc.create_app(s_missing, client=c_fuji))
        r_miss = tc_missing.post("/auth/challenge", json={"address": Account.from_key(ANVIL_SELLER).address})
        assert r_miss.status_code == 503

        # 2. Equal to ATTEST_API_KEY fails closed
        s_same = _settings(
            tmp_path / "m2",
            enable_shared_auth=True,
            ops_jwt_secret=STRONG_ATTEST_KEY,
            attest_api_key=STRONG_ATTEST_KEY,
            allow_local_hosts=False,
            enforce_evidence_hash=True,
            require_proxy_signature=True,
        )
        tc_same = TestClient(svc.create_app(s_same, client=c_fuji))
        r_same = tc_same.post("/auth/challenge", json={"address": Account.from_key(ANVIL_SELLER).address})
        assert r_same.status_code == 503

        # 3. Chain 31337 Ops JWT cannot be used against Fuji 43113 server even with same secret
        tc_anvil = TestClient(svc.create_app(_settings(tmp_path / "c1", ops_jwt_secret=STRONG_JWT_SECRET), client=_DummyReadClient(cid=31337)))
        tok_31337, _ = _login_ops_jwt(tc_anvil, ANVIL_SELLER, chain_id=31337)

        s_fuji_ok = _settings(
            tmp_path / "f1",
            enable_shared_auth=True,
            ops_jwt_secret=STRONG_JWT_SECRET,
            attest_api_key=STRONG_ATTEST_KEY,
            allow_local_hosts=False,
            enforce_evidence_hash=True,
            require_proxy_signature=True,
        )
        tc_fuji = TestClient(svc.create_app(s_fuji_ok, client=c_fuji))
        r_wrong_chain = tc_fuji.get("/auth/session", headers={"Authorization": f"Bearer {tok_31337}"})
        assert r_wrong_chain.status_code == 409
        assert r_wrong_chain.json()["error_code"] == "CHAIN_MISMATCH"

        # 4. Internal HMAC BFF proxy headers STILL work seamlessly alongside Shared Auth!
        seller = Account.from_key(ANVIL_SELLER).address.lower()
        ts = int(time.time())
        nonce = "internal_hmac_nonce_001"
        sig = compute_proxy_signature(STRONG_ATTEST_KEY, "POST", "/listings", seller, 43113, ts, nonce)
        r_hmac = tc_fuji.post(
            "/listings",
            json={
                "sku": "HMAC-PARITY-001",
                "category": "OTHER",
                "title": "HMAC Parity Listing",
                "description": "Local/Dev HMAC still works",
                "price_wei": str(10**18),
                "condition": "LIKE_NEW",
                "quantity_total": 1,
                "images": [{"uri": "ipfs://QmHmacParity001", "is_primary": True}],
            },
            headers={
                "X-API-Key": STRONG_ATTEST_KEY,
                "X-Authenticated-Wallet": seller,
                "X-Authenticated-Chain-Id": "43113",
                "X-Auth-Timestamp": str(ts),
                "X-Auth-Nonce": nonce,
                "X-Auth-Signature": sig,
            },
        )
        assert r_hmac.status_code == 201, r_hmac.text


# ---------------------------------------------------------------------------
# 2. Pinata Upload Relay (DEC-024)
# ---------------------------------------------------------------------------

class TestPinataRelay:
    def test_authenticated_pin_upload_relay_validation_and_quotas(self, tmp_path):
        seen_calls = []

        def fake_pinata_upload(data: bytes, mime: str, jwt: str) -> str:
            seen_calls.append((len(data), mime, jwt))
            return "QmPhase2RelayCidValid1234567890"

        s = _settings(
            tmp_path,
            pinata_jwt="secret-pinata-ops-jwt-only",
            pin_max_wallet_files=2,
            pin_max_ip_files=3,
            trust_proxy_forwarded_for=True,
        )
        app = svc.create_app(s, client=_DummyReadClient(cid=31337))
        app.state.runtime.pin_uploader = fake_pinata_upload
        tc = TestClient(app)

        # Unauthenticated upload rejected 401
        r_unauth = tc.post("/pin", files={"file": ("item.png", SAMPLE_PNG, "image/png")})
        assert r_unauth.status_code == 401

        tok_seller, _ = _login_ops_jwt(tc, ANVIL_SELLER, chain_id=31337)
        tok_buyer, _ = _login_ops_jwt(tc, ANVIL_BUYER, chain_id=31337)

        # Disguised non-image payload rejected 415
        r_exe = tc.post(
            "/pin",
            files={"file": ("malware.png", b"MZ\x90\x00ThisIsAnExecutable", "image/png")},
            headers={"Authorization": f"Bearer {tok_seller}"},
        )
        assert r_exe.status_code == 415
        assert r_exe.json()["error_code"] == "UNSUPPORTED_MEDIA_TYPE"

        # Declared MIME mismatch (PNG content labeled image/jpeg) rejected 415
        r_mismatch = tc.post(
            "/pin",
            files={"file": ("wrong.jpg", SAMPLE_PNG, "image/jpeg")},
            headers={"Authorization": f"Bearer {tok_seller}"},
        )
        assert r_mismatch.status_code == 415
        assert r_mismatch.json()["error_code"] == "MIME_MISMATCH"

        # Empty file rejected 400
        r_empty = tc.post(
            "/pin",
            files={"file": ("empty.png", b"", "image/png")},
            headers={"Authorization": f"Bearer {tok_seller}"},
        )
        assert r_empty.status_code == 400

        # Valid uploads (2 from seller from IP 10.0.0.1) succeed and never leak PINATA_JWT
        for idx in range(2):
            r_ok = tc.post(
                "/pin",
                files={"file": (f"item{idx}.png", SAMPLE_PNG, "image/png")},
                headers={"Authorization": f"Bearer {tok_seller}", "X-Forwarded-For": "10.0.0.1"},
            )
            assert r_ok.status_code == 200, r_ok.text
            body = r_ok.json()
            assert body == {
                "cid": "QmPhase2RelayCidValid1234567890",
                "uri": "ipfs://QmPhase2RelayCidValid1234567890",
                "mock": False,
                "mime_type": "image/png",
                "size": len(SAMPLE_PNG),
            }
            assert "secret-pinata-ops-jwt-only" not in r_ok.text

        assert len(seen_calls) == 2
        assert seen_calls[0][2] == "secret-pinata-ops-jwt-only"

        # 3rd upload from same wallet exceeds per-wallet quota -> 429
        r_wallet_quota = tc.post(
            "/pin",
            files={"file": ("item3.png", SAMPLE_PNG, "image/png")},
            headers={"Authorization": f"Bearer {tok_seller}", "X-Forwarded-For": "10.0.0.2"},
        )
        assert r_wallet_quota.status_code == 429
        assert r_wallet_quota.json()["error_code"] == "PIN_QUOTA_EXCEEDED"

        # Buyer shares IP 10.0.0.1: 1st upload ok (ip total=3), 2nd exceeds per-IP quota (ip limit=3) -> 429
        r_buyer_1 = tc.post(
            "/pin",
            files={"file": ("b1.png", SAMPLE_PNG, "image/png")},
            headers={"Authorization": f"Bearer {tok_buyer}", "X-Forwarded-For": "10.0.0.1"},
        )
        assert r_buyer_1.status_code == 200
        r_buyer_2 = tc.post(
            "/pin",
            files={"file": ("b2.png", SAMPLE_PNG, "image/png")},
            headers={"Authorization": f"Bearer {tok_buyer}", "X-Forwarded-For": "10.0.0.1"},
        )
        assert r_buyer_2.status_code == 429
        assert r_buyer_2.json()["error_code"] == "PIN_QUOTA_EXCEEDED"

    def test_pin_relay_fail_closed_on_fuji_without_jwt_and_allows_mock_on_anvil(self, tmp_path):
        # Fuji 43113 without PINATA_JWT must fail closed with 503 IPFS_PROVIDER_UNCONFIGURED
        s_fuji = _settings(
            tmp_path / "fuji",
            pinata_jwt=None,
            attest_api_key=STRONG_ATTEST_KEY,
            allow_local_hosts=False,
            enforce_evidence_hash=True,
            require_proxy_signature=True,
        )
        app_fuji = svc.create_app(s_fuji, client=_DummyReadClient(cid=43113))
        tc_fuji = TestClient(app_fuji)
        tok_fuji, _ = _login_ops_jwt(tc_fuji, ANVIL_SELLER, chain_id=43113)
        r_fuji = tc_fuji.post(
            "/pin",
            files={"file": ("card.png", SAMPLE_PNG, "image/png")},
            headers={"Authorization": f"Bearer {tok_fuji}"},
        )
        assert r_fuji.status_code == 503
        assert r_fuji.json()["error_code"] == "IPFS_PROVIDER_UNCONFIGURED"

        # Anvil 31337 without PINATA_JWT returns deterministic mock CID
        s_anvil = _settings(tmp_path / "anvil", pinata_jwt=None)
        app_anvil = svc.create_app(s_anvil, client=_DummyReadClient(cid=31337))
        tc_anvil = TestClient(app_anvil)
        tok_anvil, _ = _login_ops_jwt(tc_anvil, ANVIL_SELLER, chain_id=31337)
        r_anvil = tc_anvil.post(
            "/pin",
            files={"file": ("card.png", SAMPLE_PNG, "image/png")},
            headers={"Authorization": f"Bearer {tok_anvil}"},
        )
        assert r_anvil.status_code == 200
        body = r_anvil.json()
        assert body["mock"] is True
        assert body["cid"].startswith("mock")
        assert body["uri"] == f"ipfs://{body['cid']}"


# ---------------------------------------------------------------------------
# 3. Manual Verify Hardening & Keyless API -> Worker Delegation (DEC-025)
# ---------------------------------------------------------------------------

class _MockEvidenceHttpServer:
    def __init__(self, tmp_dir: Path, trade_nonce: str):
        self.dir = tmp_dir
        self.dir.mkdir(parents=True, exist_ok=True)
        self.nonce = trade_nonce
        short = ec.short_nonce(trade_nonce)
        item = synth.make_item(11)
        synth.write_image(item, str(self.dir / "listing.jpg"))

        def _photo_with_ocr(seed_base: int, fname: str):
            for k in range(6):
                img = synth.photograph(item, seed_base + 1000 * k, short)
                out_path = synth.write_image(img, str(self.dir / fname))
                if ec.check_nonce(ec.load_bgr(out_path), trade_nonce).found:
                    return
            raise AssertionError("OCR could not verify synthetic nonce on JPEG image")

        _photo_with_ocr(1, "seller.jpg")
        _photo_with_ocr(2, "buyer.jpg")

        base_dir = self.dir

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                name = self.path.strip("/").split("/")[-1]
                p = base_dir / name
                if not p.exists():
                    self.send_response(404)
                    self.end_headers()
                    return
                data = p.read_bytes()
                ctype = "image/jpeg" if name.endswith(".jpg") else "image/png"
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args):
                return

        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.srv.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.srv.server_address[1]
        self.gateway = f"http://127.0.0.1:{self.port}/ipfs/"

    def close(self):
        self.srv.shutdown()
        self.srv.server_close()


class _FakeAttestingEscrowClient(_DummyReadClient):
    def __init__(self, trade: Trade, escrow_addr: str = "0x1234567890123456789012345678901234567890"):
        super().__init__(cid=31337, escrow_addr=escrow_addr)
        self.trades[trade.trade_id] = trade
        self.agent_address = Account.from_key(ANVIL_AGENT).address
        self.attested_calls: list[tuple] = []

    def agent_balance(self) -> int:
        return 10**18

    def onchain_agent(self) -> str:
        return self.agent_address

    def send_attest(self, tid: int, risk_score: int, flagged: bool, report_hash: bytes) -> str:
        t = self.trades[tid]
        if t.state != TradeState.AwaitingEvidence:
            raise ChainError("already attested")
        txh = "0x" + hashlib.sha256(f"{tid}:{risk_score}".encode()).hexdigest()
        self.trades[tid] = Trade(
            trade_id=t.trade_id,
            seller=t.seller,
            buyer=t.buyer,
            item_value=t.item_value,
            deposit_required=t.deposit_required,
            seller_deposit=t.seller_deposit,
            buyer_deposit=t.buyer_deposit,
            nonce=t.nonce,
            seller_evidence_hash=t.seller_evidence_hash,
            buyer_evidence_hash=t.buyer_evidence_hash,
            report_hash="0x" + report_hash.hex(),
            risk_score=risk_score,
            flagged=flagged,
            created_at=t.created_at,
            evidence_deadline=t.evidence_deadline,
            dispute_deadline=t.dispute_deadline + 100,
            state=TradeState.Attested,
        )
        self.attested_calls.append((tid, risk_score, flagged, "0x" + report_hash.hex()))
        return txh


class TestManualVerifyHardening:
    def test_non_party_blocked_and_keyless_api_delegates_to_worker(self, tmp_path):
        try:
            ec.pytesseract.get_tesseract_version()
        except Exception:
            pytest.skip("Tesseract not installed")

        seller_addr = Account.from_key(ANVIL_SELLER).address
        buyer_addr = Account.from_key(ANVIL_BUYER).address
        nonce_hex = "0x" + "ab" * 32
        escrow_addr = "0x1234567890123456789012345678901234567890"
        listing_uri = "ipfs://listing.jpg"
        seller_uri = "ipfs://seller.jpg"
        buyer_uri = "ipfs://buyer.jpg"

        trade = Trade(
            trade_id=1,
            seller=seller_addr,
            buyer=buyer_addr,
            item_value=2 * 10**18,
            deposit_required=6 * 10**17,
            seller_deposit=6 * 10**17,
            buyer_deposit=6 * 10**17,
            nonce=nonce_hex,
            seller_evidence_hash=evidence_hash_of(seller_uri),
            buyer_evidence_hash=evidence_hash_of(buyer_uri),
            report_hash="0x" + "00" * 32,
            risk_score=0,
            flagged=False,
            created_at=1000,
            evidence_deadline=9999999999,
            dispute_deadline=0,
            state=TradeState.AwaitingEvidence,
        )

        ev_http = _MockEvidenceHttpServer(tmp_path / "ipfs", nonce_hex)
        try:
            shared_data = tmp_path / "shared_data"
            fake_chain = _FakeAttestingEscrowClient(trade, escrow_addr=escrow_addr)
            ro_client = _DummyReadClient(cid=31337, escrow_addr=escrow_addr)
            ro_client.trades = fake_chain.trades

            # Public API has NO AGENT_PRIVATE_KEY and NO signing client
            api_settings = _settings(
                tmp_path,
                data_dir=shared_data,
                agent_private_key=None,
                ipfs_gateway=ev_http.gateway,
                allow_local_hosts=True,
                allowed_hosts=["127.0.0.1"],
                verify_trade_cooldown_seconds=30,
                verify_job_wait_timeout_seconds=15.0,
                verify_job_poll_interval_seconds=0.05,
            )
            api_app = svc.create_app(api_settings)
            api_app.state.runtime.state["readonly_client"] = ro_client
            api_app.state.runtime.state["chain_id"] = 31337
            assert api_app.state.runtime.has_signing_key() is False
            tc = TestClient(api_app)

            # Register signed listing URI as seller using Ops JWT
            tok_seller, _ = _login_ops_jwt(tc, ANVIL_SELLER, chain_id=31337)
            tok_buyer, _ = _login_ops_jwt(tc, ANVIL_BUYER, chain_id=31337)
            tok_stranger, _ = _login_ops_jwt(tc, ANVIL_STRANGER, chain_id=31337)

            msg = listing_message(31337, escrow_addr, 1, listing_uri)
            listing_sig = Account.sign_message(encode_defunct(text=msg), private_key=ANVIL_SELLER).signature.hex()

            # Third party cannot register URIs
            r_uri_stranger = tc.post(
                "/trade/1/uris",
                json={"role": "listing", "uri": listing_uri, "signature": listing_sig},
                headers={"Authorization": f"Bearer {tok_stranger}"},
            )
            assert r_uri_stranger.status_code == 403

            r_uri_ok = tc.post(
                "/trade/1/uris",
                json={"role": "listing", "uri": listing_uri, "signature": listing_sig},
                headers={"Authorization": f"Bearer {tok_seller}"},
            )
            assert r_uri_ok.status_code == 200

            verify_body = {
                "trade_id": 1,
                "listing_image_url": listing_uri,
                "seller_evidence_url": seller_uri,
                "buyer_evidence_url": buyer_uri,
                "dry_run": False,
                "include_visual": False,
            }

            # 1. Stranger cannot trigger Verify even with valid Ops JWT
            r_stranger = tc.post(
                "/verify-evidence",
                json=verify_body,
                headers={"Authorization": f"Bearer {tok_stranger}"},
            )
            assert r_stranger.status_code == 403
            assert r_stranger.json()["error_code"] == "NOT_TRADE_PARTY"

            # 2. Without Worker alive, keyless API fails closed with 503 AGENT_PRIVATE_KEY
            r_no_worker = tc.post(
                "/verify-evidence",
                json=verify_body,
                headers={"Authorization": f"Bearer {tok_seller}"},
            )
            assert r_no_worker.status_code == 503
            assert "AGENT_PRIVATE_KEY" in str(r_no_worker.json())

            # 2b. Immediate rapid repeat by same seller hits per-trade cooldown (429 VERIFY_COOLDOWN)
            r_cooldown = tc.post(
                "/verify-evidence",
                json=verify_body,
                headers={"Authorization": f"Bearer {tok_seller}"},
            )
            assert r_cooldown.status_code == 429
            assert r_cooldown.json()["error_code"] == "VERIFY_COOLDOWN"

            # Clear API cooldown triggered by attempt or test buyer party + isolated Worker!
            worker_settings = _settings(
                tmp_path,
                data_dir=shared_data,
                agent_private_key=ANVIL_AGENT,
                agent_poll_seconds=0.5,
                ipfs_gateway=ev_http.gateway,
                allow_local_hosts=True,
                allowed_hosts=["127.0.0.1"],
            )
            worker = AgentWorker(worker_settings, client=fake_chain, reconcile_interval_seconds=60.0)
            t = threading.Thread(target=worker.run_forever, daemon=True)
            t.start()
            try:
                # Wait briefly for worker heartbeat to become active in SQLite WAL
                for _ in range(40):
                    if api_app.state.runtime.is_external_worker_active()[0]:
                        break
                    time.sleep(0.05)
                assert api_app.state.runtime.is_external_worker_active()[0] is True

                # Buyer (legitimate party) triggers manual Verify on keyless API
                r_ok = tc.post(
                    "/verify-evidence",
                    json=verify_body,
                    headers={"Authorization": f"Bearer {tok_buyer}"},
                )
                assert r_ok.status_code == 200, r_ok.text
                res_json = r_ok.json()
                assert res_json["attested"] is True
                assert res_json["tx_hash"].startswith("0x")
                assert len(fake_chain.attested_calls) == 1
                assert ro_client.trades[1].state == TradeState.Attested

                # Immediate cooldown blocks rapid re-invocation cleanly (already Attested or cooldown)
                r_repeat = tc.post(
                    "/verify-evidence",
                    json=verify_body,
                    headers={"Authorization": f"Bearer {tok_buyer}"},
                )
                assert r_repeat.status_code in (409, 429)
            finally:
                worker.stop()
                t.join(timeout=5)
        finally:
            ev_http.close()


# ---------------------------------------------------------------------------
# 4. ETag / 304 Coherency & NAT-Friendly Read Rate Limits
# ---------------------------------------------------------------------------

class TestReadOptimizationAndNatRateLimit:
    def test_etag_304_invalidates_immediately_on_same_second_api_and_worker_writes(self, tmp_path):
        c = _DummyReadClient(cid=31337)
        s = _settings(tmp_path)
        app = svc.create_app(s, client=c)
        tc = TestClient(app)

        tok_seller, _ = _login_ops_jwt(tc, ANVIL_SELLER, chain_id=31337)

        # Initial GET /listings
        r1 = tc.get("/listings")
        assert r1.status_code == 200
        etag1 = r1.headers.get("etag")
        assert etag1
        assert "no-cache" in (r1.headers.get("cache-control") or "")
        assert r1.json()["total"] == 0

        # Conditional GET returns 304 Not Modified
        r_304 = tc.get("/listings", headers={"If-None-Match": etag1})
        assert r_304.status_code == 304
        assert r_304.headers.get("etag") == etag1
        assert r_304.content == b""

        # Same-second mutation via API immediately invalidates ETag via SQLite triggers
        r_create = tc.post(
            "/listings",
            json={
                "sku": "ETAG-001",
                "category": "OTHER",
                "title": "ETag Coherency Item",
                "description": "Tests SQLite trigger ETag bump",
                "price_wei": str(10**18),
                "condition": "LIKE_NEW",
                "quantity_total": 2,
                "images": [{"uri": "ipfs://QmEtagItem001", "is_primary": True}],
            },
            headers={"Authorization": f"Bearer {tok_seller}"},
        )
        assert r_create.status_code == 201
        listing_id = r_create.json()["id"]

        r2 = tc.get("/listings", headers={"If-None-Match": etag1})
        assert r2.status_code == 200
        etag2 = r2.headers.get("etag")
        assert etag2 and etag2 != etag1
        assert r2.json()["total"] == 1

        # Cross-process / separate DB connection mutation (simulating worker.py update) also invalidates ETag
        worker_db = svc.MarketplaceDB(s.data_dir / "marketplace.db")
        with worker_db.write_tx() as conn:
            conn.execute("UPDATE listings SET quantity_sold = 1 WHERE id = ?", (listing_id,))

        r3 = tc.get("/listings", headers={"If-None-Match": etag2})
        assert r3.status_code == 200
        etag3 = r3.headers.get("etag")
        assert etag3 and etag3 != etag2
        assert r3.json()["items"][0]["quantity_available"] == 1

    def test_nat_read_rate_limit_isolates_verified_jwt_wallets_and_blocks_header_spoof(self, tmp_path):
        # Set minimum floor (endpoint enforces max(60, read_rate_limit_per_min) -> 60/min)
        c = _DummyReadClient(cid=31337)
        s = _settings(tmp_path, read_rate_limit_per_min=60)
        app = svc.create_app(s, client=c)
        tc = TestClient(app)

        tok_seller, _ = _login_ops_jwt(tc, ANVIL_SELLER, chain_id=31337)
        tok_buyer, _ = _login_ops_jwt(tc, ANVIL_BUYER, chain_id=31337)

        # Spoofed unauthenticated X-Authenticated-Wallet must still hit shared IP bucket (cannot bypass IP quota!)
        for i in range(60):
            r = tc.get(
                "/listings",
                headers={"X-Authenticated-Wallet": f"0x{1000 + i:040x}"},
            )
            assert r.status_code == 200
        r_blocked = tc.get("/listings", headers={"X-Authenticated-Wallet": Account.from_key(ANVIL_STRANGER).address})
        assert r_blocked.status_code == 429
        assert r_blocked.json()["error_code"] == "RATE_LIMIT_EXCEEDED"

        # Authenticated NAT users sharing SAME proxy IP have independent per-wallet quotas!
        for _ in range(3):
            r_s = tc.get("/listings", headers={"Authorization": f"Bearer {tok_seller}"})
            r_b = tc.get("/listings", headers={"Authorization": f"Bearer {tok_buyer}"})
            assert r_s.status_code == 200
            assert r_b.status_code == 200


# ---------------------------------------------------------------------------
# 5. Live Anvil E2E: Keyless Public API + Isolated Worker + Real attest()
# ---------------------------------------------------------------------------

def _artifact(name: str):
    f = OUT / f"{name}.sol" / f"{name}.json"
    if not f.exists():
        pytest.skip(f"Missing {f} — run `forge build` in contracts/")
    d = json.loads(f.read_text(encoding="utf-8"))
    return d["abi"], d["bytecode"]["object"]


class TestPhase2AnvilE2E:
    def test_end_to_end_shared_auth_keyless_api_and_worker_real_attest(self, tmp_path):
        try:
            ec.pytesseract.get_tesseract_version()
        except Exception:
            pytest.skip("Tesseract not installed")

        tok_abi, tok_bin = _artifact("CollectibleToken")
        esc_abi, esc_bin = _artifact("Escrow")

        import socket
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        sock.close()

        proc = subprocess.Popen(
            ["anvil", "--port", str(port), "--silent"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        rpc = f"http://127.0.0.1:{port}"
        try:
            w3 = Web3(Web3.HTTPProvider(rpc))
            for _ in range(40):
                try:
                    if w3.is_connected():
                        break
                except Exception:
                    pass
                time.sleep(0.15)
            assert w3.is_connected(), "Anvil failed to start"

            accts = {
                name: w3.eth.account.from_key(k)
                for name, k in (
                    ("deployer", ANVIL_DEPLOYER),
                    ("agent", ANVIL_AGENT),
                    ("seller", ANVIL_SELLER),
                    ("buyer", ANVIL_BUYER),
                )
            }

            def send_tx(who: str, fn, value: int = 0):
                a = accts[who]
                tx = fn.build_transaction({
                    "from": a.address,
                    "value": value,
                    "nonce": w3.eth.get_transaction_count(a.address, "pending"),
                })
                raw = a.sign_transaction(tx).raw_transaction
                receipt = w3.eth.wait_for_transaction_receipt(w3.eth.send_raw_transaction(raw))
                assert receipt["status"] == 1
                return receipt

            tok_rcpt = send_tx("deployer", w3.eth.contract(abi=tok_abi, bytecode=tok_bin).constructor())
            token = w3.eth.contract(address=tok_rcpt["contractAddress"], abi=tok_abi)
            esc_rcpt = send_tx(
                "deployer",
                w3.eth.contract(abi=esc_abi, bytecode=esc_bin).constructor(
                    token.address, accts["agent"].address, 600, 600, 600
                ),
            )
            escrow = w3.eth.contract(address=esc_rcpt["contractAddress"], abi=esc_abi)
            send_tx("deployer", token.functions.setEscrow(escrow.address))

            val = Web3.to_wei(2, "ether")
            send_tx("seller", escrow.functions.createTrade(accts["buyer"].address, val))
            tid = escrow.functions.nextTradeId().call() - 1
            dep = escrow.functions.getTrade(tid).call()[3]
            send_tx("seller", escrow.functions.deposit(tid), value=dep)
            send_tx("buyer", escrow.functions.deposit(tid), value=dep)
            nonce_hex = Web3.to_hex(escrow.functions.getTrade(tid).call()[6])

            ev_http = _MockEvidenceHttpServer(tmp_path / "ipfs", nonce_hex)
            try:
                listing_uri = "ipfs://listing.jpg"
                seller_uri = "ipfs://seller.jpg"
                buyer_uri = "ipfs://buyer.jpg"
                send_tx("seller", escrow.functions.submitEvidence(tid, bytes.fromhex(evidence_hash_of(seller_uri)[2:])))
                send_tx("buyer", escrow.functions.submitEvidence(tid, bytes.fromhex(evidence_hash_of(buyer_uri)[2:])))

                shared_data = tmp_path / "shared_e2e"
                common = dict(
                    rpc_url=rpc,
                    escrow_address=escrow.address,
                    escrow_abi_path=OUT / "Escrow.sol" / "Escrow.json",
                    data_dir=shared_data,
                    ipfs_gateway=ev_http.gateway,
                    allow_local_hosts=True,
                    allowed_hosts=["127.0.0.1"],
                    chain_id=31337,
                    inspect_listing_images=False,
                    enable_shared_auth=True,
                    ops_jwt_secret=STRONG_JWT_SECRET,
                    attest_api_key=None,
                    require_proxy_signature=False,
                )
                api_app = svc.create_app(svc.Settings(**common, agent_private_key=None, agent_poll_seconds=5.0))
                assert api_app.state.runtime.has_signing_key() is False
                tc = TestClient(api_app)

                worker = AgentWorker(
                    svc.Settings(**common, agent_private_key=ANVIL_AGENT, agent_poll_seconds=2.0),
                    reconcile_interval_seconds=60.0,
                )
                wt = threading.Thread(target=worker.run_forever, daemon=True)
                wt.start()
                try:
                    for _ in range(50):
                        if api_app.state.runtime.is_external_worker_active()[0]:
                            break
                        time.sleep(0.05)
                    assert api_app.state.runtime.is_external_worker_active()[0] is True

                    tok_seller, _ = _login_ops_jwt(tc, ANVIL_SELLER, chain_id=31337)
                    tok_buyer, _ = _login_ops_jwt(tc, ANVIL_BUYER, chain_id=31337)

                    # Pin listing image via /pin relay (31337 mock CID check)
                    r_pin = tc.post(
                        "/pin",
                        files={"file": ("listing.jpg", (tmp_path / "ipfs" / "listing.jpg").read_bytes(), "image/jpeg")},
                        headers={"Authorization": f"Bearer {tok_seller}"},
                    )
                    assert r_pin.status_code == 200
                    assert r_pin.json()["mock"] is True

                    # Seller registers signed listing URI via Ops JWT
                    msg = listing_message(31337, escrow.address, tid, listing_uri)
                    sig = Account.sign_message(encode_defunct(text=msg), private_key=ANVIL_SELLER).signature.hex()
                    r_reg = tc.post(
                        f"/trade/{tid}/uris",
                        json={"role": "listing", "uri": listing_uri, "signature": sig},
                        headers={"Authorization": f"Bearer {tok_seller}"},
                    )
                    assert r_reg.status_code == 200

                    # Buyer manually triggers Verify on keyless Public API -> Worker executes real on-chain attest()
                    r_verify = tc.post(
                        "/verify-evidence",
                        json={
                            "trade_id": tid,
                            "listing_image_url": listing_uri,
                            "seller_evidence_url": seller_uri,
                            "buyer_evidence_url": buyer_uri,
                            "dry_run": False,
                            "include_visual": False,
                        },
                        headers={"Authorization": f"Bearer {tok_buyer}"},
                    )
                    assert r_verify.status_code == 200, r_verify.text
                    v = r_verify.json()
                    assert v["attested"] is True
                    assert v["report"]["risk_score"] < 40
                    assert v["report"]["flagged"] is False

                    # Verify real on-chain state
                    onchain = escrow.functions.getTrade(tid).call()
                    assert onchain[15] == int(TradeState.Attested)
                    assert Web3.to_hex(onchain[9]) == v["report_hash"]

                    r_rep = tc.get(f"/report/{tid}")
                    assert r_rep.status_code == 200
                    assert r_rep.json()["report_hash"] == v["report_hash"]
                finally:
                    worker.stop()
                    wt.join(timeout=5)
            finally:
                ev_http.close()
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
