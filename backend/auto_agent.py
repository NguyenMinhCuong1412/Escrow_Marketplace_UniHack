"""
auto_agent.py
--------------
Agent tự động (DEC-005 phương án A): backend tự quan sát contract và tự chạy
AI verify + attest() khi một giao dịch đã đủ bằng chứng — không cần ai bấm nút.

Hai thành phần:

* UriRegistry — sổ đường dẫn ipfs:// của từng giao dịch. Chain chỉ lưu
  keccak256(uri), nên agent cần được báo URI thật. Tính đúng đắn của URI do
  attest_service kiểm tra trước khi ghi (bằng chứng: khớp hash on-chain;
  ảnh niêm yết: chữ ký ví của seller).
* AutoAgent — vòng lặp nền. Mỗi nhịp quét TRẠNG THÁI các giao dịch chưa kết
  thúc (không phụ thuộc event/log → không sót việc khi backend restart hay RPC
  công cộng rớt), giao dịch nào sẵn sàng thì gọi lõi xác thực dùng chung với
  endpoint thủ công.
"""

from __future__ import annotations

import json
import logging
import os
import socket
import threading
import time
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Callable, Optional

from eth_account import Account
from eth_account.messages import encode_defunct

from chain import EscrowClient, Trade, TradeState

if TYPE_CHECKING:
    from db import MarketplaceDB

log = logging.getLogger("attest.agent")

ROLES = ("listing", "seller", "buyer")
EMPTY_HASH = "0x" + "00" * 32


class UriConflict(Exception):
    """Đã có URI khác được đăng ký cho vai trò này."""


class UriRegistry:
    """{trade_id: {role: uri}} — ưu tiên SQLite WAL dùng chung, fallback JSON khi db=None. First-write-wins."""

    def __init__(self, path: Path, db: Optional["MarketplaceDB"] = None):
        self.path = path
        self._db = db
        self._lock = threading.Lock()
        self._items: dict[str, dict[str, str]] = {}
        if self._db is None and path.exists():
            try:
                self._items = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                log.warning("trade_uris.json hỏng, bắt đầu sổ rỗng")

    def get(self, trade_id: int) -> dict[str, str]:
        if self._db is not None:
            return self._db.get_trade_uris(trade_id)
        with self._lock:
            return dict(self._items.get(str(trade_id), {}))

    def set(self, trade_id: int, role: str, uri: str) -> None:
        if self._db is not None:
            ok, _ = self._db.set_trade_uri(trade_id, role, uri)
            if not ok:
                raise UriConflict(f"Trade {trade_id} đã có URI {role} khác")
            return
        with self._lock:
            row = self._items.setdefault(str(trade_id), {})
            if row.get(role) == uri:
                return
            if role in row:
                raise UriConflict(f"Trade {trade_id} đã có URI {role} khác")
            row[role] = uri
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self._items), encoding="utf-8")
            tmp.replace(self.path)


def listing_message(chain_id: int, escrow_address: str, trade_id: int, uri: str) -> str:
    """Thông điệp seller ký (EIP-191 personal_sign) để xác nhận ảnh niêm yết.
    Gắn chain + địa chỉ contract + trade id → chữ ký không dùng lại được ở nơi khác.
    Frontend (lib/backend.ts) phải dựng ĐÚNG chuỗi này."""
    return (
        "Escrow Marketplace - xac nhan anh niem yet\n"
        f"chain: {chain_id}\n"
        f"escrow: {escrow_address.lower()}\n"
        f"trade: {trade_id}\n"
        f"uri: {uri}"
    )


def recover_signer(message: str, signature: str) -> str:
    return Account.recover_message(encode_defunct(text=message), signature=signature)


class AutoAgent:
    MAX_ATTEMPTS = 5
    RETRY_DELAY = 15.0  # giây chờ trước lần thử lại đầu tiên, sau đó gấp đôi mỗi lần (15/30/60/120s)
    # Lỗi thường gặp là tạm thời (IPFS gateway 429, RPC rớt). Tổng thời gian thử lại ~4 phút,
    # nằm gọn trong ATTEST_WINDOW; hết lượt thì dừng và để người dùng chạy thủ công.

    def __init__(
        self,
        get_client: Callable[[], EscrowClient],
        registry: UriRegistry,
        verify: Callable[[int, dict[str, str]], object],
        poll_seconds: float = 5.0,
        reconcile: Optional[Callable[[], None]] = None,
        *,
        db: Optional["MarketplaceDB"] = None,
        worker_id: Optional[str] = None,
        use_leader_lease: bool = True,
        lease_name: str = "auto_agent_leader",
        lease_ttl_seconds: float = 60.0,
        reconcile_interval_seconds: float = 0.0,
        process_verify_jobs: Optional[Callable[[], None]] = None,
        sync_trade_index: Optional[Callable[[], None]] = None,
        clock: Callable[[], float] = time.time,
    ):
        self._get_client = get_client
        self._registry = registry
        self._verify = verify
        self._reconcile = reconcile
        self._process_verify_jobs = process_verify_jobs
        self._sync_trade_index = sync_trade_index
        self._db = db
        self._clock = clock
        self.worker_id = worker_id or f"{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:8]}"
        self._use_leader_lease = bool(use_leader_lease and db is not None)
        self._lease_name = lease_name
        self._lease_ttl_seconds = max(float(lease_ttl_seconds), 1.0)
        self._reconcile_interval_seconds = max(float(reconcile_interval_seconds), 0.0)
        self._last_reconcile_at: Optional[float] = None
        self.poll_seconds = poll_seconds
        self.status: dict[int, dict] = {}
        self.last_tick: Optional[float] = None
        self.last_error: Optional[str] = None
        self.last_reconcile_error: Optional[str] = None
        self.is_leader: bool = False
        self._tick_error_occurred: bool = False
        self._cursor = 1            # mọi trade id < cursor đều đã ở trạng thái kết thúc
        self._done: set[int] = set()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._tick_lock = threading.Lock()

    # -- vòng đời ---------------------------------------------------------

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="auto-agent", daemon=True)
        self._thread.start()
        log.info("Auto agent bật (worker_id=%s), quét mỗi %.1fs", self.worker_id, self.poll_seconds)

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
        self.release_leadership()

    def release_leadership(self) -> None:
        if self._db is not None:
            try:
                self._db.release_worker_lease(self._lease_name, self.worker_id)
            except Exception:
                pass
            try:
                self._db.mark_agent_runtime_stopped(self.worker_id, heartbeat_at=self._clock())
            except Exception:
                pass
        self.is_leader = False

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def _collect_client_telemetry(self, c: Optional[EscrowClient]) -> dict:
        out: dict = {}
        if c is None:
            return out
        addr = getattr(c, "agent_address", None)
        if addr:
            out["agent_address"] = str(addr)
        try:
            if hasattr(c, "agent_balance") and callable(c.agent_balance) and addr:
                out["agent_balance_wei"] = str(c.agent_balance())
        except Exception:
            pass
        try:
            if hasattr(c, "onchain_agent") and callable(c.onchain_agent) and addr:
                out["agent_matches_contract"] = str(c.onchain_agent()).lower() == str(addr).lower()
        except Exception:
            pass
        return out

    def _persist_runtime(self, *, running: bool, client: Optional[EscrowClient] = None) -> None:
        if self._db is None:
            return
        telemetry = self._collect_client_telemetry(client)
        try:
            self._db.update_agent_runtime_meta(
                self.worker_id,
                running=running,
                last_tick=self.last_tick,
                last_error=self.last_error,
                last_reconcile_error=self.last_reconcile_error,
                agent_address=telemetry.get("agent_address"),
                agent_balance_wei=telemetry.get("agent_balance_wei"),
                agent_matches_contract=telemetry.get("agent_matches_contract"),
                heartbeat_at=self._clock(),
            )
        except Exception as exc:
            log.warning("Không cập nhật được agent_runtime_meta: %s", exc)

    def _run(self) -> None:
        try:
            while not self._stop.is_set():
                try:
                    self.tick(hold_lease=True)
                except Exception as e:  # RPC rớt, thiếu cấu hình... → thử lại nhịp sau
                    self.last_error = str(getattr(e, "detail", e))
                    log.warning("auto agent tick lỗi: %s", self.last_error)
                self._stop.wait(self.poll_seconds)
        finally:
            self.release_leadership()

    # -- một nhịp quét ----------------------------------------------------

    def tick(self, *, hold_lease: bool = False) -> bool:
        with self._tick_lock:
            now = self._clock()
            if self._use_leader_lease and self._db is not None:
                acquired = self._db.acquire_worker_lease(
                    self._lease_name, self.worker_id, self._lease_ttl_seconds, now=now
                )
                if not acquired:
                    if self.is_leader:
                        log.info("worker %s nhường leader lease %s cho worker khác", self.worker_id, self._lease_name)
                    self.is_leader = False
                    return False
                if not self.is_leader:
                    log.info("worker %s đang giữ leader lease %s", self.worker_id, self._lease_name)
                self.is_leader = True

            self._tick_error_occurred = False
            active_client: Optional[EscrowClient] = None
            try:
                # 1. Đối soát marketplace chỉ đọc (TTL + đồng bộ trạng thái DB), tách biệt hoàn toàn khỏi AI attest.
                should_reconcile = self._reconcile is not None and (
                    self._last_reconcile_at is None
                    or (self._clock() - self._last_reconcile_at) >= self._reconcile_interval_seconds
                )
                if should_reconcile and self._reconcile is not None:
                    try:
                        self._reconcile()
                        self.last_reconcile_error = None
                        self._last_reconcile_at = self._clock()
                    except Exception as e:
                        self.last_reconcile_error = str(getattr(e, "detail", e))
                        log.warning("marketplace reconcile lỗi: %s", self.last_reconcile_error)

                # 1b. Xử lý các manual verify job do API công khai ủy thác (DEC-025) trước vòng quét chung.
                if self._process_verify_jobs is not None:
                    try:
                        self._process_verify_jobs()
                    except Exception as e:
                        log.warning("process_verify_jobs lỗi: %s", getattr(e, "detail", e))

                # 2. Quét AI attest tự động như hiện hữu.
                c = self._get_client()
                active_client = c
                next_id = c.next_trade_id()
                for tid in range(self._cursor, next_id):
                    if tid in self._done:
                        continue
                    if self._use_leader_lease and self._db is not None:
                        if not self._db.acquire_worker_lease(
                            self._lease_name, self.worker_id, self._lease_ttl_seconds, now=self._clock()
                        ):
                            self.is_leader = False
                            return False
                    self._process(c, tid)
                while self._cursor in self._done:
                    self._done.discard(self._cursor)
                    self._cursor += 1
                # 3. Đồng bộ Trade Index có giới hạn thời gian/chunk sau khi Verify & Attest hoàn tất.
                if self._sync_trade_index is not None:
                    if self._use_leader_lease and self._db is not None:
                        if not self._db.acquire_worker_lease(
                            self._lease_name, self.worker_id, self._lease_ttl_seconds, now=self._clock()
                        ):
                            self.is_leader = False
                            return False
                    try:
                        self._sync_trade_index()
                    except Exception as e:
                        log.warning(
                            "trade_indexer sync lỗi (không chặn attest): %s",
                            getattr(e, "detail", e),
                        )
                self.last_tick = self._clock()
                if not self._tick_error_occurred:
                    self.last_error = None
                self._persist_runtime(running=bool(self.running or hold_lease), client=active_client)
                return True
            except Exception as e:
                self.last_error = str(getattr(e, "detail", e))
                self._persist_runtime(running=bool(self.running or hold_lease), client=active_client)
                raise
            finally:
                if self._use_leader_lease and self._db is not None and not hold_lease and not self.running:
                    self._db.release_worker_lease(self._lease_name, self.worker_id)
                    self.is_leader = False

    def run_pending_verify_jobs(self, *, hold_lease: bool = True) -> bool:
        """Xử lý nhanh các manual verify job trong hàng đợi SQLite dưới leader lease."""
        if self._process_verify_jobs is None:
            return False
        with self._tick_lock:
            now = self._clock()
            if self._use_leader_lease and self._db is not None:
                acquired = self._db.acquire_worker_lease(
                    self._lease_name, self.worker_id, self._lease_ttl_seconds, now=now
                )
                if not acquired:
                    self.is_leader = False
                    return False
                self.is_leader = True
            try:
                self._process_verify_jobs()
                return True
            finally:
                if self._use_leader_lease and self._db is not None and not hold_lease and not self.running:
                    self._db.release_worker_lease(self._lease_name, self.worker_id)
                    self.is_leader = False

    def _get_status(self, tid: int) -> Optional[dict]:
        if self._db is not None:
            st = self._db.get_agent_job_status(tid)
            if st is not None:
                self.status[tid] = st
            return st
        return self.status.get(tid)

    def _set(self, tid: int, phase: str, detail: str = "", attempts: Optional[int] = None) -> None:
        prev = self._get_status(tid) or {}
        eff_attempts = prev.get("attempts", 0) if attempts is None else attempts
        ts = int(self._clock())
        entry = {
            "phase": phase,
            "detail": detail,
            "attempts": eff_attempts,
            "updated_at": ts,
        }
        self.status[tid] = entry
        if self._db is not None:
            self._db.upsert_agent_job_status(tid, phase, detail, eff_attempts, updated_at=ts)

    def _process(self, c: EscrowClient, tid: int) -> None:
        t = c.get_trade(tid)
        if t.state in (TradeState.Attested, TradeState.Disputed, TradeState.Resolved, TradeState.Cancelled):
            self._done.add(tid)  # trạng thái kết thúc đối với agent, không bao giờ quay lại
            return
        if t.state != TradeState.AwaitingEvidence:
            return
        if EMPTY_HASH in (t.seller_evidence_hash, t.buyer_evidence_hash):
            return
        uris = self._registry.get(tid)
        if any(r not in uris for r in ROLES):
            return  # chờ frontend đăng ký URI; trạng thái "waiting_uris" suy ra ở status_for()

        st = self._get_status(tid) or {}
        attempts = st.get("attempts", 0)
        if attempts >= self.MAX_ATTEMPTS:
            return
        backoff = self.RETRY_DELAY * 2 ** max(attempts - 1, 0)
        if st.get("phase") == "retrying" and self._clock() - st.get("updated_at", 0) < backoff:
            return

        self._set(tid, "analyzing")
        log.info("auto agent: trade %s đủ bằng chứng → chạy xác thực (lần %s)", tid, attempts + 1)
        try:
            self._verify(tid, uris)
        except Exception as e:
            code = getattr(e, "status_code", None)
            detail = str(getattr(e, "detail", e))
            if getattr(e, "error_code", None) == "INSECURE_CONFIG":
                reasons = getattr(e, "reasons", None)
                self.last_error = f"INSECURE_CONFIG: {', '.join(reasons)}" if reasons else detail
                self._tick_error_occurred = True
            if code == 409:  # đang được xử lý ở nơi khác / đã đổi trạng thái → nhịp sau tự phân loại lại
                self._set(tid, "queued", detail)
                return
            attempts += 1
            final = attempts >= self.MAX_ATTEMPTS
            self._set(tid, "failed" if final else "retrying", detail, attempts)
            log.warning("auto agent: trade %s lỗi (lần %s/%s): %s", tid, attempts, self.MAX_ATTEMPTS, detail)
            return
        self._set(tid, "attested", attempts=attempts + 1)
        self._done.add(tid)

    # -- trạng thái cho frontend ------------------------------------------

    def status_for(self, t: Trade) -> dict:
        uris = self._registry.get(t.trade_id)
        missing = [r for r in ROLES if r not in uris]
        out = {"trade_id": t.trade_id, "trade_state": t.state.name, "missing_uris": missing,
               "detail": "", "attempts": 0, "max_attempts": self.MAX_ATTEMPTS, "updated_at": None}
        if t.state == TradeState.Created:
            out["phase"] = "waiting_deposit"
        elif t.state == TradeState.Cancelled:
            out["phase"] = "cancelled"
        elif t.state != TradeState.AwaitingEvidence:
            out["phase"] = "attested"
        elif EMPTY_HASH in (t.seller_evidence_hash, t.buyer_evidence_hash):
            out["phase"] = "waiting_evidence"
        elif missing:
            out["phase"] = "waiting_uris"
        else:
            st = self._get_status(t.trade_id)
            out["phase"] = "queued"
            if st:
                out.update(st)
        return out
