"""
test_phase3_t3_trade_index.py
-----------------------------
Unit + Integration + Live Anvil tests cho P3-T3 Backend Trade Discovery Indexer:
- Bounded chunk log sweep, deployBlock resolution & checkpoint/process restart safety
- RPC 429 / timeout adaptive chunk halving & safe error state
- nextTradeId gap-healing & preservation of direct P2P (/trade/new) + unbound trades
- Reorg recovery: event disappears, trade disappears (nextTradeId drops), block-hash rollback
- Index freshness (`isComplete`, `isStale`, `blockLag`, `missingGapCount`)
- Non-blocking AutoAgent.tick() guarantee (Verify/Attest, reconcile, leader lease isolation)
- Auth, filter/pagination, read rate limit & runtime kill-switch (`TRADE_INDEX_ENABLED=false`)
- Live Anvil test including `evm_snapshot` / `evm_revert` chain reorg
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Optional

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from web3 import Web3

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import attest_service as svc  # noqa: E402
import ops_auth  # noqa: E402
from auto_agent import AutoAgent, UriRegistry  # noqa: E402
from chain import ChainError, Trade, TradeState  # noqa: E402
from db import MarketplaceDB  # noqa: E402
from trade_indexer import (  # noqa: E402
    _EVENT_TOPIC_TO_NAME,
    TradeIndexer,
    is_trade_index_enabled,
)

ROOT = svc.ROOT_DIR
OUT = ROOT / "contracts" / "out"

ANVIL_DEPLOYER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ANVIL_AGENT = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
ANVIL_SELLER = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
ANVIL_BUYER = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
ANVIL_STRANGER = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"

STRONG_JWT_SECRET = "p3t3-ops-jwt-secret-key-at-least-32-bytes-long!"
STRONG_ATTEST_KEY = "p3t3-internal-attest-api-key-32-bytes-long!"

TRADE_CREATED_TOPIC = next(k for k, v in _EVENT_TOPIC_TO_NAME.items() if v == "TradeCreated")
DISPUTED_TOPIC = next(k for k, v in _EVENT_TOPIC_TO_NAME.items() if v == "Disputed")
RESOLVED_CLEAN_TOPIC = next(k for k, v in _EVENT_TOPIC_TO_NAME.items() if v == "ResolvedClean")


def _uint_topic(val: int) -> str:
    return "0x" + int(val).to_bytes(32, "big").hex()


def _addr_topic(addr: str) -> str:
    return "0x" + addr.lower().replace("0x", "").rjust(64, "0")


def _make_trade(
    tid: int,
    seller: str,
    buyer: str,
    state: TradeState = TradeState.AwaitingEvidence,
    flagged: bool = False,
) -> Trade:
    zero32 = "0x" + "00" * 32
    return Trade(
        trade_id=tid,
        seller=seller,
        buyer=buyer,
        item_value=10**18,
        deposit_required=10**17,
        seller_deposit=10**17,
        buyer_deposit=10**17,
        nonce=zero32,
        seller_evidence_hash=zero32,
        buyer_evidence_hash=zero32,
        report_hash=zero32,
        risk_score=80 if flagged else 10,
        flagged=flagged,
        created_at=1700000000 + tid,
        evidence_deadline=1700003600,
        dispute_deadline=1700007200,
        state=state,
    )


class _MockEth:
    def __init__(self, logs_fn=None):
        self.latest_block = 0
        self.block_hashes: dict[int, str] = {}
        self.logs: list[dict[str, Any]] = []
        self._logs_fn = logs_fn
        self.get_logs_calls: list[dict[str, Any]] = []

    def set_head(self, blk: int, hash_prefix: str = "0xaa") -> None:
        self.latest_block = blk
        for b in range(0, blk + 1):
            if b not in self.block_hashes:
                self.block_hashes[b] = f"{hash_prefix}{b:062x}"

    def get_block(self, block_id: Any) -> dict[str, Any]:
        num = self.latest_block if block_id == "latest" else int(block_id)
        h = self.block_hashes.get(num, f"0x11{num:062x}")
        return {"number": num, "hash": h}

    def get_logs(self, filter_params: dict[str, Any]) -> list[dict[str, Any]]:
        self.get_logs_calls.append(dict(filter_params))
        if self._logs_fn is not None:
            return self._logs_fn(filter_params, self.logs)
        fb = int(filter_params["fromBlock"])
        tb = int(filter_params["toBlock"])
        return [lg for lg in self.logs if fb <= int(lg["blockNumber"]) <= tb]


class _MockIndexerClient:
    def __init__(self, cid: int = 31337, escrow_addr: str = "0x1111111111111111111111111111111111111111", logs_fn=None):
        self._cid = cid
        self.escrow = type("EscrowRef", (), {"address": escrow_addr})()
        self.eth = _MockEth(logs_fn=logs_fn)
        self.w3 = type("W3Ref", (), {"eth": self.eth})()
        self.trades: dict[int, Trade] = {}
        self.get_trade_calls: list[int] = []
        self.forced_next_trade_id: Optional[int] = None

    def chain_id(self) -> int:
        return self._cid

    def next_trade_id(self) -> int:
        if self.forced_next_trade_id is not None:
            return self.forced_next_trade_id
        return (max(self.trades.keys()) + 1) if self.trades else 1

    def get_trade(self, tid: int) -> Trade:
        self.get_trade_calls.append(tid)
        if tid in self.trades:
            return self.trades[tid]
        return _make_trade(
            tid,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            TradeState.Created,
        )


SELLER_A = "0x2222222222222222222222222222222222222222"
BUYER_B = "0x3333333333333333333333333333333333333333"
BUYER_C = "0x4444444444444444444444444444444444444444"
ESCROW_ADDR = "0x19d053c84941411888f5b9e40c854365fdd4eb00"


# ---------------------------------------------------------------------------
# 1. Deploy Block Resolution & Bounded Checkpoint / Restart Recovery
# ---------------------------------------------------------------------------

def test_deploy_block_resolution_and_checkpoint_restart(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("TRADE_INDEX_DEPLOY_BLOCK", raising=False)
    db = MarketplaceDB(tmp_path / "mkt.db")
    deps_dir = ROOT / "contracts" / "deployments"
    indexer = TradeIndexer(db, deployments_dir=deps_dir)

    assert indexer.resolve_deploy_block(43113) == 60980241
    assert indexer.resolve_deploy_block(31337) == 0

    monkeypatch.setenv("TRADE_INDEX_DEPLOY_BLOCK", "150")
    assert indexer.resolve_deploy_block(43113) == 150
    monkeypatch.delenv("TRADE_INDEX_DEPLOY_BLOCK", raising=False)

    # Bounded initial catch-up + simulated process restart
    client = _MockIndexerClient(cid=31337, escrow_addr=ESCROW_ADDR)
    client.eth.set_head(9100)
    client.trades[1] = _make_trade(1, SELLER_A, BUYER_B, TradeState.Resolved)
    client.trades[2] = _make_trade(2, SELLER_A, BUYER_C, TradeState.Disputed, flagged=True)
    client.eth.logs = [
        {
            "blockNumber": 120,
            "topics": [TRADE_CREATED_TOPIC, _uint_topic(1), _addr_topic(SELLER_A), _addr_topic(BUYER_B)],
        },
        {
            "blockNumber": 120,
            "topics": [RESOLVED_CLEAN_TOPIC, _uint_topic(1)],
        },
        {
            "blockNumber": 8500,
            "topics": [TRADE_CREATED_TOPIC, _uint_topic(2), _addr_topic(SELLER_A), _addr_topic(BUYER_C)],
        },
        {
            "blockNumber": 9095,
            "topics": [DISPUTED_TOPIC, _uint_topic(2), _addr_topic(BUYER_C)],
        },
    ]

    now = 1_700_000_000.0
    idx_proc1 = TradeIndexer(
        db,
        chunk_blocks=2000,
        max_chunks_per_tick=2,
        max_gap_heal_per_tick=0,  # verify log chunk progression before gap-heal
        reorg_lookback_blocks=12,
        clock=lambda: now,
    )
    r1 = idx_proc1.sync_tick(client, 31337, ESCROW_ADDR)
    assert r1["ok"] is True
    assert r1["chunksScanned"] == 2
    ckpt1 = db.get_trade_index_checkpoint(31337, ESCROW_ADDR)
    assert ckpt1 is not None
    assert ckpt1["last_scanned_block"] == 3999

    # Still lagging behind head -> isComplete MUST be False so frontend falls back cleanly
    q1 = db.query_trade_index(31337, ESCROW_ADDR, now_epoch=now)
    assert q1["isComplete"] is False
    assert q1["blockLag"] == 9100 - 3999

    # Simulate process restart with new TradeIndexer instance (chunks remaining: 3987..9100)
    idx_proc2 = TradeIndexer(
        db,
        chunk_blocks=2000,
        max_chunks_per_tick=5,
        reorg_lookback_blocks=12,
        clock=lambda: now + 5,
    )
    r2 = idx_proc2.sync_tick(client, 31337, ESCROW_ADDR)
    assert r2["ok"] is True
    assert client.eth.get_logs_calls[2]["fromBlock"] == 3999 - 12  # 12-block lookback overlap

    q2 = db.query_trade_index(31337, ESCROW_ADDR, now_epoch=now + 5)
    assert q2["isComplete"] is True
    assert q2["isStale"] is False
    assert q2["missingGapCount"] == 0
    assert q2["totalMatching"] == 2
    assert q2["summary"]["disputedCount"] == 1
    by_id = {it["tradeId"]: it for it in q2["items"]}
    assert by_id[1]["isTerminal"] is True  # finalized (> 12 blocks since resolved at 120)
    assert by_id[2]["lastKnownState"] == TradeState.Disputed.value
    assert by_id[2]["isTerminal"] is False


# ---------------------------------------------------------------------------
# 2. RPC 429 / Timeout Adaptive Chunk Halving & Graceful Error Isolation
# ---------------------------------------------------------------------------

def test_rpc_429_timeout_adaptive_chunk_halving(tmp_path: Path):
    db = MarketplaceDB(tmp_path / "mkt.db")
    attempts: list[int] = []

    def flaky_logs(fp: dict[str, Any], all_logs: list[dict[str, Any]]):
        span = int(fp["toBlock"]) - int(fp["fromBlock"]) + 1
        attempts.append(span)
        if span > 500:
            raise ChainError("429 Too Many Requests: query range exceeds limit")
        return [lg for lg in all_logs if int(fp["fromBlock"]) <= int(lg["blockNumber"]) <= int(fp["toBlock"])]

    client = _MockIndexerClient(cid=43113, escrow_addr=ESCROW_ADDR, logs_fn=flaky_logs)
    fuji_start = 60980241
    client.eth.set_head(fuji_start + 1200)
    client.trades[1] = _make_trade(1, SELLER_A, BUYER_B, TradeState.AwaitingEvidence)
    client.eth.logs = [
        {
            "blockNumber": fuji_start + 1100,
            "topics": [TRADE_CREATED_TOPIC, _uint_topic(1), _addr_topic(SELLER_A), _addr_topic(BUYER_B)],
        }
    ]

    indexer = TradeIndexer(
        db,
        deployments_dir=ROOT / "contracts" / "deployments",
        chunk_blocks=2000,
        max_chunks_per_tick=10,
        max_tick_seconds=5.0,
        clock=lambda: 1_700_000_000.0,
    )
    res = indexer.sync_tick(client, 43113, ESCROW_ADDR)
    assert res["ok"] is True
    # Halved 1201 -> 600 -> 300 (<= 500 succeeded)
    assert any(s > 500 for s in attempts)
    assert any(s <= 500 for s in attempts)

    q = db.query_trade_index(43113, ESCROW_ADDR, now_epoch=1_700_000_000.0)
    assert q["isComplete"] is True
    assert q["totalMatching"] == 1

    # Hard persistent failure marks error cleanly and flips isComplete=False without throwing
    def always_timeout(_fp, _logs):
        raise TimeoutError("RPC request timed out")

    client.eth._logs_fn = always_timeout
    client.eth.set_head(fuji_start + 1250)
    err_res = indexer.sync_tick(client, 43113, ESCROW_ADDR)
    assert err_res["ok"] is False
    q_err = db.query_trade_index(43113, ESCROW_ADDR, now_epoch=1_700_000_005.0)
    assert q_err["isComplete"] is False


# ---------------------------------------------------------------------------
# 3. nextTradeId Gap-Healing (Direct P2P /trade/new, Unbound, Dropped Logs)
# ---------------------------------------------------------------------------

def test_gap_healing_for_dropped_logs_and_unbound_p2p(tmp_path: Path):
    db = MarketplaceDB(tmp_path / "mkt.db")
    client = _MockIndexerClient(cid=31337, escrow_addr=ESCROW_ADDR)
    client.eth.set_head(50)
    for tid in (1, 2, 3):
        client.trades[tid] = _make_trade(tid, SELLER_A, BUYER_B if tid != 2 else BUYER_C, TradeState.Created)

    # RPC dropped TradeCreated log for trade #2 completely! Only #1 and #3 have logs.
    client.eth.logs = [
        {"blockNumber": 10, "topics": [TRADE_CREATED_TOPIC, _uint_topic(1), _addr_topic(SELLER_A), _addr_topic(BUYER_B)]},
        {"blockNumber": 30, "topics": [TRADE_CREATED_TOPIC, _uint_topic(3), _addr_topic(SELLER_A), _addr_topic(BUYER_B)]},
    ]

    indexer = TradeIndexer(db, clock=lambda: 1_700_000_000.0)
    res = indexer.sync_tick(client, 31337, ESCROW_ADDR)
    assert res["ok"] is True
    assert res["gapHealed"] == 1  # healed missing trade #2 via getTrade(2)

    q = db.query_trade_index(31337, ESCROW_ADDR, wallet=BUYER_C, now_epoch=1_700_000_000.0)
    assert q["isComplete"] is True
    assert q["missingGapCount"] == 0
    assert [it["tradeId"] for it in q["items"]] == [2]


# ---------------------------------------------------------------------------
# 4. Reorg Recovery (Event Vanishes & Trade Vanishes)
# ---------------------------------------------------------------------------

def test_reorg_recovery_event_disappears_and_trade_vanishes(tmp_path: Path):
    db = MarketplaceDB(tmp_path / "mkt.db")
    client = _MockIndexerClient(cid=31337, escrow_addr=ESCROW_ADDR)
    now = 1_700_000_000.0

    # Fork A up to block 110: trade #1 Attested, trade #2 Disputed at blk 108, trade #3 Created at blk 109
    client.eth.set_head(110, hash_prefix="0xaa")
    client.trades[1] = _make_trade(1, SELLER_A, BUYER_B, TradeState.Resolved)
    client.trades[2] = _make_trade(2, SELLER_A, BUYER_B, TradeState.Disputed, flagged=True)
    client.trades[3] = _make_trade(3, SELLER_A, BUYER_C, TradeState.Created)
    client.eth.logs = [
        {"blockNumber": 20, "topics": [TRADE_CREATED_TOPIC, _uint_topic(1), _addr_topic(SELLER_A), _addr_topic(BUYER_B)]},
        {"blockNumber": 25, "topics": [RESOLVED_CLEAN_TOPIC, _uint_topic(1)]},
        {"blockNumber": 50, "topics": [TRADE_CREATED_TOPIC, _uint_topic(2), _addr_topic(SELLER_A), _addr_topic(BUYER_B)]},
        {"blockNumber": 108, "topics": [DISPUTED_TOPIC, _uint_topic(2), _addr_topic(BUYER_B)]},
        {"blockNumber": 109, "topics": [TRADE_CREATED_TOPIC, _uint_topic(3), _addr_topic(SELLER_A), _addr_topic(BUYER_C)]},
    ]

    indexer = TradeIndexer(db, reorg_lookback_blocks=12, clock=lambda: now)
    indexer.sync_tick(client, 31337, ESCROW_ADDR)

    q_before = db.query_trade_index(31337, ESCROW_ADDR, now_epoch=now)
    assert q_before["summary"]["disputedCount"] == 1
    assert q_before["totalMatching"] == 3

    # Canonical Fork B reorgs blocks 107..112:
    # - block 110 hash changes (triggers hash-mismatch rollback)
    # - Trade #2's Disputed event at 108 disappears -> chain state reverts to Attested (2), unflagged
    # - Trade #3 created at 109 vanishes completely -> nextTradeId drops from 4 to 3
    for blk in range(107, 113):
        client.eth.block_hashes[blk] = f"0xbb{blk:062x}"
    client.eth.latest_block = 112
    del client.trades[3]
    client.trades[2] = _make_trade(2, SELLER_A, BUYER_B, TradeState.Attested, flagged=False)
    client.eth.logs = [
        lg for lg in client.eth.logs if int(lg["blockNumber"]) < 107
    ]

    r_reorg = indexer.sync_tick(client, 31337, ESCROW_ADDR)
    assert r_reorg["ok"] is True
    assert r_reorg["reorgDetected"] is True

    q_after = db.query_trade_index(31337, ESCROW_ADDR, now_epoch=now + 2)
    assert q_after["isComplete"] is True
    assert q_after["missingGapCount"] == 0
    assert q_after["indexedNextTradeId"] == 3
    assert q_after["totalMatching"] == 2
    assert q_after["summary"]["disputedCount"] == 0
    by_id = {it["tradeId"]: it for it in q_after["items"]}
    assert 3 not in by_id
    assert by_id[2]["lastKnownState"] == TradeState.Attested.value
    assert by_id[2]["flagged"] is False
    # Historical terminal trade #1 stayed cached cleanly untouched by recent reorg
    assert by_id[1]["isTerminal"] is True


# ---------------------------------------------------------------------------
# 5. Index Freshness (isStale / blockLag / ID gaps) & AutoAgent Non-Blocking
# ---------------------------------------------------------------------------

def test_freshness_staleness_and_non_blocking_auto_agent_tick(tmp_path: Path):
    db = MarketplaceDB(tmp_path / "mkt.db")
    client = _MockIndexerClient(cid=31337, escrow_addr=ESCROW_ADDR)
    client.eth.set_head(50)
    client.trades[1] = _make_trade(1, SELLER_A, BUYER_B, TradeState.AwaitingEvidence)
    client.eth.logs = [
        {"blockNumber": 10, "topics": [TRADE_CREATED_TOPIC, _uint_topic(1), _addr_topic(SELLER_A), _addr_topic(BUYER_B)]},
    ]

    t0 = 1_700_000_000.0
    indexer = TradeIndexer(db, max_stale_seconds=30.0, max_block_lag=20, clock=lambda: t0)
    indexer.sync_tick(client, 31337, ESCROW_ADDR)

    assert db.query_trade_index(31337, ESCROW_ADDR, max_stale_seconds=30.0, now_epoch=t0 + 10)["isComplete"] is True
    stale_q = db.query_trade_index(31337, ESCROW_ADDR, max_stale_seconds=30.0, now_epoch=t0 + 60)
    assert stale_q["isStale"] is True
    assert stale_q["isComplete"] is False

    # AutoAgent.tick() must complete reconcile, process_verify_jobs, and attest BEFORE sync_trade_index,
    # and a failing sync_trade_index MUST NOT break AutoAgent.tick() or lease release!
    call_order: list[str] = []

    def do_reconcile():
        call_order.append("reconcile")

    def do_verify_jobs():
        call_order.append("verify_jobs")

    def do_sync_index():
        call_order.append("sync_index")
        raise RuntimeError("simulated transient index outage")

    registry = UriRegistry(tmp_path / "uris.json", db=db)
    agent = AutoAgent(
        lambda: client,
        registry,
        lambda tid, uris: call_order.append(f"attest:{tid}"),
        reconcile=do_reconcile,
        process_verify_jobs=do_verify_jobs,
        sync_trade_index=do_sync_index,
        db=db,
        use_leader_lease=True,
        worker_id="w1",
    )
    ok = agent.tick(hold_lease=False)
    assert ok is True
    assert call_order == ["reconcile", "verify_jobs", "sync_index"]
    assert db.get_worker_lease("auto_agent_leader") is None or db.get_worker_lease("auto_agent_leader")["owner_id"] == ""


# ---------------------------------------------------------------------------
# 6. HTTP /trades/index: Auth, Query Arbitrary Wallet, Pagination & Kill-Switch
# ---------------------------------------------------------------------------

def _make_settings(tmp_path: Path):
    return svc.Settings(
        rpc_url="",
        chain_id=31337,
        escrow_address=ESCROW_ADDR,
        agent_private_key="",
        attest_api_key=STRONG_ATTEST_KEY,
        ops_jwt_secret=STRONG_JWT_SECRET,
        allow_local_hosts=True,
        data_dir=tmp_path / "data",
        deployments_dir=ROOT / "contracts" / "deployments",
        escrow_abi_path=OUT / "Escrow.sol" / "Escrow.json",
        enable_shared_auth=True,
        require_proxy_signature=True,
    )


def test_http_trades_index_auth_pagination_and_runtime_kill_switch(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("TRADE_INDEX_ENABLED", "true")
    assert is_trade_index_enabled() is True

    settings = _make_settings(tmp_path)
    app = svc.create_app(settings)
    db: MarketplaceDB = app.state.db

    # Populate 115 indexed trades directly via DB upserts (no hard 100 cap!)
    now = time.time()
    seller_a_addr = Account.from_key(ANVIL_SELLER).address.lower()
    entries = []
    for tid in range(1, 116):
        state = TradeState.Disputed.value if tid in (5, 115) else (
            TradeState.Attested.value if tid == 50 else TradeState.Resolved.value
        )
        entries.append(
            {
                "trade_id": tid,
                "seller": seller_a_addr,
                "buyer": BUYER_B if tid % 2 == 0 else BUYER_C,
                "last_known_state": state,
                "flagged": tid in (50, 115),
                "is_terminal": state == TradeState.Resolved.value,
                "created_block": 100 + tid,
                "last_event_block": 100 + tid,
                "last_verified_block": 220,
            }
        )
    db.upsert_trade_index_entries_and_checkpoint(
        31337,
        ESCROW_ADDR,
        entries,
        deploy_block=0,
        last_scanned_block=220,
        last_scanned_block_hash="0x" + "11" * 32,
        head_block_at_sync=220,
        highest_next_trade_id=116,
        sync_epoch=now,
    )

    tc = TestClient(app)

    # 1. Unauthenticated -> 401
    unauth = tc.get("/trades/index")
    assert unauth.status_code == 401

    # Issue Ops JWT via EIP-191 /auth/challenge -> /auth/verify for ANVIL_SELLER
    ch_res = tc.post(
        "/auth/challenge",
        json={"address": seller_a_addr, "chain_id": 31337},
        headers={"Origin": "http://localhost:3000"},
    )
    assert ch_res.status_code == 200, ch_res.text
    ch = ch_res.json()
    sig = Account.sign_message(encode_defunct(text=ch["message"]), private_key=ANVIL_SELLER).signature.hex()
    vr_res = tc.post(
        "/auth/verify",
        json={
            "address": seller_a_addr,
            "chain_id": 31337,
            "nonce": ch["nonce"],
            "signature": sig,
            "challenge_token": ch["challenge_token"],
        },
        headers={"Origin": "http://localhost:3000"},
    )
    assert vr_res.status_code == 200, vr_res.text
    token_a = vr_res.json()["ops_token"]
    auth_hdr = {"Authorization": f"Bearer {token_a}"}

    # 2. Validation errors
    assert tc.get("/trades/index?wallet=not-an-addr", headers=auth_hdr).status_code == 422
    assert tc.get("/trades/index?filter=bogus", headers=auth_hdr).status_code == 422
    assert tc.get("/trades/index?offset=-1", headers=auth_hdr).status_code == 422

    # 3. Authenticated Seller A queries own and BUYER_C's wallet (OD-P3-T3-02) with pagination (>100 support)
    r_p1 = tc.get(f"/trades/index?wallet={seller_a_addr}&offset=0&limit=100", headers=auth_hdr)
    assert r_p1.status_code == 200
    b1 = r_p1.json()
    assert b1["isComplete"] is True
    assert b1["isStale"] is False
    assert b1["totalMatching"] == 115
    assert len(b1["items"]) == 100

    r_p2 = tc.get(f"/trades/index?wallet={seller_a_addr}&offset=100&limit=100", headers=auth_hdr)
    assert r_p2.status_code == 200
    assert len(r_p2.json()["items"]) == 15

    # Query BUYER_C from SELLER_A session
    r_other = tc.get(f"/trades/index?wallet={BUYER_C}&limit=100", headers=auth_hdr)
    assert r_other.status_code == 200
    assert r_other.json()["totalMatching"] == 58

    # Filter disputed & active
    r_disp = tc.get("/trades/index?filter=disputed", headers=auth_hdr)
    assert r_disp.status_code == 200
    assert [it["tradeId"] for it in r_disp.json()["items"]] == [115, 5]

    r_act = tc.get("/trades/index?filter=active", headers=auth_hdr)
    assert r_act.status_code == 200
    assert [it["tradeId"] for it in r_act.json()["items"]] == [115, 50, 5]

    # 4. Runtime Kill-Switch `TRADE_INDEX_ENABLED=false` (without recreating app or touching NEXT_PUBLIC_*)
    monkeypatch.setenv("TRADE_INDEX_ENABLED", "false")
    assert is_trade_index_enabled() is False
    r_disabled = tc.get("/trades/index", headers=auth_hdr)
    assert r_disabled.status_code == 503
    assert r_disabled.json()["error_code"] == "TRADE_INDEX_DISABLED"


def test_active_filter_includes_unfinalized_recent_terminal_within_reorg_window(tmp_path: Path):
    """Trade moi chuyển Resolved trong cửa sổ 12 block (is_terminal=0) phải giữ trong filter=active
    để /admin không bỏ sót nếu reorg hoặc trễ 1-20 block."""
    db = MarketplaceDB(tmp_path / "lag_reverify.db")
    now = time.time()
    db.upsert_trade_index_entries_and_checkpoint(
        31337,
        ESCROW_ADDR,
        [
            {
                "trade_id": 1,
                "seller": SELLER_A,
                "buyer": BUYER_B,
                "last_known_state": TradeState.Resolved.value,
                "flagged": False,
                "is_terminal": True,
                "created_block": 10,
                "last_event_block": 20,
                "last_verified_block": 100,
            },
            {
                "trade_id": 2,
                "seller": SELLER_A,
                "buyer": BUYER_B,
                "last_known_state": TradeState.Resolved.value,
                "flagged": False,
                "is_terminal": False,  # resolved inside 12-block lookback window
                "created_block": 50,
                "last_event_block": 95,
                "last_verified_block": 100,
            },
            {
                "trade_id": 3,
                "seller": SELLER_A,
                "buyer": BUYER_C,
                "last_known_state": TradeState.Attested.value,
                "flagged": False,
                "is_terminal": False,
                "created_block": 60,
                "last_event_block": 90,
                "last_verified_block": 100,
            },
        ],
        deploy_block=0,
        last_scanned_block=100,
        last_scanned_block_hash="0x" + "11" * 32,
        head_block_at_sync=100,
        highest_next_trade_id=4,
        sync_epoch=now,
    )
    active_res = db.query_trade_index(31337, ESCROW_ADDR, filter_mode="active", now_epoch=now)
    assert [it["tradeId"] for it in active_res["items"]] == [3, 2]
    assert active_res["summary"]["activeCount"] == 2


# ---------------------------------------------------------------------------
# 7. Live Anvil Test: Direct createTrade + Reorg via evm_snapshot/evm_revert
# ---------------------------------------------------------------------------

def _load_artifact(name: str):
    f = OUT / f"{name}.sol" / f"{name}.json"
    if not f.exists():
        pytest.fail(f"Missing contract build artifact {f} — run `forge build` in contracts/")
    d = json.loads(f.read_text(encoding="utf-8"))
    return d["abi"], d["bytecode"]["object"]


def test_live_anvil_direct_p2p_trade_index_and_evm_reorg(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("TRADE_INDEX_ENABLED", "true")
    tok_abi, tok_bin = _load_artifact("CollectibleToken")
    esc_abi, esc_bin = _load_artifact("Escrow")

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
            time.sleep(0.1)
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
            rcpt = w3.eth.wait_for_transaction_receipt(w3.eth.send_raw_transaction(raw))
            assert rcpt["status"] == 1
            return rcpt

        tok_rcpt = send_tx("deployer", w3.eth.contract(abi=tok_abi, bytecode=tok_bin).constructor())
        token = w3.eth.contract(address=tok_rcpt["contractAddress"], abi=tok_abi)
        esc_rcpt = send_tx(
            "deployer",
            w3.eth.contract(abi=esc_abi, bytecode=esc_bin).constructor(
                token.address, accts["agent"].address, 60, 60, 60
            ),
        )
        escrow = w3.eth.contract(address=esc_rcpt["contractAddress"], abi=esc_abi)
        send_tx("deployer", token.functions.setEscrow(escrow.address))

        from chain import EscrowClient

        client = EscrowClient(rpc, escrow.address, esc_abi)
        db = MarketplaceDB(tmp_path / "anvil_idx.db")
        indexer = TradeIndexer(db, reorg_lookback_blocks=12)

        # Direct P2P createTrade (no listing_trades row!)
        item_val = Web3.to_wei(1, "ether")
        send_tx("seller", escrow.functions.createTrade(accts["buyer"].address, item_val))
        t1 = client.get_trade(1)
        send_tx("seller", escrow.functions.deposit(1), value=t1.deposit_required)
        send_tx("buyer", escrow.functions.deposit(1), value=t1.deposit_required)

        r1 = indexer.sync_tick(client, 31337, escrow.address)
        assert r1["ok"] is True
        q1 = db.query_trade_index(31337, escrow.address)
        assert q1["isComplete"] is True
        assert q1["totalMatching"] == 1
        assert q1["items"][0]["tradeId"] == 1
        assert q1["items"][0]["lastKnownState"] == TradeState.AwaitingEvidence.value

        # Snapshot chain before Trade #2, then create Trade #2 and index it
        snap_res = w3.provider.make_request("evm_snapshot", [])
        snap_id = snap_res["result"]
        send_tx("seller", escrow.functions.createTrade(accts["buyer"].address, item_val))
        indexer.sync_tick(client, 31337, escrow.address)
        q2 = db.query_trade_index(31337, escrow.address)
        assert q2["totalMatching"] == 2

        # Revert Anvil snapshot to simulate deep chain reorg wiping Trade #2
        rev_res = w3.provider.make_request("evm_revert", [snap_id])
        assert rev_res.get("result") is True

        r_reorg = indexer.sync_tick(client, 31337, escrow.address)
        assert r_reorg["ok"] is True
        assert r_reorg["reorgDetected"] is True
        q_reorg = db.query_trade_index(31337, escrow.address)
        assert q_reorg["isComplete"] is True
        assert q_reorg["missingGapCount"] == 0
        assert q_reorg["totalMatching"] == 1
        assert [it["tradeId"] for it in q_reorg["items"]] == [1]
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
