"""
db.py
-----
SQLite (WAL mode) persistence layer for Escrow Marketplace (`DATA_DIR/marketplace.db`).
Dùng stdlib sqlite3 với kết nối ngắn hạn theo transaction (mở/đóng tường minh để
an toàn trên Windows và nhiều thread), `BEGIN IMMEDIATE` chống race-condition / oversell.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

log = logging.getLogger("attest.db")

VALID_URI_ROLES = ("listing", "seller", "buyer")

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    chain_id INTEGER NOT NULL,
    escrow_address TEXT NOT NULL,
    seller_wallet TEXT NOT NULL,
    sku TEXT NOT NULL,
    sku_norm TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('LEGO', 'MODEL_KIT', 'FIGURE', 'TRADING_CARD', 'COIN', 'OTHER')),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_wei TEXT NOT NULL,
    condition TEXT NOT NULL CHECK (condition IN ('SEALED_NEW', 'LIKE_NEW', 'USED_GOOD', 'USED_FAIR', 'GRADED')),
    quantity_total INTEGER NOT NULL CHECK (quantity_total >= 1),
    quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
    quantity_sold INTEGER NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
    primary_image_uri TEXT NOT NULL,
    primary_image_sha256 TEXT NOT NULL DEFAULT '',
    primary_image_phash TEXT NOT NULL DEFAULT '',
    image_review_required INTEGER NOT NULL DEFAULT 0 CHECK (image_review_required IN (0, 1)),
    image_warnings_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'RESERVED', 'SOLD', 'PAUSED', 'CANCELLED')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK (quantity_reserved + quantity_sold <= quantity_total)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_seller_sku
ON listings (chain_id, escrow_address, seller_wallet, sku_norm)
WHERE status IN ('ACTIVE', 'RESERVED', 'PAUSED');

CREATE INDEX IF NOT EXISTS idx_listings_browse
ON listings (chain_id, escrow_address, status, category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listings_seller
ON listings (chain_id, escrow_address, seller_wallet, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listings_sha256
ON listings (chain_id, escrow_address, primary_image_sha256);

CREATE TABLE IF NOT EXISTS listing_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    cid TEXT NOT NULL,
    uri TEXT NOT NULL,
    sha256 TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_listing_one_primary
ON listing_images (listing_id)
WHERE is_primary = 1;

CREATE INDEX IF NOT EXISTS idx_listing_images_listing
ON listing_images (listing_id, sort_order ASC, id ASC);

CREATE TABLE IF NOT EXISTS purchase_requests (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL REFERENCES listings(id),
    chain_id INTEGER NOT NULL,
    escrow_address TEXT NOT NULL,
    seller_wallet TEXT NOT NULL,
    buyer_wallet TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    unit_price_wei TEXT NOT NULL,
    total_value_wei TEXT NOT NULL,
    buyer_note TEXT NOT NULL DEFAULT '',
    seller_note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN (
        'PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED',
        'EXPIRED', 'ESCROW_CREATED', 'COMPLETED', 'TRADE_CANCELLED'
    )),
    reservation_expires_at INTEGER,
    min_onchain_trade_id INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_listing
ON purchase_requests (listing_id, status);

CREATE INDEX IF NOT EXISTS idx_requests_buyer
ON purchase_requests (chain_id, escrow_address, buyer_wallet, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_requests_seller
ON purchase_requests (chain_id, escrow_address, seller_wallet, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_requests_expiry
ON purchase_requests (status, reservation_expires_at)
WHERE status = 'ACCEPTED';

CREATE TABLE IF NOT EXISTS listing_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id INTEGER NOT NULL,
    escrow_address TEXT NOT NULL,
    trade_id INTEGER NOT NULL,
    listing_id TEXT NOT NULL REFERENCES listings(id),
    request_id TEXT NOT NULL UNIQUE REFERENCES purchase_requests(id),
    tx_hash TEXT NOT NULL,
    synced_state TEXT NOT NULL,
    flagged INTEGER NOT NULL DEFAULT 0,
    last_synced_at INTEGER NOT NULL,
    UNIQUE (chain_id, escrow_address, trade_id),
    UNIQUE (chain_id, escrow_address, tx_hash)
);

CREATE INDEX IF NOT EXISTS idx_listing_trades_open
ON listing_trades (chain_id, escrow_address, synced_state);

CREATE TABLE IF NOT EXISTS used_proxy_nonces (
    nonce TEXT PRIMARY KEY,
    actor_wallet TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proxy_nonces_expires
ON used_proxy_nonces (expires_at);

CREATE TABLE IF NOT EXISTS idempotency_records (
    scope TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    response_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (scope, idempotency_key)
);

-- ---------------------------------------------------------------------------
-- Shared AI / Agent Storage & Cross-Process Coordination (Phase 1 / DEC-026)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS trade_uris (
    trade_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('listing', 'seller', 'buyer')),
    uri TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (trade_id, role)
);

CREATE TABLE IF NOT EXISTS known_phashes (
    trade_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    phash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (trade_id, role)
);

CREATE INDEX IF NOT EXISTS idx_known_phashes_order
ON known_phashes (created_at ASC, trade_id ASC, role ASC);

CREATE TABLE IF NOT EXISTS attest_reports (
    trade_id INTEGER PRIMARY KEY,
    report_hash TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_job_status (
    trade_id INTEGER PRIMARY KEY,
    phase TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runtime_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    worker_id TEXT NOT NULL DEFAULT '',
    running INTEGER NOT NULL DEFAULT 0 CHECK (running IN (0, 1)),
    last_tick REAL,
    last_error TEXT,
    last_reconcile_error TEXT,
    agent_address TEXT NOT NULL DEFAULT '',
    agent_balance_wei TEXT,
    agent_matches_contract INTEGER,
    heartbeat_at REAL
);

CREATE TABLE IF NOT EXISTS worker_leases (
    lease_name TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    acquired_at REAL NOT NULL,
    heartbeat_at REAL NOT NULL,
    expires_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_processing_locks (
    trade_id INTEGER PRIMARY KEY,
    owner_id TEXT NOT NULL,
    acquired_at REAL NOT NULL,
    expires_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS storage_migrations (
    name TEXT PRIMARY KEY,
    migrated_at INTEGER NOT NULL,
    items_imported INTEGER NOT NULL DEFAULT 0,
    details_json TEXT NOT NULL DEFAULT '{}'
);
"""


class MarketplaceDB:
    """Quản lý kết nối SQLite WAL và giao dịch nguyên tử cho Marketplace."""

    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(
            str(self.db_path),
            timeout=10.0,
            isolation_level=None,
            check_same_thread=False,
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=5000;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def _init_schema(self) -> None:
        conn = self._connect()
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            conn.executescript(SCHEMA_SQL)
            cols = {
                row[1]
                for row in conn.execute("PRAGMA table_info(purchase_requests);").fetchall()
            }
            if "min_onchain_trade_id" not in cols:
                conn.execute("ALTER TABLE purchase_requests ADD COLUMN min_onchain_trade_id INTEGER;")
        finally:
            conn.close()

    @contextmanager
    def read_conn(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        try:
            yield conn
        finally:
            conn.close()

    @contextmanager
    def write_tx(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        in_tx = False
        try:
            conn.execute("BEGIN IMMEDIATE")
            in_tx = True
            yield conn
            conn.execute("COMMIT")
            in_tx = False
        except Exception:
            if in_tx:
                try:
                    conn.execute("ROLLBACK")
                except sqlite3.Error:
                    pass
            raise
        finally:
            conn.close()

    def record_proxy_nonce(self, nonce: str, actor_wallet: str, expires_at: int, now: int) -> bool:
        """Ghi nhận nonce một lần từ BFF proxy. Trả False nếu nonce đã dùng (replay)."""
        with self.write_tx() as conn:
            conn.execute("DELETE FROM used_proxy_nonces WHERE expires_at <= ?", (now,))
            try:
                conn.execute(
                    "INSERT INTO used_proxy_nonces (nonce, actor_wallet, expires_at) VALUES (?, ?, ?)",
                    (nonce, actor_wallet.lower(), expires_at),
                )
                return True
            except sqlite3.IntegrityError:
                return False

    # -- Shared URI Registry (trade_uris) ----------------------------------

    def get_trade_uris(self, trade_id: int) -> dict[str, str]:
        with self.read_conn() as conn:
            rows = conn.execute(
                "SELECT role, uri FROM trade_uris WHERE trade_id = ?",
                (int(trade_id),),
            ).fetchall()
        return {str(r["role"]): str(r["uri"]) for r in rows}

    def set_trade_uri(
        self, trade_id: int, role: str, uri: str, now: Optional[int] = None
    ) -> tuple[bool, Optional[str]]:
        """First-write-wins nguyên tử cho (trade_id, role).
        Trả (True, None) nếu ghi mới hoặc trùng URI cũ; (False, existing_uri) nếu xung đột."""
        ts = int(time.time()) if now is None else int(now)
        tid = int(trade_id)
        with self.write_tx() as conn:
            row = conn.execute(
                "SELECT uri FROM trade_uris WHERE trade_id = ? AND role = ?",
                (tid, role),
            ).fetchone()
            if row is not None:
                existing = str(row["uri"])
                if existing == uri:
                    return True, None
                return False, existing
            conn.execute(
                "INSERT INTO trade_uris (trade_id, role, uri, created_at) VALUES (?, ?, ?, ?)",
                (tid, role, uri, ts),
            )
            return True, None

    # -- Shared Known pHashes (known_phashes) ------------------------------

    def list_known_phashes(self, exclude_trade_id: Optional[int] = None) -> list[dict[str, Any]]:
        with self.read_conn() as conn:
            if exclude_trade_id is not None:
                rows = conn.execute(
                    """
                    SELECT trade_id, role, phash, created_at
                    FROM known_phashes
                    WHERE trade_id != ?
                    ORDER BY created_at ASC, trade_id ASC, role ASC
                    """,
                    (int(exclude_trade_id),),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT trade_id, role, phash, created_at
                    FROM known_phashes
                    ORDER BY created_at ASC, trade_id ASC, role ASC
                    """
                ).fetchall()
        return [
            {
                "trade_id": int(r["trade_id"]),
                "role": str(r["role"]),
                "phash": str(r["phash"]),
                "ts": int(r["created_at"]),
            }
            for r in rows
        ]

    def add_known_phash(
        self, trade_id: int, role: str, phash: str, now: Optional[int] = None
    ) -> bool:
        ts = int(time.time()) if now is None else int(now)
        with self.write_tx() as conn:
            cur = conn.execute(
                """
                INSERT OR IGNORE INTO known_phashes (trade_id, role, phash, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (int(trade_id), str(role), str(phash), ts),
            )
            return cur.rowcount > 0

    def count_known_phashes(self) -> int:
        with self.read_conn() as conn:
            row = conn.execute("SELECT COUNT(*) AS cnt FROM known_phashes").fetchone()
        return int(row["cnt"]) if row else 0

    # -- Shared Attestation Reports (attest_reports) -----------------------

    def save_attest_report(
        self, trade_id: int, report_hash: str, payload: dict[str, Any], now: Optional[int] = None
    ) -> None:
        ts = int(time.time()) if now is None else int(now)
        payload_json = json.dumps(payload, ensure_ascii=False)
        with self.write_tx() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO attest_reports (trade_id, report_hash, payload_json, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (int(trade_id), str(report_hash or ""), payload_json, ts),
            )

    def get_attest_report(self, trade_id: int) -> Optional[dict[str, Any]]:
        with self.read_conn() as conn:
            row = conn.execute(
                "SELECT payload_json FROM attest_reports WHERE trade_id = ?",
                (int(trade_id),),
            ).fetchone()
        if not row:
            return None
        return json.loads(row["payload_json"])

    # -- Shared Agent Job Status (agent_job_status) ------------------------

    def upsert_agent_job_status(
        self,
        trade_id: int,
        phase: str,
        detail: str = "",
        attempts: int = 0,
        updated_at: Optional[int] = None,
    ) -> dict[str, Any]:
        ts = int(time.time()) if updated_at is None else int(updated_at)
        tid = int(trade_id)
        with self.write_tx() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO agent_job_status (trade_id, phase, detail, attempts, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (tid, str(phase), str(detail or ""), int(attempts), ts),
            )
        return {
            "phase": str(phase),
            "detail": str(detail or ""),
            "attempts": int(attempts),
            "updated_at": ts,
        }

    def get_agent_job_status(self, trade_id: int) -> Optional[dict[str, Any]]:
        with self.read_conn() as conn:
            row = conn.execute(
                "SELECT phase, detail, attempts, updated_at FROM agent_job_status WHERE trade_id = ?",
                (int(trade_id),),
            ).fetchone()
        if not row:
            return None
        return {
            "phase": str(row["phase"]),
            "detail": str(row["detail"]),
            "attempts": int(row["attempts"]),
            "updated_at": int(row["updated_at"]),
        }

    # -- Shared Agent Runtime Telemetry (agent_runtime_meta) ---------------

    def update_agent_runtime_meta(
        self,
        worker_id: str,
        *,
        running: bool,
        last_tick: Optional[float] = None,
        last_error: Optional[str] = None,
        last_reconcile_error: Optional[str] = None,
        agent_address: Optional[str] = None,
        agent_balance_wei: Optional[str] = None,
        agent_matches_contract: Optional[bool] = None,
        heartbeat_at: Optional[float] = None,
    ) -> None:
        hb = time.time() if heartbeat_at is None else float(heartbeat_at)
        matches_int = None if agent_matches_contract is None else (1 if agent_matches_contract else 0)
        with self.write_tx() as conn:
            prev = conn.execute("SELECT * FROM agent_runtime_meta WHERE id = 1").fetchone()
            eff_last_tick = last_tick if last_tick is not None else (prev["last_tick"] if prev else None)
            eff_agent_addr = (
                agent_address
                if agent_address is not None
                else (str(prev["agent_address"]) if prev else "")
            )
            eff_balance = (
                agent_balance_wei
                if agent_balance_wei is not None
                else (prev["agent_balance_wei"] if prev else None)
            )
            eff_matches = (
                matches_int
                if matches_int is not None
                else (prev["agent_matches_contract"] if prev else None)
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO agent_runtime_meta (
                    id, worker_id, running, last_tick, last_error, last_reconcile_error,
                    agent_address, agent_balance_wei, agent_matches_contract, heartbeat_at
                )
                VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(worker_id),
                    1 if running else 0,
                    eff_last_tick,
                    last_error,
                    last_reconcile_error,
                    eff_agent_addr,
                    eff_balance,
                    eff_matches,
                    hb,
                ),
            )

    def mark_agent_runtime_stopped(self, worker_id: str, heartbeat_at: Optional[float] = None) -> None:
        hb = time.time() if heartbeat_at is None else float(heartbeat_at)
        with self.write_tx() as conn:
            conn.execute(
                """
                UPDATE agent_runtime_meta
                SET running = 0, heartbeat_at = ?
                WHERE id = 1 AND worker_id = ?
                """,
                (hb, str(worker_id)),
            )

    def get_agent_runtime_meta(self) -> Optional[dict[str, Any]]:
        with self.read_conn() as conn:
            row = conn.execute("SELECT * FROM agent_runtime_meta WHERE id = 1").fetchone()
        if not row:
            return None
        return {
            "worker_id": str(row["worker_id"]),
            "running": bool(row["running"]),
            "last_tick": float(row["last_tick"]) if row["last_tick"] is not None else None,
            "last_error": str(row["last_error"]) if row["last_error"] is not None else None,
            "last_reconcile_error": (
                str(row["last_reconcile_error"]) if row["last_reconcile_error"] is not None else None
            ),
            "agent_address": str(row["agent_address"] or ""),
            "agent_balance_wei": (
                str(row["agent_balance_wei"]) if row["agent_balance_wei"] is not None else None
            ),
            "agent_matches_contract": (
                bool(row["agent_matches_contract"]) if row["agent_matches_contract"] is not None else None
            ),
            "heartbeat_at": float(row["heartbeat_at"]) if row["heartbeat_at"] is not None else None,
        }

    # -- Cross-Process Worker Leader Lease & Trade Processing Lock ---------

    def acquire_worker_lease(
        self,
        lease_name: str,
        owner_id: str,
        ttl_seconds: float = 60.0,
        now: Optional[float] = None,
    ) -> bool:
        """Giành hoặc gia hạn lease độc quyền cho worker. Trả False nếu worker khác đang giữ hạn."""
        ts = time.time() if now is None else float(now)
        expires = ts + max(float(ttl_seconds), 1.0)
        with self.write_tx() as conn:
            row = conn.execute(
                "SELECT owner_id, acquired_at, expires_at FROM worker_leases WHERE lease_name = ?",
                (lease_name,),
            ).fetchone()
            if row is not None and str(row["owner_id"]) != owner_id and float(row["expires_at"]) > ts:
                return False
            acquired_at = float(row["acquired_at"]) if (row is not None and str(row["owner_id"]) == owner_id) else ts
            conn.execute(
                """
                INSERT OR REPLACE INTO worker_leases (lease_name, owner_id, acquired_at, heartbeat_at, expires_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (lease_name, owner_id, acquired_at, ts, expires),
            )
            return True

    def release_worker_lease(self, lease_name: str, owner_id: str) -> None:
        with self.write_tx() as conn:
            conn.execute(
                "DELETE FROM worker_leases WHERE lease_name = ? AND owner_id = ?",
                (lease_name, owner_id),
            )

    def get_worker_lease(self, lease_name: str) -> Optional[dict[str, Any]]:
        with self.read_conn() as conn:
            row = conn.execute(
                "SELECT lease_name, owner_id, acquired_at, heartbeat_at, expires_at FROM worker_leases WHERE lease_name = ?",
                (lease_name,),
            ).fetchone()
        if not row:
            return None
        return {
            "lease_name": str(row["lease_name"]),
            "owner_id": str(row["owner_id"]),
            "acquired_at": float(row["acquired_at"]),
            "heartbeat_at": float(row["heartbeat_at"]),
            "expires_at": float(row["expires_at"]),
        }

    def acquire_trade_lock(
        self,
        trade_id: int,
        owner_id: str,
        ttl_seconds: float = 300.0,
        now: Optional[float] = None,
    ) -> bool:
        """Khóa xử lý verify/attest theo trade_id xuyên tiến trình."""
        ts = time.time() if now is None else float(now)
        expires = ts + max(float(ttl_seconds), 1.0)
        tid = int(trade_id)
        with self.write_tx() as conn:
            conn.execute(
                "DELETE FROM trade_processing_locks WHERE trade_id = ? AND expires_at <= ?",
                (tid, ts),
            )
            try:
                conn.execute(
                    """
                    INSERT INTO trade_processing_locks (trade_id, owner_id, acquired_at, expires_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (tid, owner_id, ts, expires),
                )
                return True
            except sqlite3.IntegrityError:
                return False

    def release_trade_lock(self, trade_id: int, owner_id: str) -> None:
        with self.write_tx() as conn:
            conn.execute(
                "DELETE FROM trade_processing_locks WHERE trade_id = ? AND owner_id = ?",
                (int(trade_id), owner_id),
            )

    # -- Safe Idempotent Migration from Legacy JSON Files ------------------

    def migrate_legacy_json_stores(self, data_dir: Path) -> dict[str, int]:
        """Import một chiều, idempotent và không phá hủy file JSON cũ vào SQLite WAL.
        Giữ nguyên các file trade_uris.json, known_hashes.json và reports/*.json để phục vụ rollback."""
        root = Path(data_dir)
        now = int(time.time())
        counts = {"uris": 0, "phashes": 0, "reports": 0, "errors": 0}

        uris_to_import: list[tuple[int, str, str, int]] = []
        uris_file = root / "trade_uris.json"
        if uris_file.is_file():
            try:
                raw_uris = json.loads(uris_file.read_text(encoding="utf-8"))
                if not isinstance(raw_uris, dict):
                    raise ValueError("trade_uris.json root must be an object")
                file_ts = int(uris_file.stat().st_mtime) or now
                for tid_raw, role_map in raw_uris.items():
                    if not isinstance(role_map, dict):
                        counts["errors"] += 1
                        continue
                    try:
                        tid = int(tid_raw)
                        if tid <= 0:
                            raise ValueError("non-positive trade_id")
                    except (TypeError, ValueError):
                        counts["errors"] += 1
                        continue
                    for role, uri in role_map.items():
                        if role in VALID_URI_ROLES and isinstance(uri, str) and uri.strip():
                            uris_to_import.append((tid, role, uri, file_ts))
                        else:
                            counts["errors"] += 1
            except Exception:
                counts["errors"] += 1
                log.warning("Bỏ qua migrate trade_uris.json do file lỗi định dạng")

        phashes_to_import: list[tuple[int, str, str, int]] = []
        hashes_file = root / "known_hashes.json"
        if hashes_file.is_file():
            try:
                raw_hashes = json.loads(hashes_file.read_text(encoding="utf-8"))
                if not isinstance(raw_hashes, list):
                    raise ValueError("known_hashes.json root must be a list")
                for item in raw_hashes:
                    if not isinstance(item, dict):
                        counts["errors"] += 1
                        continue
                    try:
                        tid = int(item["trade_id"])
                        role = str(item["role"]).strip()
                        phash = str(item["phash"]).strip()
                        int(phash, 16)
                        ts = int(item.get("ts") or now)
                        if not role or not phash:
                            raise ValueError("empty role/phash")
                        phashes_to_import.append((tid, role, phash, ts))
                    except Exception:
                        counts["errors"] += 1
            except Exception:
                counts["errors"] += 1
                log.warning("Bỏ qua migrate known_hashes.json do file lỗi định dạng")

        reports_to_import: list[tuple[int, str, str, int]] = []
        reports_dir = root / "reports"
        if reports_dir.is_dir():
            for report_file in sorted(reports_dir.glob("*.json")):
                if not report_file.stem.isdigit():
                    counts["errors"] += 1
                    continue
                tid = int(report_file.stem)
                if tid <= 0:
                    counts["errors"] += 1
                    continue
                try:
                    payload = json.loads(report_file.read_text(encoding="utf-8"))
                    if not isinstance(payload, dict):
                        raise ValueError("report JSON must be an object")
                    report_hash = str(payload.get("report_hash") or "")
                    payload_json = json.dumps(payload, ensure_ascii=False)
                    ts = int(report_file.stat().st_mtime) or now
                    reports_to_import.append((tid, report_hash, payload_json, ts))
                except Exception:
                    counts["errors"] += 1
                    log.warning("Bỏ qua migrate report trade_id=%s do file JSON lỗi", tid)

        with self.write_tx() as conn:
            for tid, role, uri, ts in uris_to_import:
                cur = conn.execute(
                    "INSERT OR IGNORE INTO trade_uris (trade_id, role, uri, created_at) VALUES (?, ?, ?, ?)",
                    (tid, role, uri, ts),
                )
                counts["uris"] += max(cur.rowcount, 0)

            for tid, role, phash, ts in phashes_to_import:
                cur = conn.execute(
                    "INSERT OR IGNORE INTO known_phashes (trade_id, role, phash, created_at) VALUES (?, ?, ?, ?)",
                    (tid, role, phash, ts),
                )
                counts["phashes"] += max(cur.rowcount, 0)

            for tid, report_hash, payload_json, ts in reports_to_import:
                cur = conn.execute(
                    """
                    INSERT OR IGNORE INTO attest_reports (trade_id, report_hash, payload_json, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (tid, report_hash, payload_json, ts),
                )
                counts["reports"] += max(cur.rowcount, 0)

            total_new = counts["uris"] + counts["phashes"] + counts["reports"]
            prev = conn.execute(
                "SELECT items_imported, details_json FROM storage_migrations WHERE name = ?",
                ("legacy_json_v1",),
            ).fetchone()
            if prev is None:
                conn.execute(
                    """
                    INSERT INTO storage_migrations (name, migrated_at, items_imported, details_json)
                    VALUES (?, ?, ?, ?)
                    """,
                    ("legacy_json_v1", now, total_new, json.dumps(counts)),
                )
            elif total_new > 0:
                prev_details = json.loads(prev["details_json"] or "{}")
                merged = {
                    "uris": int(prev_details.get("uris", 0)) + counts["uris"],
                    "phashes": int(prev_details.get("phashes", 0)) + counts["phashes"],
                    "reports": int(prev_details.get("reports", 0)) + counts["reports"],
                    "errors": int(prev_details.get("errors", 0)) + counts["errors"],
                }
                conn.execute(
                    """
                    UPDATE storage_migrations
                    SET migrated_at = ?, items_imported = ?, details_json = ?
                    WHERE name = ?
                    """,
                    (now, int(prev["items_imported"]) + total_new, json.dumps(merged), "legacy_json_v1"),
                )

        if counts["uris"] or counts["phashes"] or counts["reports"]:
            log.info(
                "Migrated legacy JSON stores to SQLite WAL: uris=%d phashes=%d reports=%d errors=%d",
                counts["uris"],
                counts["phashes"],
                counts["reports"],
                counts["errors"],
            )
        return counts

    def get_storage_migrations(self) -> dict[str, dict[str, Any]]:
        with self.read_conn() as conn:
            rows = conn.execute(
                "SELECT name, migrated_at, items_imported, details_json FROM storage_migrations"
            ).fetchall()
        return {
            str(r["name"]): {
                "migrated_at": int(r["migrated_at"]),
                "items_imported": int(r["items_imported"]),
                "details": json.loads(r["details_json"] or "{}"),
            }
            for r in rows
        }
