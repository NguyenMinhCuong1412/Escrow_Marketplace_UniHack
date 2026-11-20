"""
test_phase3_t4_ops_docker.py
----------------------------
Tests for P3-T4 (Shared Docker / Zero-Config Client & Ops Separation):
- TC-T4-BE-01: OPS_AUTH_ALLOWED_ORIGINS is strictly decoupled from CORS_ORIGINS
- TC-T4-BE-02: docker/init_secrets.py generates independent >= 32-char secrets with split mode & restricted perms
- Docker entrypoints use LF line endings and keep secret guards
(FINAL-MINIMAL-003: 4 tests for compose.shared.yaml / compose.ops.yaml / Caddyfile.ops.example were removed
 together with those files; see docs/test-evidence/FINAL-MINIMAL-003-QA-REPORT.md)
"""

from __future__ import annotations

import os
import re
import stat
import subprocess
import sys
from pathlib import Path

from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import attest_service as svc  # noqa: E402

ANVIL_SELLER = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
STRONG_JWT_SECRET = "p3t4-ops-jwt-secret-distinct-at-least-32-chars!"
STRONG_ATTEST_KEY = "p3t4-attest-api-key-distinct-at-least-32-chars!"


class _DummyReadClient:
    def __init__(self, cid: int = 43113, escrow_addr: str = "0x19D053c84941411888f5b9e40c854365fdd4eb00"):
        self._cid = cid
        self.escrow = type("Escrow", (), {"address": escrow_addr})()

    def chain_id(self) -> int:
        return self._cid

    def next_trade_id(self) -> int:
        return 1


def _make_settings(
    tmp_path: Path,
    *,
    cors_origins: list[str],
    ops_auth_allowed_origins: list[str],
) -> svc.Settings:
    return svc.Settings(
        rpc_url=None,
        agent_private_key=None,
        escrow_address="0x19D053c84941411888f5b9e40c854365fdd4eb00",
        ipfs_gateway="https://gateway.pinata.cloud/ipfs/",
        allowed_hosts=[],
        allow_local_hosts=False,
        attest_api_key=STRONG_ATTEST_KEY,
        enforce_evidence_hash=True,
        require_proxy_signature=True,
        cors_origins=cors_origins,
        enable_shared_auth=True,
        ops_jwt_secret=STRONG_JWT_SECRET,
        ops_auth_allowed_origins=ops_auth_allowed_origins,
        data_dir=tmp_path / "data",
        agent_auto=False,
    )


class TestPhase3T4OpsDocker:
    def test_ops_auth_allowed_origins_not_coupled_to_cors_origins(self, tmp_path):
        client = _DummyReadClient(cid=43113)
        # Case A: Hosted CORS_ORIGINS configured, OPS_AUTH_ALLOWED_ORIGINS empty -> Docker Client localhost allowed
        settings_open_clients = _make_settings(
            tmp_path / "open",
            cors_origins=["https://hosted-ops.example.com"],
            ops_auth_allowed_origins=[],
        )
        tc = TestClient(svc.create_app(settings_open_clients, client=client))
        acct = Account.from_key(ANVIL_SELLER)

        ch_res = tc.post(
            "/auth/challenge",
            json={"address": acct.address, "chain_id": 43113},
            headers={"Origin": "http://localhost:3001"},
        )
        assert ch_res.status_code == 200, ch_res.text
        ch = ch_res.json()
        sig = Account.sign_message(encode_defunct(text=ch["message"]), private_key=ANVIL_SELLER).signature.hex()

        vr_res = tc.post(
            "/auth/verify",
            json={
                "address": acct.address,
                "chain_id": 43113,
                "nonce": ch["nonce"],
                "signature": sig,
                "challenge_token": ch["challenge_token"],
            },
            headers={"Origin": "http://localhost:3001"},
        )
        assert vr_res.status_code == 200, vr_res.text
        ops_token = vr_res.json()["ops_token"]

        sess_res = tc.get("/auth/session", headers={"Authorization": f"Bearer {ops_token}"})
        assert sess_res.status_code == 200
        assert sess_res.json()["authenticated"] is True

        # Replay of same challenge nonce must still be rejected
        replay = tc.post(
            "/auth/verify",
            json={
                "address": acct.address,
                "chain_id": 43113,
                "nonce": ch["nonce"],
                "signature": sig,
                "challenge_token": ch["challenge_token"],
            },
            headers={"Origin": "http://localhost:3001"},
        )
        assert replay.status_code == 401
        assert replay.json()["error_code"] == "CHALLENGE_REPLAYED"

        # Case B: OPS_AUTH_ALLOWED_ORIGINS set -> enforces only that list, ignoring CORS_ORIGINS
        settings_strict = _make_settings(
            tmp_path / "strict",
            cors_origins=["https://hosted-cors.example.com"],
            ops_auth_allowed_origins=["https://approved-client.example.com"],
        )
        tc_strict = TestClient(svc.create_app(settings_strict, client=client))

        denied = tc_strict.post(
            "/auth/challenge",
            json={"address": acct.address, "chain_id": 43113},
            headers={"Origin": "https://hosted-cors.example.com"},
        )
        assert denied.status_code == 403
        assert denied.json()["error_code"] == "ORIGIN_NOT_ALLOWED"

        allowed = tc_strict.post(
            "/auth/challenge",
            json={"address": acct.address, "chain_id": 43113},
            headers={"Origin": "https://approved-client.example.com"},
        )
        assert allowed.status_code == 200

    def test_init_secrets_split_mode_and_distinctness(self, tmp_path):
        script = REPO_ROOT / "docker" / "init_secrets.py"
        backend_env = tmp_path / "ops_be" / "secrets.env"
        frontend_env = tmp_path / "ops_fe" / "secrets.env"

        env = os.environ.copy()
        for k in ("SESSION_SECRET", "ATTEST_API_KEY", "OPS_JWT_SECRET"):
            env.pop(k, None)
        env.update(
            {
                "SECRETS_FILE": str(backend_env),
                "FRONTEND_SECRETS_FILE": str(frontend_env),
                "OPS_SPLIT_SECRETS": "true",
                "INIT_OPS_JWT_SECRET": "true",
            }
        )
        res = subprocess.run([sys.executable, str(script)], env=env, capture_output=True, text=True, check=True)
        assert "distinct=True" in res.stdout

        be_map = dict(
            line.split("=", 1) for line in backend_env.read_text(encoding="utf-8").splitlines() if "=" in line
        )
        fe_map = dict(
            line.split("=", 1) for line in frontend_env.read_text(encoding="utf-8").splitlines() if "=" in line
        )

        # Boundary checks: backend file must not contain SESSION_SECRET; frontend file must not contain OPS_JWT_SECRET
        assert "SESSION_SECRET" not in be_map
        assert "OPS_JWT_SECRET" not in fe_map
        assert set(be_map.keys()) == {"ATTEST_API_KEY", "OPS_JWT_SECRET"}
        assert set(fe_map.keys()) == {"SESSION_SECRET", "ATTEST_API_KEY"}

        # All 3 secrets must be >= 32 chars and pairwise distinct
        s_val = fe_map["SESSION_SECRET"]
        a_val = be_map["ATTEST_API_KEY"]
        o_val = be_map["OPS_JWT_SECRET"]
        assert min(len(s_val), len(a_val), len(o_val)) >= 32
        assert len({s_val, a_val, o_val}) == 3
        assert a_val == fe_map["ATTEST_API_KEY"]

        # Re-running reuses existing values stably
        subprocess.run([sys.executable, str(script)], env=env, capture_output=True, text=True, check=True)
        assert backend_env.read_text(encoding="utf-8") == (
            f"ATTEST_API_KEY={a_val}\nOPS_JWT_SECRET={o_val}\n"
        )
        if os.name != "nt":
            assert stat.S_IMODE(backend_env.stat().st_mode) == 0o600
            assert stat.S_IMODE(frontend_env.stat().st_mode) == 0o600

    def test_shell_entrypoints_have_lf_line_endings_and_proper_secret_guards(self):
        for rel in ("docker/backend-entrypoint.sh", "docker/frontend-entrypoint.sh"):
            raw = (REPO_ROOT / rel).read_bytes()
            assert b"\r\n" not in raw, f"{rel} must use LF line endings"
        fe_sh = (REPO_ROOT / "docker/frontend-entrypoint.sh").read_text(encoding="utf-8")
        assert re.search(r"unset ATTEST_API_KEY OPS_JWT_SECRET PINATA_JWT AGENT_PRIVATE_KEY", fe_sh)
        be_sh = (REPO_ROOT / "docker/backend-entrypoint.sh").read_text(encoding="utf-8")
        assert 'load_secret_var "OPS_JWT_SECRET"' in be_sh
        assert "SESSION_SECRET" not in be_sh or "không bao giờ nạp SESSION_SECRET" in be_sh
