import functools
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(ROOT / "ai-pipeline"))
sys.path.insert(0, str(ROOT / "ai-pipeline" / "tests"))

# Không để .env thật của dev lọt vào test
for k in ("RPC_URL", "AGENT_PRIVATE_KEY", "ESCROW_ADDRESS", "ALLOWED_HOSTS", "ATTEST_API_KEY", "ALLOW_LOCAL_HOSTS", "CORS_ORIGINS"):
    os.environ.pop(k, None)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class _QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class _QuietServer(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        pass  # client chủ động ngắt (test giới hạn dung lượng) → không in traceback


@pytest.fixture(scope="session")
def file_server(tmp_path_factory):
    """HTTP server tĩnh giả lập IPFS gateway. Trả (thư mục gốc, base_url)."""
    root = tmp_path_factory.mktemp("served")
    port = free_port()
    handler = functools.partial(_QuietHandler, directory=str(root))
    srv = _QuietServer(("127.0.0.1", port), handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield root, f"http://127.0.0.1:{port}"
    srv.shutdown()


def _find_bin(name: str):
    p = shutil.which(name)
    if p:
        return p
    cand = Path.home() / ".foundry" / "bin" / (name + (".exe" if os.name == "nt" else ""))
    return str(cand) if cand.exists() else None


@pytest.fixture
def settings(tmp_path):
    """Fixture Settings cho unit/integration test với host và api key phù hợp."""
    import attest_service as svc
    return svc.Settings(
        data_dir=tmp_path / "data",
        attest_api_key="test-api-key",
        allowed_hosts=["127.0.0.1", "gateway.pinata.cloud"],
        allow_local_hosts=True,
        cors_origins=["http://localhost:3000"],
    )


@pytest.fixture(scope="session")
def anvil():
    """Anvil riêng trên cổng ngẫu nhiên cho integration test."""
    exe = _find_bin("anvil")
    if not exe:
        pytest.skip("anvil chưa cài (Foundry)")
    port = free_port()
    proc = subprocess.Popen([exe, "--port", str(port), "--silent"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"http://127.0.0.1:{port}"
    from web3 import Web3
    w3 = Web3(Web3.HTTPProvider(url))
    for _ in range(100):
        try:
            if w3.is_connected():
                break
        except Exception:
            pass
        time.sleep(0.1)
    else:
        proc.kill()
        pytest.fail("anvil không khởi động được")
    yield url
    proc.terminate()
    proc.wait(timeout=10)
