"""
test_phase1_shared_storage.py
-----------------------------
Regression, migration, cross-process worker isolation, read-only API, and read-path
optimization tests for Shared Marketplace Phase 1 (DEC-026).

Uses strictly synthetic test data and public local Anvil test keys — never touches
Owner demo data or real wallets.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import HTTPException
from fastapi.testclient import TestClient
from web3 import Web3

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import attest_service as svc
import evidence_check as ec
import synth
from auto_agent import AutoAgent, UriConflict, UriRegistry, listing_message
from chain import Trade, TradeState, evidence_hash_of
from db import MarketplaceDB
from listings import CreateListingRequest, CreatePurchaseRequest, DecisionRequest
from worker import AgentWorker

ROOT = svc.ROOT_DIR
OUT = ROOT / "contracts" / "out"

# Public well-known Anvil local test keys (chain 31337 only — never real keys)
ANVIL_DEPLOYER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ANVIL_AGENT = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
ANVIL_SELLER = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
ANVIL_BUYER = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"


def _unit_settings(tmp_path: Path, **kw) -> svc.Settings:
    defaults = dict(
        data_dir=tmp_path / "data",
        allow_local_hosts=True,
        allowed_hosts=["127.0.0.1", "localhost"],
        inspect_listing_images=False,
        require_proxy_signature=False,
        verify_chain_before_ttl_release=True,
    )
    defaults.update(kw)
    return svc.Settings(**defaults)


def _dummy_trade(
    tid: int = 1,
    *,
    state: TradeState = TradeState.AwaitingEvidence,
    seller: str = "0x1111111111111111111111111111111111111111",
    buyer: str = "0x2222222222222222222222222222222222222222",
    seller_uri: str = "ipfs://QmSeller",
    buyer_uri: str = "ipfs://QmBuyer",
) -> Trade:
    return Trade(
        trade_id=tid,
        seller=seller,
        buyer=buyer,
        item_value=10**18,
        deposit_required=3 * 10**17,
        seller_deposit=3 * 10**17,
        buyer_deposit=3 * 10**17,
        nonce="0x" + "11" * 32,
        seller_evidence_hash=evidence_hash_of(seller_uri),
        buyer_evidence_hash=evidence_hash_of(buyer_uri),
        report_hash="0x" + "00" * 32,
        risk_score=0,
        flagged=False,
        created_at=1000,
        evidence_deadline=1600,
        dispute_deadline=0,
        state=state,
    )


# ---------------------------------------------------------------------------
# 1. Safe, Idempotent Migration from Legacy JSON Stores to SQLite WAL
# ---------------------------------------------------------------------------

class TestLegacyJsonMigration:
    def test_migration_imports_all_legacy_stores_idempotently_and_preserves_backups(self, tmp_path):
        data_dir = tmp_path / "data"
        reports_dir = data_dir / "reports"
        reports_dir.mkdir(parents=True)

        uris_payload = {
            "1": {
                "listing": "ipfs://QmLegacyList1",
                "seller": "ipfs://QmLegacySeller1",
                "buyer": "ipfs://QmLegacyBuyer1",
            },
            "2": {"listing": "ipfs://QmLegacyList2"},
        }
        hashes_payload = [
            {"trade_id": 1, "role": "seller", "phash": "0123456789abcdef", "ts": 1700000001},
            {"trade_id": 1, "role": "buyer", "phash": "fedcba9876543210", "ts": 1700000002},
        ]
        report_1 = {"trade_id": 1, "report_hash": "0x" + "aa" * 32, "attested": True, "report": {"risk_score": 5}}
        report_2 = {"trade_id": 2, "report_hash": "0x" + "bb" * 32, "attested": True, "report": {"risk_score": 40}}

        uris_file = data_dir / "trade_uris.json"
        hashes_file = data_dir / "known_hashes.json"
        rep1_file = reports_dir / "1.json"
        rep2_file = reports_dir / "2.json"

        uris_file.write_text(json.dumps(uris_payload), encoding="utf-8")
        hashes_file.write_text(json.dumps(hashes_payload), encoding="utf-8")
        rep1_file.write_text(json.dumps(report_1), encoding="utf-8")
        rep2_file.write_text(json.dumps(report_2), encoding="utf-8")

        # Snapshot original legacy bytes before migration (backup integrity verification)
        before_bytes = {
            "uris": uris_file.read_bytes(),
            "hashes": hashes_file.read_bytes(),
            "rep1": rep1_file.read_bytes(),
            "rep2": rep2_file.read_bytes(),
        }

        # First startup migrates everything into SQLite WAL
        app = svc.create_app(_unit_settings(tmp_path))
        summary_1 = app.state.runtime.migration_summary
        assert summary_1 == {"uris": 4, "phashes": 2, "reports": 2, "errors": 0}

        client = TestClient(app)
        assert client.get("/trade/1/uris").json()["uris"] == uris_payload["1"]
        assert client.get("/trade/2/uris").json()["uris"] == uris_payload["2"]
        assert client.get("/report/1").json() == report_1
        assert client.get("/report/2").json() == report_2
        assert len(app.state.store) == 2
        hashes_excl, rows_excl = app.state.store.hashes_excluding(99)
        assert len(hashes_excl) == 2
        assert {r["phash"] for r in rows_excl} == {"0123456789abcdef", "fedcba9876543210"}

        # Legacy JSON files are NEVER deleted or mutated (clean rollback capability)
        assert uris_file.read_bytes() == before_bytes["uris"]
        assert hashes_file.read_bytes() == before_bytes["hashes"]
        assert rep1_file.read_bytes() == before_bytes["rep1"]
        assert rep2_file.read_bytes() == before_bytes["rep2"]

        # Update report in SQLite after migration; re-running migration must NOT overwrite newer SQLite data
        updated_report_1 = {**report_1, "report": {"risk_score": 7}}
        app.state.db.save_attest_report(1, "0x" + "cc" * 32, updated_report_1)

        # Second startup / migration run is strictly idempotent (0 new rows, 0 overwrites)
        app2 = svc.create_app(_unit_settings(tmp_path))
        summary_2 = app2.state.runtime.migration_summary
        assert summary_2 == {"uris": 0, "phashes": 0, "reports": 0, "errors": 0}
        assert len(app2.state.store) == 2
        assert TestClient(app2).get("/report/1").json() == updated_report_1
        migs = app2.state.db.get_storage_migrations()
        assert "legacy_json_v1" in migs
        assert migs["legacy_json_v1"]["items_imported"] == 8

    def test_migration_tolerates_corrupt_files_without_losing_valid_records(self, tmp_path):
        data_dir = tmp_path / "data"
        reports_dir = data_dir / "reports"
        reports_dir.mkdir(parents=True)

        (data_dir / "trade_uris.json").write_text("{not-valid-json", encoding="utf-8")
        (data_dir / "known_hashes.json").write_text(
            json.dumps([
                {"trade_id": 5, "role": "seller", "phash": "0011223344556677", "ts": 100},
                {"trade_id": "bad", "role": "buyer", "phash": "zzzz"},
            ]),
            encoding="utf-8",
        )
        (reports_dir / "bad.json").write_text(json.dumps({"trade_id": 0}), encoding="utf-8")
        (reports_dir / "3.json").write_text("{broken", encoding="utf-8")
        (reports_dir / "7.json").write_text(json.dumps({"trade_id": 7, "ok": True}), encoding="utf-8")

        db = MarketplaceDB(data_dir / "marketplace.db")
        res = db.migrate_legacy_json_stores(data_dir)
        assert res["uris"] == 0
        assert res["phashes"] == 1
        assert res["reports"] == 1
        assert res["errors"] >= 3
        assert db.get_attest_report(7) == {"trade_id": 7, "ok": True}
        assert db.count_known_phashes() == 1


# ---------------------------------------------------------------------------
# 2. Cross-Process Shared SQLite WAL Visibility (API <-> Worker)
# ---------------------------------------------------------------------------

class TestSharedStorageCrossProcessVisibility:
    def test_separate_api_and_worker_runtimes_share_state_via_sqlite_wal(self, tmp_path):
        api_runtime = svc.BackendRuntime(_unit_settings(tmp_path, worker_id="api-node-1"))
        worker_runtime = svc.BackendRuntime(_unit_settings(tmp_path, worker_id="worker-node-1"))

        # API writes URIs -> Worker sees them immediately & enforces first-write-wins conflict
        api_runtime.registry.set(10, "listing", "ipfs://QmList10")
        api_runtime.registry.set(10, "seller", "ipfs://QmSeller10")
        api_runtime.registry.set(10, "buyer", "ipfs://QmBuyer10")
        assert worker_runtime.registry.get(10) == {
            "listing": "ipfs://QmList10",
            "seller": "ipfs://QmSeller10",
            "buyer": "ipfs://QmBuyer10",
        }
        with pytest.raises(UriConflict):
            worker_runtime.registry.set(10, "listing", "ipfs://QmDifferent")

        # Worker writes pHashes, job status, and report -> API sees all immediately
        worker_runtime.store.add(10, "seller", "0123456789abcdef")
        worker_runtime.store.add(10, "buyer", "1122334455667788")
        assert len(api_runtime.store) == 2
        hashes, _ = api_runtime.store.hashes_excluding(11)
        assert len(hashes) == 2

        worker_runtime.agent._set(10, "analyzing", "checking evidence", attempts=1)
        st = api_runtime.agent.status_for(_dummy_trade(10))
        assert st["phase"] == "analyzing"
        assert st["detail"] == "checking evidence"
        assert st["attempts"] == 1

        worker_runtime.db.save_attest_report(10, "0x" + "dd" * 32, {"trade_id": 10, "attested": True})
        assert api_runtime.get_report(10) == {"trade_id": 10, "attested": True}


# ---------------------------------------------------------------------------
# 3. Single-Attester Leader Lease, Failover & Cross-Process Trade Lock
# ---------------------------------------------------------------------------

class TestWorkerLeaderLeaseAndTradeLocks:
    def test_only_single_leader_executes_reconcile_and_attest_with_clean_handover(self, tmp_path):
        db = MarketplaceDB(tmp_path / "data" / "marketplace.db")
        reg = UriRegistry(tmp_path / "data" / "trade_uris.json", db=db)
        reg.set(1, "listing", "ipfs://QmL")
        reg.set(1, "seller", "ipfs://QmS")
        reg.set(1, "buyer", "ipfs://QmB")

        now = [1000.0]
        verify_calls: list[str] = []
        reconcile_calls: list[str] = []

        class MockChainClient:
            agent_address = "0xAgent000000000000000000000000000000000001"
            def next_trade_id(self):
                return 2
            def get_trade(self, tid):
                return _dummy_trade(tid, seller_uri="ipfs://QmS", buyer_uri="ipfs://QmB")
            def agent_balance(self):
                return 10**18
            def onchain_agent(self):
                return self.agent_address

        mock_client = MockChainClient()

        w1 = AutoAgent(
            lambda: mock_client,
            reg,
            lambda tid, uris: verify_calls.append(f"w1:{tid}"),
            poll_seconds=5.0,
            reconcile=lambda: reconcile_calls.append("w1"),
            db=db,
            worker_id="worker-1",
            lease_ttl_seconds=30.0,
            clock=lambda: now[0],
        )
        w2 = AutoAgent(
            lambda: mock_client,
            reg,
            lambda tid, uris: verify_calls.append(f"w2:{tid}"),
            poll_seconds=5.0,
            reconcile=lambda: reconcile_calls.append("w2"),
            db=db,
            worker_id="worker-2",
            lease_ttl_seconds=30.0,
            clock=lambda: now[0],
        )

        # Worker 1 acquires leader lease and processes trade 1
        assert w1.tick(hold_lease=True) is True
        assert verify_calls == ["w1:1"]
        assert reconcile_calls == ["w1"]

        # Worker 2 tries while Worker 1 lease is active -> skipped completely (no duplicate attest)
        now[0] = 1010.0
        assert w2.tick(hold_lease=True) is False
        assert verify_calls == ["w1:1"]
        assert reconcile_calls == ["w1"]

        # Worker 1 stops cleanly -> releases lease; Worker 2 takes over immediately
        w1.stop()
        now[0] = 1012.0
        assert w2.tick(hold_lease=True) is True
        assert reconcile_calls == ["w1", "w2"]
        # Trade 1 already marked attested in shared SQLite/chain; verify not duplicated
        w2.stop()

    def test_standby_worker_takes_over_after_crashed_leader_lease_expires(self, tmp_path):
        db = MarketplaceDB(tmp_path / "data" / "marketplace.db")
        reg = UriRegistry(tmp_path / "data" / "trade_uris.json", db=db)
        now = [2000.0]

        class EmptyClient:
            def next_trade_id(self):
                return 1

        w1 = AutoAgent(
            lambda: EmptyClient(), reg, lambda tid, u: None,
            db=db, worker_id="leader-crash", lease_ttl_seconds=20.0, clock=lambda: now[0],
        )
        w2 = AutoAgent(
            lambda: EmptyClient(), reg, lambda tid, u: None,
            db=db, worker_id="standby-takeover", lease_ttl_seconds=20.0, clock=lambda: now[0],
        )

        # Leader acquires lease and simulates hard crash (no stop())
        assert w1.tick(hold_lease=True) is True
        assert db.get_worker_lease("auto_agent_leader")["owner_id"] == "leader-crash"

        # Before expiry -> standby blocked
        now[0] = 2019.0
        assert w2.tick(hold_lease=True) is False

        # After expiry -> standby acquires lease and becomes leader
        now[0] = 2021.0
        assert w2.tick(hold_lease=True) is True
        assert db.get_worker_lease("auto_agent_leader")["owner_id"] == "standby-takeover"
        w2.stop()

    def test_cross_process_trade_lock_blocks_concurrent_verification(self, tmp_path):
        class MockClient:
            agent_address = "0xAgent"
            def chain_id(self):
                return 31337
            def get_trade(self, tid):
                return _dummy_trade(tid)

        r1 = svc.BackendRuntime(_unit_settings(tmp_path, worker_id="proc-1"), client=MockClient())
        r2 = svc.BackendRuntime(_unit_settings(tmp_path, worker_id="proc-2"), client=MockClient())

        assert r1.db.acquire_trade_lock(42, "proc-1:tx", ttl_seconds=300.0) is True
        try:
            with pytest.raises(HTTPException) as exc:
                r2.run_verification(svc.VerifyRequest(
                    trade_id=42,
                    listing_image_url="ipfs://QmL",
                    seller_evidence_url="ipfs://QmSeller",
                    buyer_evidence_url="ipfs://QmBuyer",
                ))
            assert exc.value.status_code == 409
        finally:
            r1.db.release_trade_lock(42, "proc-1:tx")

    def test_worker_startup_requires_rpc_and_agent_key(self, tmp_path):
        w = AgentWorker(settings=_unit_settings(tmp_path, rpc_url="http://127.0.0.1:8545", agent_private_key=None))
        with pytest.raises(RuntimeError, match="AGENT_PRIVATE_KEY"):
            w.validate_startup_config()

    def test_worker_cli_main_exits_nonzero_when_missing_required_config(self, tmp_path, monkeypatch):
        import worker as worker_mod
        monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
        monkeypatch.setenv("RPC_URL", "http://127.0.0.1:8545")
        monkeypatch.setenv("AGENT_PRIVATE_KEY", "")
        assert worker_mod.main(["--once"]) == 1

    def test_worker_fail_closed_on_insecure_fuji_surfaces_health_error_on_api(self, tmp_path):
        class MockInsecureFujiClient:
            attest_called = False
            agent_address = "0xAgent000000000000000000000000000000000001"
            def chain_id(self):
                return 43113
            def next_trade_id(self):
                return 2
            def get_trade(self, tid):
                return _dummy_trade(tid, seller_uri="ipfs://QmS", buyer_uri="ipfs://QmB")
            def send_attest(self, *a, **kw):
                self.attest_called = True
                return "0xFakeTx"
            @property
            def escrow(self):
                return type("E", (), {"address": "0x19D053c84941411888f5b9e40c854365fdd4eb00"})()

        mock_client = MockInsecureFujiClient()
        # Insecure on Fuji: attest_api_key=None
        worker_settings = _unit_settings(
            tmp_path,
            attest_api_key=None,
            allow_local_hosts=False,
            enforce_evidence_hash=True,
            require_proxy_signature=False,
            worker_id="fuji-worker",
        )
        worker = AgentWorker(settings=worker_settings, client=mock_client)
        worker.runtime.registry.set(1, "listing", "ipfs://QmL")
        worker.runtime.registry.set(1, "seller", "ipfs://QmS")
        worker.runtime.registry.set(1, "buyer", "ipfs://QmB")

        worker.run_once(hold_lease=True)
        assert mock_client.attest_called is False

        # Separate API sees worker's INSECURE_CONFIG error through shared SQLite
        api_settings = _unit_settings(
            tmp_path,
            attest_api_key=None,
            allow_local_hosts=False,
            enforce_evidence_hash=True,
            require_proxy_signature=False,
            worker_id="fuji-api",
        )
        api_app = svc.create_app(api_settings, client=mock_client)
        health = TestClient(api_app).get("/health").json()
        assert "INSECURE_CONFIG" in (health.get("agent_error") or "")
        assert health["security_toggles"]["insecure_for_chain"] is True
        worker.stop()


# ---------------------------------------------------------------------------
# 4. Read-Path Optimization: GET /listings Pure Read + Reconcile TTL Semantics
# ---------------------------------------------------------------------------

class TestListingsReadPathOptimization:
    def test_get_listings_skips_ttl_write_and_rpc_while_reconcile_preserves_chain_guarded_ttl(self, tmp_path):
        now = [1_700_000_000]
        seller = "0x1111111111111111111111111111111111111111"
        buyer = "0x2222222222222222222222222222222222222222"
        escrow_addr = "0x9999999999999999999999999999999999999999"

        class CountingClient:
            def __init__(self):
                self.next_calls = 0
                self.trade_calls = 0
                self.unbound_trade_exists = False
                self.escrow = type("E", (), {"address": escrow_addr})()

            def chain_id(self):
                return 31337

            def next_trade_id(self):
                self.next_calls += 1
                return 2 if self.unbound_trade_exists else 1

            def get_trade(self, tid):
                self.trade_calls += 1
                if self.unbound_trade_exists and tid == 1:
                    return Trade(
                        trade_id=1,
                        seller=seller,
                        buyer=buyer,
                        item_value=10**18,
                        deposit_required=3 * 10**17,
                        seller_deposit=0,
                        buyer_deposit=0,
                        nonce="0x" + "22" * 32,
                        seller_evidence_hash="0x" + "00" * 32,
                        buyer_evidence_hash="0x" + "00" * 32,
                        report_hash="0x" + "00" * 32,
                        risk_score=0,
                        flagged=False,
                        created_at=now[0] - 10,
                        evidence_deadline=0,
                        dispute_deadline=0,
                        state=TradeState.Created,
                    )
                return _dummy_trade(tid, seller="0x" + "00" * 20)

        chain_client = CountingClient()
        settings = _unit_settings(
            tmp_path,
            reservation_ttl_seconds=1800,
            verify_chain_before_ttl_release=True,
        )
        app = svc.create_app(settings, client=chain_client)
        mkt = app.state.marketplace
        mkt.clock = lambda: now[0]

        # Create listing (qty=1), request purchase, seller accepts -> RESERVED for 1800s
        listing = mkt.create_listing(
            seller,
            31337,
            escrow_addr,
            CreateListingRequest(
                sku="PHASE1-LEGO-01",
                category="LEGO",
                title="Phase 1 Optimization Test Set",
                description="Pure read test",
                price_wei=str(10**18),
                condition="SEALED_NEW",
                quantity_total=1,
                images=[{"uri": "ipfs://QmPhase1TestImg001", "is_primary": True}],
            ),
        )
        req = mkt.create_purchase_request(
            buyer,
            31337,
            escrow_addr,
            listing["id"],
            CreatePurchaseRequest(quantity=1, buyer_note="buy"),
            client=chain_client,
        )
        accepted = mkt.decide_request(
            seller,
            31337,
            escrow_addr,
            req["id"],
            DecisionRequest(action="accept"),
            client=chain_client,
        )
        assert accepted["status"] == "ACCEPTED"
        assert accepted["reservation_expires_at"] == now[0] + 1800

        api = TestClient(app)

        # Instrument expire_stale_reservations, write_tx, and RPC calls during GET /listings
        expire_calls = 0
        orig_expire = mkt.expire_stale_reservations

        def tracked_expire(*a, **kw):
            nonlocal expire_calls
            expire_calls += 1
            return orig_expire(*a, **kw)

        write_tx_calls = 0
        orig_write_tx = app.state.db.write_tx

        def tracked_write_tx():
            nonlocal write_tx_calls
            write_tx_calls += 1
            return orig_write_tx()

        mkt.expire_stale_reservations = tracked_expire
        app.state.db.write_tx = tracked_write_tx

        # Phase A: Before TTL expires (even with active ACCEPTED reservation), GET /listings is 100% pure read
        now[0] += 1799
        rpc_before = (chain_client.next_calls, chain_client.trade_calls)
        for _ in range(3):
            r_active = api.get("/listings", params={"status": "ALL"})
            assert r_active.status_code == 200
            assert r_active.json()["items"][0]["status"] == "RESERVED"
            assert r_active.json()["items"][0]["quantity_available"] == 0
        assert expire_calls == 0
        assert write_tx_calls == 0
        assert (chain_client.next_calls, chain_client.trade_calls) == rpc_before

        # Phase B: Past TTL with NO writes, NO detail GET /listings/{id}, NO reconcile()
        # Case B1: Unbound on-chain trade exists -> verify_chain_before_ttl_release keeps RESERVED
        now[0] += 10
        chain_client.unbound_trade_exists = True
        r_blocked = api.get("/listings", params={"status": "ACTIVE"})
        assert r_blocked.status_code == 200 and r_blocked.json()["total"] == 0
        assert api.get("/listings", params={"status": "ALL"}).json()["items"][0]["status"] == "RESERVED"

        # Case B2: No unbound trade on-chain -> GET /listings returns ACTIVE & restored stock immediately!
        chain_client.unbound_trade_exists = False
        expire_calls = 0
        write_tx_calls = 0
        r_released = api.get("/listings", params={"status": "ACTIVE"})
        assert r_released.status_code == 200
        assert r_released.json()["total"] == 1
        released_item = r_released.json()["items"][0]
        assert released_item["id"] == listing["id"]
        assert released_item["status"] == "ACTIVE"
        assert released_item["quantity_reserved"] == 0
        assert released_item["quantity_available"] == 1
        assert expire_calls == 1
        assert write_tx_calls == 1

        # Phase C: Subsequent GET /listings polls return strictly to 0-write / 0-RPC pure reads
        rpc_steady = (chain_client.next_calls, chain_client.trade_calls)
        expire_calls = 0
        write_tx_calls = 0
        for _ in range(5):
            r_poll = api.get("/listings")
            assert r_poll.status_code == 200 and r_poll.json()["total"] == 1
        assert expire_calls == 0
        assert write_tx_calls == 0
        assert (chain_client.next_calls, chain_client.trade_calls) == rpc_steady

        # Phase D: Worker reconcile clears expired reservation proactively -> GET /listings does 0 writes/0 RPC
        mkt.expire_stale_reservations = orig_expire
        app.state.db.write_tx = orig_write_tx
        req2 = mkt.create_purchase_request(
            buyer,
            31337,
            escrow_addr,
            listing["id"],
            CreatePurchaseRequest(quantity=1, buyer_note="buy again"),
            client=chain_client,
        )
        assert mkt.decide_request(
            seller,
            31337,
            escrow_addr,
            req2["id"],
            DecisionRequest(action="accept"),
            client=chain_client,
        )["status"] == "ACCEPTED"
        now[0] += 1805

        rec_worker = mkt.reconcile(client=chain_client, chain_id=31337, escrow_address=escrow_addr)
        assert rec_worker["expired_released"] == 1

        mkt.expire_stale_reservations = tracked_expire
        app.state.db.write_tx = tracked_write_tx
        rpc_after_worker = (chain_client.next_calls, chain_client.trade_calls)
        expire_calls = 0
        write_tx_calls = 0
        active_items = api.get("/listings", params={"status": "ACTIVE"}).json()["items"]
        assert len(active_items) == 1
        assert active_items[0]["id"] == listing["id"]
        assert active_items[0]["quantity_reserved"] == 0
        assert active_items[0]["quantity_available"] == 1
        assert expire_calls == 0
        assert write_tx_calls == 0
        assert (chain_client.next_calls, chain_client.trade_calls) == rpc_after_worker

        mkt.expire_stale_reservations = orig_expire
        app.state.db.write_tx = orig_write_tx

    def test_get_listings_offline_client_fails_safe_without_write_or_log_churn(self, tmp_path):
        now = [1_700_000_000]
        seller = "0x1111111111111111111111111111111111111111"
        buyer = "0x2222222222222222222222222222222222222222"
        escrow_addr = "0x9999999999999999999999999999999999999999"

        app = svc.create_app(_unit_settings(tmp_path, escrow_address=escrow_addr, reservation_ttl_seconds=60, verify_chain_before_ttl_release=True))
        mkt = app.state.marketplace
        mkt.clock = lambda: now[0]

        listing = mkt.create_listing(
            seller,
            31337,
            escrow_addr,
            CreateListingRequest(
                sku="OFFLINE-TTL-01",
                category="COIN",
                title="Offline Safe TTL Listing",
                price_wei=str(10**18),
                condition="GRADED",
                quantity_total=1,
                images=[{"uri": "ipfs://QmOfflineCoin01", "is_primary": True}],
            ),
        )
        req = mkt.create_purchase_request(buyer, 31337, escrow_addr, listing["id"], CreatePurchaseRequest(quantity=1))
        mkt.decide_request(seller, 31337, escrow_addr, req["id"], DecisionRequest(action="accept"))

        now[0] += 120
        expire_calls = 0
        orig_expire = mkt.expire_stale_reservations

        def tracked_expire(*a, **kw):
            nonlocal expire_calls
            expire_calls += 1
            return orig_expire(*a, **kw)

        mkt.expire_stale_reservations = tracked_expire
        api = TestClient(app)
        resp = api.get("/listings", params={"status": "ALL"})
        assert resp.status_code == 200
        assert resp.json()["items"][0]["status"] == "RESERVED"
        assert resp.json()["items"][0]["quantity_reserved"] == 1
        assert expire_calls == 0
        mkt.expire_stale_reservations = orig_expire


# ---------------------------------------------------------------------------
# 5. Real Anvil E2E: Keyless Public API + Isolated Agent Worker Sharing WAL DB
# ---------------------------------------------------------------------------

def _ocr_ok() -> bool:
    try:
        ec.pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def _artifact(name: str):
    f = OUT / f"{name}.sol" / f"{name}.json"
    if not f.exists():
        pytest.skip(f"Missing {f} — run `forge build` in contracts/")
    d = json.loads(f.read_text(encoding="utf-8"))
    return d["abi"], d["bytecode"]["object"]


class _AnvilChain:
    def __init__(self, url: str):
        self.w3 = Web3(Web3.HTTPProvider(url))
        self.acct = {
            k: self.w3.eth.account.from_key(v)
            for k, v in dict(
                deployer=ANVIL_DEPLOYER,
                agent=ANVIL_AGENT,
                seller=ANVIL_SELLER,
                buyer=ANVIL_BUYER,
            ).items()
        }
        tok_abi, tok_bin = _artifact("CollectibleToken")
        esc_abi, esc_bin = _artifact("Escrow")
        self.token = self._deploy(tok_abi, tok_bin)
        self.escrow = self._deploy(esc_abi, esc_bin, self.token.address, self.acct["agent"].address, 60, 60, 60)
        self.tx("deployer", self.token.functions.setEscrow(self.escrow.address))

    def _deploy(self, abi, bytecode, *args):
        c = self.w3.eth.contract(abi=abi, bytecode=bytecode)
        r = self.tx("deployer", c.constructor(*args))
        return self.w3.eth.contract(address=r["contractAddress"], abi=abi)

    def tx(self, who: str, fn, value: int = 0):
        a = self.acct[who]
        t = fn.build_transaction({
            "from": a.address,
            "value": value,
            "nonce": self.w3.eth.get_transaction_count(a.address, "pending"),
        })
        h = self.w3.eth.send_raw_transaction(a.sign_transaction(t).raw_transaction)
        r = self.w3.eth.wait_for_transaction_receipt(h)
        assert r["status"] == 1
        return r

    def trade(self, tid: int):
        return self.escrow.functions.getTrade(tid).call()


@pytest.mark.skipif(ec.pytesseract is None or not _ocr_ok(), reason="Tesseract not installed")
class TestSplitApiAndWorkerAnvilE2E:
    def test_keyless_api_readonly_endpoints_and_isolated_worker_attest_e2e(self, anvil, file_server, tmp_path):
        chain = _AnvilChain(anvil)
        shared_data_dir = tmp_path / "shared_data"
        abi_path = OUT / "Escrow.sol" / "Escrow.json"

        # 1. Public API configured WITHOUT AGENT_PRIVATE_KEY and AGENT_AUTO=False
        api_settings = svc.Settings(
            rpc_url=anvil,
            agent_private_key=None,
            escrow_address=chain.escrow.address,
            escrow_abi_path=abi_path,
            data_dir=shared_data_dir,
            ipfs_gateway=file_server[1] + "/",
            allow_local_hosts=True,
            agent_auto=False,
            inspect_listing_images=False,
            require_proxy_signature=False,
            worker_id="public-api",
        )
        api_app = svc.create_app(api_settings)
        api = TestClient(api_app)

        # Health works in read-only mode without AGENT_PRIVATE_KEY
        h0 = api.get("/health").json()
        assert h0["ok"] is True
        assert h0["chain_id"] == 31337
        assert h0["escrow"].lower() == chain.escrow.address.lower()
        assert h0["agent_signer_configured"] is False
        assert h0["agent_running"] is False
        assert h0["agent_worker_active"] is False

        # Marketplace flow: create listing -> purchase request -> accept -> createTrade -> bind-trade & sync (NO AGENT KEY!)
        seller_addr = chain.acct["seller"].address
        buyer_addr = chain.acct["buyer"].address
        item_val = Web3.to_wei(1, "ether")

        r_list = api.post(
            "/listings",
            headers={"X-Authenticated-Wallet": seller_addr},
            json={
                "sku": "SPLIT-WORKER-01",
                "category": "FIGURE",
                "title": "Split Worker Collectible",
                "description": "E2E test",
                "price_wei": str(item_val),
                "condition": "SEALED_NEW",
                "quantity_total": 1,
                "images": [{"uri": "ipfs://QmSplitItem01", "is_primary": True}],
            },
        )
        assert r_list.status_code == 201
        listing_id = r_list.json()["id"]

        r_req = api.post(
            f"/listings/{listing_id}/requests",
            headers={"X-Authenticated-Wallet": buyer_addr},
            json={"quantity": 1, "buyer_note": "split test"},
        )
        assert r_req.status_code == 201
        req_id = r_req.json()["id"]

        r_acc = api.post(
            f"/requests/{req_id}/decision",
            headers={"X-Authenticated-Wallet": seller_addr},
            json={"action": "accept"},
        )
        assert r_acc.status_code == 200

        # Seller creates trade on-chain, binds and syncs through keyless Public API
        create_rcpt = chain.tx("seller", chain.escrow.functions.createTrade(buyer_addr, item_val))
        tid = chain.escrow.functions.nextTradeId().call() - 1
        tx_hash_hex = Web3.to_hex(create_rcpt["transactionHash"])

        r_bind = api.post(
            f"/requests/{req_id}/bind-trade",
            headers={"X-Authenticated-Wallet": seller_addr},
            json={"tx_hash": tx_hash_hex, "trade_id": tid},
        )
        assert r_bind.status_code == 200, r_bind.text
        assert r_bind.json()["trade_id"] == tid

        r_sync = api.post(f"/trades/{tid}/sync", headers={"X-Authenticated-Wallet": seller_addr})
        assert r_sync.status_code == 200, r_sync.text
        assert r_sync.json()["synced_state"] == "Created"

        # Read-only trade & QR endpoints work without AGENT_PRIVATE_KEY
        r_trade = api.get(f"/trade/{tid}")
        assert r_trade.status_code == 200
        assert r_trade.json()["trade_id"] == tid

        r_qr = api.get(f"/trade/{tid}/nonce-qr.png")
        assert r_qr.status_code == 200
        assert r_qr.headers["content-type"] == "image/png"
        assert r_qr.content.startswith(b"\x89PNG")

        # Both parties deposit & submit real QR-nonce evidence
        dep = chain.trade(tid)[3]
        chain.tx("seller", chain.escrow.functions.deposit(tid), dep)
        chain.tx("buyer", chain.escrow.functions.deposit(tid), dep)

        nonce_hex = Web3.to_hex(chain.trade(tid)[6]).lower()
        short = ec.short_nonce(nonce_hex)
        root, _ = file_server
        item = synth.make_item(515)
        listing_path = synth.write_image(item, str(root / f"split_l_{tid}.jpg"))
        seller_img = synth.photograph(item, 516, short)
        buyer_img = synth.photograph(item, 517, short)
        seller_path = synth.write_image(seller_img, str(root / f"split_s_{tid}.jpg"))
        buyer_path = synth.write_image(buyer_img, str(root / f"split_b_{tid}.jpg"))

        uri_l = f"ipfs://{Path(listing_path).name}"
        uri_s = f"ipfs://{Path(seller_path).name}"
        uri_b = f"ipfs://{Path(buyer_path).name}"

        chain.tx("seller", chain.escrow.functions.submitEvidence(tid, bytes.fromhex(evidence_hash_of(uri_s)[2:])))
        chain.tx("buyer", chain.escrow.functions.submitEvidence(tid, bytes.fromhex(evidence_hash_of(uri_b)[2:])))

        # Register all 3 URIs via keyless Public API
        msg = listing_message(31337, chain.escrow.address, tid, uri_l)
        sig = Account.sign_message(encode_defunct(text=msg), ANVIL_SELLER).signature.hex()
        assert api.post(f"/trade/{tid}/uris", json={"role": "listing", "uri": uri_l, "signature": sig}).status_code == 200
        assert api.post(f"/trade/{tid}/uris", json={"role": "seller", "uri": uri_s}).status_code == 200
        assert api.post(f"/trade/{tid}/uris", json={"role": "buyer", "uri": uri_b}).status_code == 200

        # Manual attest on keyless Public API MUST fail 503 (API holds no signing key)
        r_manual = api.post("/verify-evidence", json={
            "trade_id": tid,
            "listing_image_url": uri_l,
            "seller_evidence_url": uri_s,
            "buyer_evidence_url": uri_b,
            "dry_run": False,
        })
        assert r_manual.status_code == 503
        assert "AGENT_PRIVATE_KEY" in str(r_manual.json()["detail"])

        # 2. Isolated standalone AgentWorker WITH AGENT_PRIVATE_KEY runs against the SAME shared SQLite WAL
        worker_settings = svc.Settings(
            rpc_url=anvil,
            agent_private_key=ANVIL_AGENT,
            escrow_address=chain.escrow.address,
            escrow_abi_path=abi_path,
            data_dir=shared_data_dir,
            ipfs_gateway=file_server[1] + "/",
            allow_local_hosts=True,
            worker_id="isolated-worker-1",
            worker_lease_ttl_seconds=60.0,
        )
        worker = AgentWorker(settings=worker_settings)
        standby_settings = svc.Settings(
            rpc_url=anvil,
            agent_private_key=ANVIL_AGENT,
            escrow_address=chain.escrow.address,
            escrow_abi_path=abi_path,
            data_dir=shared_data_dir,
            ipfs_gateway=file_server[1] + "/",
            allow_local_hosts=True,
            worker_id="isolated-worker-2",
            worker_lease_ttl_seconds=60.0,
        )
        worker_standby = AgentWorker(settings=standby_settings)
        try:
            assert worker.run_once(hold_lease=True) is True

            # Competing standby worker CANNOT acquire lease while primary holds it
            assert worker_standby.run_once(hold_lease=True) is False

            # Verify on-chain state transitioned to Attested
            onchain = chain.trade(tid)
            assert TradeState(onchain[15]) == TradeState.Attested
            onchain_report_hash = Web3.to_hex(onchain[9]).lower()

            # Verify keyless Public API immediately serves report, live worker health, and agent status!
            rep_resp = api.get(f"/report/{tid}")
            assert rep_resp.status_code == 200
            rep_body = rep_resp.json()
            assert rep_body["attested"] is True
            assert Web3.to_hex(Web3.keccak(rep_body["report_json"].encode("utf-8"))).lower() == onchain_report_hash

            st_resp = api.get(f"/agent/status/{tid}")
            assert st_resp.status_code == 200
            assert st_resp.json()["enabled"] is True
            assert st_resp.json()["phase"] == "attested"

            h1 = api.get("/health").json()
            assert h1["ok"] is True
            assert h1["agent_signer_configured"] is False
            assert h1["agent_running"] is True
            assert h1["agent_worker_active"] is True
            assert h1["agent"].lower() == chain.acct["agent"].address.lower()
            assert h1["agent_matches_contract"] is True
            assert h1["known_hashes"] == 2
        finally:
            worker.stop()
            worker_standby.stop()

        # After primary worker stops gracefully, API health reflects agent_running=False
        h2 = api.get("/health").json()
        assert h2["agent_running"] is False
        assert h2["agent_worker_active"] is False

        # Standby can now cleanly acquire lease on a one-shot tick without re-attesting already attested trade
        assert worker_standby.run_once(hold_lease=False) is True
