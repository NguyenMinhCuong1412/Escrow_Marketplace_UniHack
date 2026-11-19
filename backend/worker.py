"""
worker.py
---------
Tiến trình worker độc lập cho Escrow Marketplace (Phase 1 / DEC-026):
- Chạy định kỳ `marketplace.reconcile()` (giải phóng reservation TTL có kiểm tra on-chain
  và đồng bộ trạng thái listing_trades) và `AutoAgent.tick()` (quét trade đủ bằng chứng,
  chạy AI pipeline và ký `attest()`).
- Cô lập `AGENT_PRIVATE_KEY` khỏi tiến trình Public API (`attest_service.py`).
- Chia sẻ chung SQLite WAL (`DATA_DIR/marketplace.db`) với API và dùng leader lease
  (`worker_leases`) + khóa giao dịch (`trade_processing_locks`) để bảo đảm tại một thời
  điểm chỉ có duy nhất một worker thực hiện `attest()`.

Chạy:
  cd backend && python worker.py
  cd backend && python worker.py --once
"""

from __future__ import annotations

import argparse
import logging
import os
import signal
import sys
import threading
from pathlib import Path
from typing import Optional

from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from attest_service import BackendRuntime, InsecureConfigError, Settings  # noqa: E402
from chain import EscrowClient  # noqa: E402

log = logging.getLogger("attest.worker")

DEFAULT_WORKER_RECONCILE_SECONDS = 10.0


class AgentWorker:
    """Standalone runner cho AutoAgent + Marketplace Reconcile trên SQLite WAL dùng chung."""

    def __init__(
        self,
        settings: Optional[Settings] = None,
        client: Optional[EscrowClient] = None,
        *,
        reconcile_interval_seconds: Optional[float] = None,
    ):
        self.settings = settings or Settings.from_env()
        if reconcile_interval_seconds is not None:
            eff_reconcile = float(reconcile_interval_seconds)
        elif self.settings.reconcile_poll_seconds > 0:
            eff_reconcile = float(self.settings.reconcile_poll_seconds)
        else:
            eff_reconcile = DEFAULT_WORKER_RECONCILE_SECONDS

        self.runtime = BackendRuntime(
            settings=self.settings,
            client=client,
            reconcile_interval_seconds=eff_reconcile,
        )
        self._stop = threading.Event()

    def validate_startup_config(self) -> None:
        """Kiểm tra cấu hình tối thiểu của worker mà không bao giờ in giá trị bí mật."""
        if self.runtime.state["client"] is not None:
            return
        missing = [
            name
            for name, val in (
                ("RPC_URL", self.settings.rpc_url),
                ("AGENT_PRIVATE_KEY", self.settings.agent_private_key),
            )
            if not val or not str(val).strip()
        ]
        if missing:
            raise RuntimeError(
                f"Worker thiếu cấu hình bắt buộc: {', '.join(missing)} (xem backend/.env.example)"
            )

    def run_once(self, *, hold_lease: bool = False) -> bool:
        """Chạy đúng một nhịp reconcile + AutoAgent tick. Trả True nếu giữ leader lease và đã chạy."""
        self.validate_startup_config()
        return self.runtime.agent.tick(hold_lease=hold_lease)

    def run_forever(self) -> None:
        """Vòng lặp chính của worker độc lập với leader lease và dừng êm khi nhận SIGINT/SIGTERM."""
        self.validate_startup_config()
        log.info(
            "Agent worker khởi động (worker_id=%s, poll=%.1fs, lease_ttl=%.1fs, data_dir=%s)",
            self.runtime.agent.worker_id,
            self.settings.agent_poll_seconds,
            self.settings.worker_lease_ttl_seconds,
            self.settings.data_dir,
        )
        try:
            while not self._stop.is_set():
                try:
                    self.runtime.agent.tick(hold_lease=True)
                except InsecureConfigError as exc:
                    log.error("Worker bị chặn fail-closed (INSECURE_CONFIG): %s", ", ".join(exc.reasons))
                except HTTPException as exc:
                    log.warning("Worker tick lỗi cấu hình/RPC (%s): %s", exc.status_code, exc.detail)
                except Exception as exc:
                    log.warning("Worker tick lỗi: %s", exc)
                self._stop.wait(self.settings.agent_poll_seconds)
        finally:
            self.stop()
            log.info("Agent worker đã dừng (worker_id=%s)", self.runtime.agent.worker_id)

    def stop(self) -> None:
        self._stop.set()
        self.runtime.agent.stop()


def main(argv: Optional[list[str]] = None) -> int:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    parser = argparse.ArgumentParser(description="Escrow Marketplace standalone AI Agent & Reconcile Worker")
    parser.add_argument("--once", action="store_true", help="Chạy 1 nhịp reconcile + AutoAgent rồi thoát")
    args = parser.parse_args(argv)

    worker = AgentWorker()

    def _handle_signal(signum, _frame):
        log.info("Nhận tín hiệu dừng (%s), đang giải phóng leader lease...", signum)
        worker.stop()

    signal.signal(signal.SIGINT, _handle_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _handle_signal)

    try:
        if args.once:
            worker.run_once(hold_lease=False)
        else:
            worker.run_forever()
    except RuntimeError as exc:
        log.error("%s", exc)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
