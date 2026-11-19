"""
test_phase3_t4_ops_docker.py
----------------------------
Tests for P3-T4 (Shared Docker / Zero-Config Client & Ops Separation):
- TC-T4-BE-01: OPS_AUTH_ALLOWED_ORIGINS is strictly decoupled from CORS_ORIGINS
- TC-T4-BE-02: docker/init_secrets.py generates independent >= 32-char secrets with split mode & restricted perms
- TC-T4-BE-03: compose.shared.yaml & compose.ops.yaml maintain strict secret/key/DB boundaries
- TC-P4C1-01..05 (Phase 4 / Proposal P4-C1): Hosted UI Shared Auth + secret isolation, loopback port binding,
  Caddyfile template limits (64MB body, >= 150s timeouts, X-Forwarded-* overwrite)
"""

from __future__ import annotations

import os
import re
import stat
import subprocess
import sys
from pathlib import Path

import yaml
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

    def test_compose_shared_and_ops_security_boundaries(self):
        shared = yaml.safe_load((REPO_ROOT / "compose.shared.yaml").read_text(encoding="utf-8"))
        ops = yaml.safe_load((REPO_ROOT / "compose.ops.yaml").read_text(encoding="utf-8"))

        # Shared Client must contain ONLY frontend and zero Ops secrets or SQLite DB
        assert list(shared["services"].keys()) == ["frontend"]
        fe = shared["services"]["frontend"]
        fe_env = fe["environment"]
        assert fe["build"]["args"]["NEXT_PUBLIC_BACKEND_URL"] == "/_backend"
        assert fe_env["NEXT_PUBLIC_BACKEND_URL"] == "/_backend"
        assert fe_env["BFF_AUTH_MODE"] == "shared"
        for forbidden in ("PINATA_JWT", "AGENT_PRIVATE_KEY", "ATTEST_API_KEY", "OPS_JWT_SECRET", "BACKEND_URL"):
            assert forbidden not in fe_env
        assert list(shared["volumes"].keys()) == ["client_runtime_secrets"]

        # Ops Server: backend has shared auth + Pinata relay + NO AGENT_PRIVATE_KEY; worker holds AGENT_PRIVATE_KEY
        ops_be = ops["services"]["backend"]
        ops_be_env = ops_be["environment"]
        assert ops_be_env["ENABLE_SHARED_AUTH"] == "true"
        assert ops_be_env["AGENT_AUTO"] == "false"
        assert "AGENT_PRIVATE_KEY" not in ops_be_env
        assert ops_be_env["ALLOW_LOCAL_HOSTS"] == "${ALLOW_LOCAL_HOSTS:-false}"
        assert ops_be_env["ENFORCE_EVIDENCE_HASH"] == "${ENFORCE_EVIDENCE_HASH:-true}"

        ops_worker = ops["services"]["agent-worker"]
        assert "AGENT_PRIVATE_KEY" in ops_worker["environment"]

        ops_fe = ops["services"]["frontend"]
        assert "hosted-ui" in ops_fe.get("profiles", [])
        assert "OPS_JWT_SECRET" not in ops_fe["environment"]
        assert not any(v.startswith("ops_backend_secrets:") for v in ops_fe["volumes"])

    def test_p4_c1_hosted_ui_uses_shared_auth_without_ops_secrets(self):
        """TC-P4C1-01/02: Hosted UI chạy Shared Auth nội bộ, không giữ Ops secret, SESSION_SECRET riêng bền vững."""
        ops = yaml.safe_load((REPO_ROOT / "compose.ops.yaml").read_text(encoding="utf-8"))
        ops_fe = ops["services"]["frontend"]
        env = ops_fe["environment"]

        assert env["BFF_AUTH_MODE"] == "shared"
        assert env["SHARED_API_URL"] == "http://backend:8000"
        assert env["CLIENT_SECRETS_FILE"] == "/run/client-secrets/session.env"
        assert env["NEXT_PUBLIC_BACKEND_URL"] == "/_backend"
        assert env["TRADE_INDEX_ENABLED"] == "${TRADE_INDEX_ENABLED:-true}"
        for forbidden in (
            "ATTEST_API_KEY",
            "OPS_JWT_SECRET",
            "PINATA_JWT",
            "AGENT_PRIVATE_KEY",
            "WORKER_AGENT_PRIVATE_KEY",
            "BACKEND_URL",
            "REQUIRE_PROXY_SIGNATURE",
            "SESSION_SECRET",
        ):
            assert forbidden not in env, f"Hosted UI must not receive {forbidden}"

        assert ops_fe["volumes"] == ["ops_hosted_ui_secrets:/run/client-secrets"]
        assert "ops_hosted_ui_secrets" in ops["volumes"]
        # Hosted UI không còn phụ thuộc volume secrets do init-ops-secrets sinh ra
        assert "init-ops-secrets" not in ops_fe.get("depends_on", {})

        # init-ops-secrets giữ nguyên split mode (backward-compatible cho rollback), không mount volume Hosted UI
        init = ops["services"]["init-ops-secrets"]
        assert init["environment"]["OPS_SPLIT_SECRETS"] == "true"
        assert init["environment"]["FRONTEND_SECRETS_FILE"] == "/run/frontend-secrets/secrets.env"
        for svc_name in ("init-ops-secrets", "backend", "agent-worker"):
            vols = ops["services"][svc_name].get("volumes", [])
            assert not any(v.startswith("ops_hosted_ui_secrets:") for v in vols)

    def test_p4_c1_ops_ports_bind_loopback_by_default(self):
        """TC-P4C1-03: backend 8000 & Hosted UI 3000 chỉ publish trên 127.0.0.1 (chống Docker iptables bypass ufw)."""
        ops = yaml.safe_load((REPO_ROOT / "compose.ops.yaml").read_text(encoding="utf-8"))
        assert ops["services"]["backend"]["ports"] == ["${OPS_BIND_IP:-127.0.0.1}:${OPS_API_PORT:-8000}:8000"]
        assert ops["services"]["frontend"]["ports"] == [
            "${OPS_UI_BIND_IP:-127.0.0.1}:${OPS_UI_PORT:-3000}:3000"
        ]
        for svc_name in ("init-ops-secrets", "agent-worker"):
            assert "ports" not in ops["services"][svc_name]

    def test_p4_c1_caddyfile_template_enforces_proxy_limits(self):
        """TC-P4C1-05: Caddyfile mẫu ép 64MB body, timeout >= 150s và ghi đè X-Forwarded-* từ kết nối TCP thực."""
        caddy = (REPO_ROOT / "docker/Caddyfile.ops.example").read_text(encoding="utf-8")
        assert b"\r\n" not in (REPO_ROOT / "docker/Caddyfile.ops.example").read_bytes()

        def _site_block(host: str) -> str:
            m = re.search(r"(?ms)^" + re.escape(host) + r" \{\n(.*?)^\}", caddy)
            assert m, f"missing site block {host}"
            return m.group(1)

        for host, upstream in (("api.{$OPS_DOMAIN}", "127.0.0.1:8000"), ("app.{$OPS_DOMAIN}", "127.0.0.1:3000")):
            block = _site_block(host)
            assert f"reverse_proxy {upstream}" in block
            assert re.search(r"max_size\s+64MB", block)
            assert "header_up X-Forwarded-For {remote_host}" in block
            assert "header_up X-Forwarded-Proto {scheme}" in block
            assert "header_up X-Forwarded-Host {host}" in block
            assert "trusted_proxies" not in block
            for directive in ("read_timeout", "write_timeout"):
                m = re.search(directive + r"\s+(\d+)s", block)
                assert m and int(m.group(1)) >= 150, f"{host}: {directive} must be >= 150s"

    def test_shell_entrypoints_have_lf_line_endings_and_proper_secret_guards(self):
        for rel in ("docker/backend-entrypoint.sh", "docker/frontend-entrypoint.sh"):
            raw = (REPO_ROOT / rel).read_bytes()
            assert b"\r\n" not in raw, f"{rel} must use LF line endings"
        fe_sh = (REPO_ROOT / "docker/frontend-entrypoint.sh").read_text(encoding="utf-8")
        assert re.search(r"unset ATTEST_API_KEY OPS_JWT_SECRET PINATA_JWT AGENT_PRIVATE_KEY", fe_sh)
        be_sh = (REPO_ROOT / "docker/backend-entrypoint.sh").read_text(encoding="utf-8")
        assert 'load_secret_var "OPS_JWT_SECRET"' in be_sh
        assert "SESSION_SECRET" not in be_sh or "không bao giờ nạp SESSION_SECRET" in be_sh
