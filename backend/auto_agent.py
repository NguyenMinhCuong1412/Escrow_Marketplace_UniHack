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
import threading
import time
from pathlib import Path
from typing import Callable, Optional

from eth_account import Account
from eth_account.messages import encode_defunct

from chain import EscrowClient, Trade, TradeState

log = logging.getLogger("attest.agent")

ROLES = ("listing", "seller", "buyer")
EMPTY_HASH = "0x" + "00" * 32


class UriConflict(Exception):
    """Đã có URI khác được đăng ký cho vai trò này."""


class UriRegistry:
    """{trade_id: {role: uri}} lưu file JSON để sống qua restart. First-write-wins."""

    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()
        self._items: dict[str, dict[str, str]] = {}
        if path.exists():
            try:
                self._items = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                log.warning("trade_uris.json hỏng, bắt đầu sổ rỗng")

    def get(self, trade_id: int) -> dict[str, str]:
        with self._lock:
            return dict(self._items.get(str(trade_id), {}))

    def set(self, trade_id: int, role: str, uri: str) -> None:
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
        "TrustPact Escrow - xac nhan anh niem yet\n"
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

    def __init__(self, get_client: Callable[[], EscrowClient], registry: UriRegistry,
                 verify: Callable[[int, dict[str, str]], object], poll_seconds: float = 5.0):
        self._get_client = get_client
        self._registry = registry
        self._verify = verify
        self.poll_seconds = poll_seconds
        self.status: dict[int, dict] = {}
        self.last_tick: Optional[float] = None
        self.last_error: Optional[str] = None
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
        log.info("Auto agent bật, quét mỗi %.1fs", self.poll_seconds)

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self.tick()
                self.last_error = None
            except Exception as e:  # RPC rớt, thiếu cấu hình... → thử lại nhịp sau
                self.last_error = str(getattr(e, "detail", e))
                log.warning("auto agent tick lỗi: %s", self.last_error)
            self._stop.wait(self.poll_seconds)

    # -- một nhịp quét ----------------------------------------------------

    def tick(self) -> None:
        with self._tick_lock:
            c = self._get_client()
            next_id = c.next_trade_id()
            for tid in range(self._cursor, next_id):
                if tid in self._done:
                    continue
                self._process(c, tid)
            while self._cursor in self._done:
                self._done.discard(self._cursor)
                self._cursor += 1
            self.last_tick = time.time()

    def _set(self, tid: int, phase: str, detail: str = "", attempts: Optional[int] = None) -> None:
        prev = self.status.get(tid, {})
        self.status[tid] = {
            "phase": phase, "detail": detail,
            "attempts": prev.get("attempts", 0) if attempts is None else attempts,
            "updated_at": int(time.time()),
        }

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

        st = self.status.get(tid, {})
        attempts = st.get("attempts", 0)
        if attempts >= self.MAX_ATTEMPTS:
            return
        backoff = self.RETRY_DELAY * 2 ** max(attempts - 1, 0)
        if st.get("phase") == "retrying" and time.time() - st.get("updated_at", 0) < backoff:
            return

        self._set(tid, "analyzing")
        log.info("auto agent: trade %s đủ bằng chứng → chạy xác thực (lần %s)", tid, attempts + 1)
        try:
            self._verify(tid, uris)
        except Exception as e:
            code = getattr(e, "status_code", None)
            detail = str(getattr(e, "detail", e))
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
            st = self.status.get(t.trade_id)
            out["phase"] = "queued"
            if st:
                out.update(st)
        return out
