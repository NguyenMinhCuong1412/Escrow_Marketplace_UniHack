"""
trade_indexer.py
----------------
Incremental on-chain Trade Discovery Indexer cho Escrow Marketplace (P3-T3 / DEC-027).

Nguyên tắc cốt lõi:
- Index SQLite WAL (`trade_index`, `trade_index_checkpoints`) chỉ phục vụ discovery;
  blockchain (`Escrow.sol`) luôn là nguồn xác thực cuối cùng.
- Bounded per tick (chunk <= 2000 blocks, giới hạn số chunk & thời gian tick),
  restart-safe, idempotent; không làm chậm hoặc chặn Verify/Attest, reconcile hay leader lease.
- Hỗ trợ gap-healing qua `nextTradeId` (bảo toàn trade P2P /trade/new và unbound trades)
  và phục hồi reorg trong cửa sổ REORG_LOOKBACK_BLOCKS (mặc định 12 blocks).
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Callable, Optional

from web3 import Web3

from chain import TradeState
from db import MarketplaceDB

log = logging.getLogger("attest.trade_indexer")

DEFAULT_FUJI_DEPLOY_BLOCK = 60980241
DEFAULT_CHUNK_BLOCKS = 2000
MIN_CHUNK_BLOCKS = 1
DEFAULT_REORG_LOOKBACK_BLOCKS = 12
DEFAULT_MAX_CHUNKS_PER_TICK = 5
DEFAULT_MAX_GAP_HEAL_PER_TICK = 50
DEFAULT_MAX_TICK_SECONDS = 2.0
DEFAULT_MAX_INDEX_BLOCK_LAG = 20
DEFAULT_MAX_INDEX_STALE_SECONDS = 45.0

_TRADE_EVENT_SIGNATURES: dict[str, str] = {
    "TradeCreated": "TradeCreated(uint256,address,address,uint256,bytes32)",
    "Deposited": "Deposited(uint256,address,uint256)",
    "FullyFunded": "FullyFunded(uint256,uint256)",
    "EvidenceSubmitted": "EvidenceSubmitted(uint256,address,bytes32)",
    "Attested": "Attested(uint256,uint8,bool,bytes32)",
    "ResolvedClean": "ResolvedClean(uint256)",
    "Disputed": "Disputed(uint256,address)",
    "ResolvedDispute": "ResolvedDispute(uint256,address,uint256)",
    "Cancelled": "Cancelled(uint256,string)",
}

_EVENT_TOPIC_TO_NAME: dict[str, str] = {
    Web3.to_hex(Web3.keccak(text=sig)).lower(): name
    for name, sig in _TRADE_EVENT_SIGNATURES.items()
}
_TRADE_CREATED_TOPIC = Web3.to_hex(
    Web3.keccak(text=_TRADE_EVENT_SIGNATURES["TradeCreated"])
).lower()
_ALL_TRADE_TOPICS: list[str] = list(_EVENT_TOPIC_TO_NAME.keys())


def is_trade_index_enabled() -> bool:
    """Đọc runtime kill-switch `TRADE_INDEX_ENABLED` ở server tại thời điểm gọi."""
    raw = os.environ.get("TRADE_INDEX_ENABLED", "true").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _to_hex_lower(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (bytes, bytearray)):
        return Web3.to_hex(value).lower()
    if hasattr(value, "hex") and callable(value.hex):
        h = str(value.hex())
        return (h if h.startswith("0x") else f"0x{h}").lower()
    s = str(value).strip()
    if not s:
        return ""
    return (s if s.startswith("0x") else f"0x{s}").lower()


def _topic_to_uint256(topic_val: Any) -> Optional[int]:
    hx = _to_hex_lower(topic_val)
    if not hx.startswith("0x"):
        return None
    try:
        return int(hx, 16)
    except ValueError:
        return None


def _topic_to_address(topic_val: Any) -> str:
    hx = _to_hex_lower(topic_val)
    if not hx.startswith("0x"):
        return ""
    body = hx[2:].rjust(64, "0")[-40:]
    return f"0x{body}".lower()


class TradeIndexer:
    """Đồng bộ chỉ mục giao dịch on-chain theo chunk có giới hạn và tự phục hồi."""

    def __init__(
        self,
        db: MarketplaceDB,
        *,
        deployments_dir: Optional[Path] = None,
        chunk_blocks: int = DEFAULT_CHUNK_BLOCKS,
        min_chunk_blocks: int = MIN_CHUNK_BLOCKS,
        reorg_lookback_blocks: int = DEFAULT_REORG_LOOKBACK_BLOCKS,
        max_chunks_per_tick: int = DEFAULT_MAX_CHUNKS_PER_TICK,
        max_gap_heal_per_tick: int = DEFAULT_MAX_GAP_HEAL_PER_TICK,
        max_tick_seconds: float = DEFAULT_MAX_TICK_SECONDS,
        max_block_lag: int = DEFAULT_MAX_INDEX_BLOCK_LAG,
        max_stale_seconds: float = DEFAULT_MAX_INDEX_STALE_SECONDS,
        clock: Callable[[], float] = time.time,
        monotonic: Callable[[], float] = time.monotonic,
        sleep_fn: Callable[[float], None] = time.sleep,
    ):
        self.db = db
        self.deployments_dir = deployments_dir
        self.chunk_blocks = max(1, min(int(chunk_blocks), 2000))
        self.min_chunk_blocks = max(1, int(min_chunk_blocks))
        self.reorg_lookback_blocks = max(0, int(reorg_lookback_blocks))
        self.max_chunks_per_tick = max(1, int(max_chunks_per_tick))
        self.max_gap_heal_per_tick = max(0, int(max_gap_heal_per_tick))
        self.max_tick_seconds = max(0.05, float(max_tick_seconds))
        self.max_block_lag = max(0, int(max_block_lag))
        self.max_stale_seconds = max(1.0, float(max_stale_seconds))
        self._clock = clock
        self._monotonic = monotonic
        self._sleep = sleep_fn

    def resolve_deploy_block(self, chain_id: int) -> int:
        raw_env = os.environ.get("TRADE_INDEX_DEPLOY_BLOCK")
        if raw_env is not None and raw_env.strip() != "":
            try:
                parsed = int(raw_env.strip())
                if parsed >= 0:
                    return parsed
            except ValueError:
                log.warning("Bỏ qua TRADE_INDEX_DEPLOY_BLOCK không hợp lệ")

        if self.deployments_dir is not None:
            dep_file = self.deployments_dir / f"{int(chain_id)}.json"
            if dep_file.exists():
                try:
                    data = json.loads(dep_file.read_text(encoding="utf-8"))
                    if "deployBlock" in data and data["deployBlock"] is not None:
                        parsed = int(data["deployBlock"])
                        if parsed >= 0:
                            return parsed
                except Exception as exc:
                    log.warning("Không đọc được deployBlock từ %s: %s", dep_file, exc)

        if int(chain_id) == 43113:
            return DEFAULT_FUJI_DEPLOY_BLOCK
        return 0

    def _safe_block_hash(self, w3: Any, block_number: int) -> str:
        try:
            blk = w3.eth.get_block(int(block_number))
            if blk is None:
                return ""
            if isinstance(blk, dict):
                return _to_hex_lower(blk.get("hash"))
            return _to_hex_lower(getattr(blk, "hash", None) or blk["hash"])
        except Exception:
            return ""

    def _fetch_logs_chunk(
        self,
        w3: Any,
        escrow_checksum: str,
        from_block: int,
        to_block: int,
        initial_chunk: int,
        deadline_mono: float,
    ) -> tuple[list[Any], int, int]:
        """Quét log bắt đầu tại `from_block` với adaptive chunk halving khi RPC 429/timeout.
        Trả `(logs, actual_end_block, used_chunk_size)`.
        """
        chunk_size = max(self.min_chunk_blocks, min(int(initial_chunk), to_block - from_block + 1))
        attempt = 0
        last_exc: Optional[Exception] = None
        while True:
            actual_to = min(to_block, from_block + chunk_size - 1)
            filter_params = {
                "address": escrow_checksum,
                "fromBlock": int(from_block),
                "toBlock": int(actual_to),
                "topics": [_ALL_TRADE_TOPICS],
            }
            try:
                logs = list(w3.eth.get_logs(filter_params))
                return logs, actual_to, chunk_size
            except Exception as exc:
                last_exc = exc
                if self._monotonic() >= deadline_mono:
                    raise
                if chunk_size > self.min_chunk_blocks:
                    next_chunk = max(self.min_chunk_blocks, chunk_size // 2)
                    if next_chunk == chunk_size:
                        next_chunk = max(1, chunk_size - 1)
                    log.warning(
                        "trade_indexer get_logs lỗi tại [%s..%s], giảm chunk %s -> %s: %s",
                        from_block,
                        actual_to,
                        chunk_size,
                        next_chunk,
                        exc,
                    )
                    chunk_size = next_chunk
                elif attempt < 2:
                    attempt += 1
                    remaining = deadline_mono - self._monotonic()
                    if remaining <= 0.01:
                        raise
                    self._sleep(min(0.05 * attempt, remaining))
                else:
                    raise last_exc

    def sync_tick(self, client: Any, chain_id: int, escrow_address: str) -> dict[str, Any]:
        """Chạy 1 nhịp đồng bộ bounded (idempotent, restart-safe, reorg-aware)."""
        if not is_trade_index_enabled():
            return {"enabled": False, "skipped": True, "chunksScanned": 0}

        if client is None:
            return {"enabled": True, "skipped": True, "reason": "no_client"}

        cid = int(chain_id)
        esc_lower = str(escrow_address).lower()
        deploy_block = self.resolve_deploy_block(cid)
        started_mono = self._monotonic()
        deadline_mono = started_mono + self.max_tick_seconds

        w3 = getattr(client, "w3", None)
        if w3 is None or not hasattr(w3, "eth") or not hasattr(w3.eth, "get_logs"):
            return {"enabled": True, "skipped": True, "reason": "no_web3_logs"}

        try:
            latest_blk = w3.eth.get_block("latest")
            latest_block = int(latest_blk["number"] if isinstance(latest_blk, dict) else latest_blk.number)
            onchain_next_trade_id = max(1, int(client.next_trade_id()))
        except Exception as exc:
            self.db.mark_trade_index_error(
                cid,
                esc_lower,
                deploy_block=deploy_block,
                head_block_at_sync=0,
                error_msg=str(exc),
                sync_epoch=self._clock(),
            )
            return {"enabled": True, "ok": False, "error": str(exc)}

        if latest_block < deploy_block:
            latest_hash = self._safe_block_hash(w3, latest_block)
            self.db.upsert_trade_index_entries_and_checkpoint(
                cid,
                esc_lower,
                [],
                deploy_block=deploy_block,
                last_scanned_block=latest_block,
                last_scanned_block_hash=latest_hash,
                head_block_at_sync=latest_block,
                highest_next_trade_id=onchain_next_trade_id,
                sync_epoch=self._clock(),
                last_error="",
            )
            return {
                "enabled": True,
                "ok": True,
                "chunksScanned": 0,
                "indexedThroughBlock": latest_block,
                "onchainNextTradeId": onchain_next_trade_id,
            }

        ckpt = self.db.get_trade_index_checkpoint(cid, esc_lower)
        reorg_detected = False

        if ckpt is None:
            scan_from = deploy_block
            highest_next_id = onchain_next_trade_id
        else:
            prev_scanned = int(ckpt["last_scanned_block"])
            prev_hash = str(ckpt["last_scanned_block_hash"] or "").lower()
            prev_next_id = int(ckpt["highest_next_trade_id"])

            if prev_scanned > latest_block:
                reorg_detected = True
                scan_from = max(deploy_block, latest_block - self.reorg_lookback_blocks)
            else:
                if prev_scanned >= deploy_block and prev_hash:
                    live_hash = self._safe_block_hash(w3, prev_scanned)
                    if live_hash and live_hash != prev_hash:
                        reorg_detected = True
                if onchain_next_trade_id < prev_next_id:
                    reorg_detected = True
                scan_from = max(deploy_block, prev_scanned - self.reorg_lookback_blocks)
                # Ensure re-scanning at least deploy_block if checkpoint hadn't reached it yet
                if prev_scanned < deploy_block:
                    scan_from = deploy_block

            if reorg_detected and prev_scanned >= deploy_block:
                scan_from = max(
                    deploy_block,
                    min(prev_scanned, latest_block) - self.reorg_lookback_blocks,
                )
            highest_next_id = onchain_next_trade_id

        if reorg_detected:
            self.db.apply_trade_index_reorg_rollback(
                cid,
                esc_lower,
                rollback_from_block=scan_from,
                valid_next_trade_id=onchain_next_trade_id,
            )

        affected_existing_ids = set(
            self.db.list_trade_ids_in_block_window(cid, esc_lower, scan_from)
        )

        escrow_checksum = Web3.to_checksum_address(esc_lower)
        cursor = scan_from
        chunks_scanned = 0
        current_chunk = self.chunk_blocks
        reverified_trades = 0
        seen_log_trade_ids: set[int] = set()

        while cursor <= latest_block and chunks_scanned < self.max_chunks_per_tick:
            if chunks_scanned > 0 and self._monotonic() >= deadline_mono:
                break
            try:
                logs, chunk_end, used_chunk = self._fetch_logs_chunk(
                    w3,
                    escrow_checksum,
                    cursor,
                    latest_block,
                    current_chunk,
                    deadline_mono,
                )
            except Exception as exc:
                self.db.mark_trade_index_error(
                    cid,
                    esc_lower,
                    deploy_block=deploy_block,
                    head_block_at_sync=latest_block,
                    error_msg=str(exc),
                    sync_epoch=self._clock(),
                )
                return {
                    "enabled": True,
                    "ok": False,
                    "chunksScanned": chunks_scanned,
                    "reorgDetected": reorg_detected,
                    "error": str(exc),
                }

            current_chunk = used_chunk
            created_block_by_id: dict[int, int] = {}
            last_event_block_by_id: dict[int, int] = {}
            chunk_trade_ids: set[int] = set()

            for lg in logs:
                topics = lg["topics"] if isinstance(lg, dict) else getattr(lg, "topics", [])
                if not topics or len(topics) < 2:
                    continue
                topic0 = _to_hex_lower(topics[0])
                ev_name = _EVENT_TOPIC_TO_NAME.get(topic0)
                if not ev_name:
                    continue
                tid = _topic_to_uint256(topics[1])
                if tid is None or tid < 1 or tid >= onchain_next_trade_id:
                    continue
                blk_num = int(lg["blockNumber"] if isinstance(lg, dict) else getattr(lg, "blockNumber", cursor))
                chunk_trade_ids.add(tid)
                seen_log_trade_ids.add(tid)
                if blk_num > last_event_block_by_id.get(tid, 0):
                    last_event_block_by_id[tid] = blk_num
                if ev_name == "TradeCreated":
                    prev_c = created_block_by_id.get(tid, 0)
                    if prev_c == 0 or blk_num < prev_c:
                        created_block_by_id[tid] = blk_num

            # On final chunk of this window (or when reaching latest_block), also re-verify
            # existing DB trades previously recorded in [scan_from ..] whose events may have
            # vanished or changed after a reorg even if no canonical logs exist for them now.
            ids_to_fetch = set(chunk_trade_ids)
            if chunk_end >= latest_block and affected_existing_ids:
                ids_to_fetch |= {
                    tid
                    for tid in affected_existing_ids
                    if 1 <= tid < onchain_next_trade_id
                }

            entries: list[dict[str, Any]] = []
            for tid in sorted(ids_to_fetch):
                try:
                    t = client.get_trade(tid)
                except Exception as exc:
                    self.db.mark_trade_index_error(
                        cid,
                        esc_lower,
                        deploy_block=deploy_block,
                        head_block_at_sync=latest_block,
                        error_msg=f"getTrade({tid}): {exc}",
                        sync_epoch=self._clock(),
                    )
                    return {
                        "enabled": True,
                        "ok": False,
                        "chunksScanned": chunks_scanned,
                        "reorgDetected": reorg_detected,
                        "error": str(exc),
                    }
                if not t.exists:
                    continue
                reverified_trades += 1
                state_int = int(t.state)
                if tid in last_event_block_by_id:
                    ev_blk = last_event_block_by_id[tid]
                else:
                    # Event previously inside [scan_from..] disappeared after reorg -> anchor safely before scan_from
                    ev_blk = max(deploy_block, scan_from - 1) if scan_from > deploy_block else deploy_block
                created_blk = created_block_by_id.get(tid, 0)
                if created_blk == 0 and tid in seen_log_trade_ids:
                    created_blk = ev_blk
                is_term = (
                    state_int in (TradeState.Resolved.value, TradeState.Cancelled.value)
                    and (latest_block - ev_blk) >= self.reorg_lookback_blocks
                )
                entries.append(
                    {
                        "trade_id": tid,
                        "seller": t.seller.lower(),
                        "buyer": t.buyer.lower(),
                        "last_known_state": state_int,
                        "flagged": bool(t.flagged),
                        "is_terminal": is_term,
                        "created_block": created_blk,
                        "last_event_block": ev_blk,
                        "last_verified_block": latest_block,
                    }
                )

            end_hash = self._safe_block_hash(w3, chunk_end)
            self.db.upsert_trade_index_entries_and_checkpoint(
                cid,
                esc_lower,
                entries,
                deploy_block=deploy_block,
                last_scanned_block=chunk_end,
                last_scanned_block_hash=end_hash,
                head_block_at_sync=latest_block,
                highest_next_trade_id=highest_next_id,
                sync_epoch=self._clock(),
                last_error="",
                force_overwrite_blocks=reorg_detected,
            )
            chunks_scanned += 1
            cursor = chunk_end + 1

        # Bounded gap-healing via nextTradeId (protects direct /trade/new, unbound trades, or dropped logs)
        gap_healed = 0
        if self.max_gap_heal_per_tick > 0 and self._monotonic() < deadline_mono:
            missing_ids, _ = self.db.find_missing_trade_index_ids(
                cid, esc_lower, onchain_next_trade_id, limit=self.max_gap_heal_per_tick
            )
            if missing_ids:
                heal_entries: list[dict[str, Any]] = []
                for mid in missing_ids:
                    if self._monotonic() >= deadline_mono:
                        break
                    try:
                        t = client.get_trade(mid)
                    except Exception as exc:
                        self.db.mark_trade_index_error(
                            cid,
                            esc_lower,
                            deploy_block=deploy_block,
                            head_block_at_sync=latest_block,
                            error_msg=f"gap_heal getTrade({mid}): {exc}",
                            sync_epoch=self._clock(),
                        )
                        break
                    if not t.exists:
                        continue
                    state_int = int(t.state)
                    heal_entries.append(
                        {
                            "trade_id": mid,
                            "seller": t.seller.lower(),
                            "buyer": t.buyer.lower(),
                            "last_known_state": state_int,
                            "flagged": bool(t.flagged),
                            "is_terminal": False,
                            "created_block": latest_block,
                            "last_event_block": latest_block,
                            "last_verified_block": latest_block,
                        }
                    )
                    gap_healed += 1
                if heal_entries:
                    cur_ckpt = self.db.get_trade_index_checkpoint(cid, esc_lower)
                    eff_blk = int(cur_ckpt["last_scanned_block"]) if cur_ckpt else latest_block
                    eff_hash = (
                        str(cur_ckpt["last_scanned_block_hash"])
                        if cur_ckpt
                        else self._safe_block_hash(w3, eff_blk)
                    )
                    self.db.upsert_trade_index_entries_and_checkpoint(
                        cid,
                        esc_lower,
                        heal_entries,
                        deploy_block=deploy_block,
                        last_scanned_block=eff_blk,
                        last_scanned_block_hash=eff_hash,
                        head_block_at_sync=latest_block,
                        highest_next_trade_id=onchain_next_trade_id,
                        sync_epoch=self._clock(),
                        last_error="",
                    )

        # Bounded active-trade safety refresh (covers any missed non-creation state events without O(open) starvation)
        if self._monotonic() < deadline_mono:
            stale_active_rows = self.db.list_stale_active_trade_ids(
                cid, esc_lower, max(0, latest_block - 1), limit=10
            )
            if stale_active_rows:
                refresh_entries: list[dict[str, Any]] = []
                for prev_row in stale_active_rows:
                    tid = int(prev_row["trade_id"])
                    if tid >= onchain_next_trade_id or self._monotonic() >= deadline_mono:
                        break
                    try:
                        t = client.get_trade(tid)
                    except Exception:
                        break
                    if not t.exists:
                        continue
                    reverified_trades += 1
                    new_state = int(t.state)
                    new_flagged = bool(t.flagged)
                    changed = (
                        new_state != int(prev_row["last_known_state"])
                        or new_flagged != bool(prev_row["flagged"])
                    )
                    ev_blk = latest_block if changed else int(prev_row["last_event_block"])
                    is_term = (
                        new_state in (TradeState.Resolved.value, TradeState.Cancelled.value)
                        and (latest_block - ev_blk) >= self.reorg_lookback_blocks
                    )
                    refresh_entries.append(
                        {
                            "trade_id": tid,
                            "seller": t.seller.lower(),
                            "buyer": t.buyer.lower(),
                            "last_known_state": new_state,
                            "flagged": new_flagged,
                            "is_terminal": is_term,
                            "created_block": int(prev_row["created_block"]),
                            "last_event_block": ev_blk,
                            "last_verified_block": latest_block,
                        }
                    )
                if refresh_entries:
                    cur_ckpt = self.db.get_trade_index_checkpoint(cid, esc_lower)
                    eff_blk = int(cur_ckpt["last_scanned_block"]) if cur_ckpt else latest_block
                    eff_hash = (
                        str(cur_ckpt["last_scanned_block_hash"])
                        if cur_ckpt
                        else self._safe_block_hash(w3, eff_blk)
                    )
                    self.db.upsert_trade_index_entries_and_checkpoint(
                        cid,
                        esc_lower,
                        refresh_entries,
                        deploy_block=deploy_block,
                        last_scanned_block=eff_blk,
                        last_scanned_block_hash=eff_hash,
                        head_block_at_sync=latest_block,
                        highest_next_trade_id=onchain_next_trade_id,
                        sync_epoch=self._clock(),
                        last_error="",
                    )

        finalized_count = 0
        if latest_block >= self.reorg_lookback_blocks:
            finalized_count = self.db.finalize_old_terminal_trades(
                cid, esc_lower, latest_block - self.reorg_lookback_blocks
            )

        return {
            "enabled": True,
            "ok": True,
            "chunksScanned": chunks_scanned,
            "reverifiedTrades": reverified_trades,
            "gapHealed": gap_healed,
            "finalizedCount": finalized_count,
            "reorgDetected": reorg_detected,
            "onchainNextTradeId": onchain_next_trade_id,
            "headBlock": latest_block,
        }
