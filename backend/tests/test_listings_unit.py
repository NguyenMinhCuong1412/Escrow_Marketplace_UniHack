"""
Unit tests cho Marketplace Backend & Database (MKT-002).
Kiểm tra: SQLite WAL, CRUD, tìm kiếm/lọc/phân trang, SKU duplicate vs image warning,
giữ chỗ nguyên tử (concurrency), TTL 30 phút, bảo vệ Escrow đã tạo, auth/replay/rate-limit,
kiểm tra từ chối bind-trade không hợp lệ và persistence sau khi restart backend.
"""

from __future__ import annotations

import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
from web3 import Web3

import attest_service as svc
from chain import ChainError, ChainTxNotFound, ChainValidationError, CreatedTradeReceipt, Trade, TradeState
from listings import compute_proxy_signature

SELLER_A = "0x1111111111111111111111111111111111111111"
SELLER_B = "0x2222222222222222222222222222222222222222"
BUYER_1 = "0x3333333333333333333333333333333333333333"
BUYER_2 = "0x4444444444444444444444444444444444444444"
STRANGER = "0x5555555555555555555555555555555555555555"

ESCROW_ADDR = "0x19d053c84941411888f5b9e40c854365fdd4eb00"
API_KEY = "test-api-key"


def _settings(tmp_path, **kw):
    defaults = dict(
        data_dir=tmp_path / "data",
        escrow_address=ESCROW_ADDR,
        attest_api_key=API_KEY,
        allowed_hosts=["127.0.0.1", "gateway.pinata.cloud"],
        allow_local_hosts=True,
        cors_origins=["http://localhost:3000"],
        reservation_ttl_seconds=1800,
    )
    defaults.update(kw)
    return svc.Settings(**defaults)


def _headers(wallet: str, api_key: str = API_KEY, **extra) -> dict[str, str]:
    h = {"X-Authenticated-Wallet": wallet}
    if api_key is not None:
        h["X-API-Key"] = api_key
    h.update(extra)
    return h


def _signed_headers(
    method: str,
    path: str,
    wallet: str,
    nonce: str,
    ts: int,
    chain_id: int = 31337,
    api_key: str = API_KEY,
) -> dict[str, str]:
    sig = compute_proxy_signature(api_key, method, path, wallet, chain_id, ts, nonce)
    return {
        "X-API-Key": api_key,
        "X-Authenticated-Wallet": wallet,
        "X-Authenticated-Chain-Id": str(chain_id),
        "X-Auth-Timestamp": str(ts),
        "X-Auth-Nonce": nonce,
        "X-Auth-Signature": sig,
    }


def _listing_payload(**over) -> dict:
    base = {
        "sku": "LEGO-10305",
        "category": "LEGO",
        "title": "LEGO Lion Knights Castle 10305 Sealed",
        "description": "Bộ LEGO chính hãng nguyên seal hộp đẹp.",
        "price_wei": str(Web3.to_wei(2, "ether")),
        "condition": "SEALED_NEW",
        "quantity_total": 2,
        "images": [
            {"uri": "ipfs://QmPrimaryLego10305", "is_primary": True},
            {"uri": "ipfs://QmBoxBackLego10305", "is_primary": False},
        ],
    }
    base.update(over)
    return base


class _FakeClock:
    def __init__(self, start: int = 1_700_000_000):
        self.now = start

    def __call__(self) -> int:
        return self.now

    def advance(self, seconds: int) -> int:
        self.now += seconds
        return self.now


def _make_trade(
    trade_id: int,
    seller: str = SELLER_A,
    buyer: str = BUYER_1,
    item_value: int = Web3.to_wei(2, "ether"),
    state: TradeState = TradeState.Created,
) -> Trade:
    return Trade(
        trade_id=trade_id,
        seller=seller,
        buyer=buyer,
        item_value=item_value,
        deposit_required=item_value * 3000 // 10000,
        seller_deposit=0,
        buyer_deposit=0,
        nonce="0x" + f"{trade_id:02x}" * 32,
        seller_evidence_hash="0x" + "00" * 32,
        buyer_evidence_hash="0x" + "00" * 32,
        report_hash="0x" + "00" * 32,
        risk_score=0,
        flagged=False,
        created_at=100,
        evidence_deadline=0,
        dispute_deadline=0,
        state=state,
    )


class _MockMarketplaceChain:
    def __init__(self, initial_next_trade_id: int = 1):
        self.escrow = type("E", (), {"address": ESCROW_ADDR})()
        self._chain_id = 31337
        self.next_id = initial_next_trade_id
        self.trades: dict[int, Trade] = {}
        self.tx_to_tid: dict[str, int] = {}
        self.fail_next_trade_id: Exception | None = None
        self.fail_get_trade: Exception | None = None

    def chain_id(self) -> int:
        return self._chain_id

    def next_trade_id(self) -> int:
        if self.fail_next_trade_id is not None:
            raise self.fail_next_trade_id
        return self.next_id

    def get_trade(self, trade_id: int) -> Trade:
        if self.fail_get_trade is not None:
            raise self.fail_get_trade
        if trade_id not in self.trades:
            raise ChainError(f"missing trade {trade_id}")
        return self.trades[trade_id]

    def add_trade(self, trade: Trade, tx_hash: str | None = None) -> str:
        self.trades[trade.trade_id] = trade
        if trade.trade_id >= self.next_id:
            self.next_id = trade.trade_id + 1
        h = tx_hash or ("0x" + f"{trade.trade_id:02x}" * 32)
        self.tx_to_tid[h.lower()] = trade.trade_id
        return h

    def verify_create_trade_tx(self, tx_hash: str, expected_trade_id: int | None = None) -> CreatedTradeReceipt:
        tid = self.tx_to_tid.get(tx_hash.lower())
        if tid is None:
            raise ChainTxNotFound(f"tx {tx_hash} not found")
        if expected_trade_id is not None and tid != expected_trade_id:
            raise ChainValidationError("TRADE_ID_MISMATCH", f"expected {expected_trade_id}, got {tid}")
        t = self.get_trade(tid)
        return CreatedTradeReceipt(
            chain_id=self._chain_id,
            escrow_address=ESCROW_ADDR,
            tx_hash=tx_hash,
            tx_to=ESCROW_ADDR,
            status=1,
            trade_id=tid,
            seller=t.seller.lower(),
            buyer=t.buyer.lower(),
            item_value=t.item_value,
            nonce=t.nonce,
            block_number=1,
            trade=t,
        )


class TestSchemaAndCrudSearch:
    def test_sqlite_wal_mode_created_at_data_dir(self, tmp_path):
        s = _settings(tmp_path)
        svc.create_app(s)
        db_file = s.data_dir / "marketplace.db"
        assert db_file.exists()
        import sqlite3
        conn = sqlite3.connect(str(db_file))
        try:
            mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
            assert str(mode).lower() == "wal"
            tables = {
                r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            }
            assert {"listings", "listing_images", "purchase_requests", "listing_trades", "used_proxy_nonces"}.issubset(tables)
        finally:
            conn.close()

    def test_crud_multi_image_pause_cancel_and_guards(self, tmp_path):
        app = svc.create_app(_settings(tmp_path))
        c = TestClient(app)

        # Create listing with 3 IPFS images
        payload = _listing_payload(images=[
            {"uri": "ipfs://QmGallery1"},
            {"uri": "ipfs://QmPrimaryShot", "is_primary": True},
            {"uri": "ipfs://QmGallery3"},
        ])
        r = c.post("/listings", json=payload, headers=_headers(SELLER_A))
        assert r.status_code == 201, r.text
        created = r.json()
        lid = created["id"]
        assert created["seller_wallet"] == SELLER_A.lower()
        assert created["primary_image_uri"] == "ipfs://QmPrimaryShot"
        assert len(created["images"]) == 3
        assert created["collateral_asset"] == "AVAX"
        assert created["accounting_token"] == "CDU"
        assert created["deposit_required_wei"] == str(Web3.to_wei(2, "ether") * 3000 // 10000)

        # Detail
        d = c.get(f"/listings/{lid}")
        assert d.status_code == 200
        assert d.json()["sku"] == "LEGO-10305"

        # Non-owner cannot edit
        r_forbid = c.patch(f"/listings/{lid}", json={"title": "Hacked Title"}, headers=_headers(STRANGER))
        assert r_forbid.status_code == 403
        assert r_forbid.json()["error_code"] == "FORBIDDEN"

        # Owner pause & unpause
        r_pause = c.patch(f"/listings/{lid}", json={"status": "PAUSED"}, headers=_headers(SELLER_A))
        assert r_pause.status_code == 200 and r_pause.json()["status"] == "PAUSED"
        assert c.get("/listings").json()["total"] == 0  # default ACTIVE excludes PAUSED
        assert c.get("/listings?status=ALL").json()["total"] == 1

        r_resume = c.patch(
            f"/listings/{lid}",
            json={"status": "ACTIVE", "price_wei": str(Web3.to_wei(3, "ether"))},
            headers=_headers(SELLER_A),
        )
        assert r_resume.status_code == 200
        assert r_resume.json()["price_wei"] == str(Web3.to_wei(3, "ether"))

        # Cancel listing -> terminal, cannot edit afterwards
        r_cancel = c.patch(f"/listings/{lid}", json={"status": "CANCELLED"}, headers=_headers(SELLER_A))
        assert r_cancel.status_code == 200 and r_cancel.json()["status"] == "CANCELLED"
        r_after = c.patch(f"/listings/{lid}", json={"title": "After Cancel"}, headers=_headers(SELLER_A))
        assert r_after.status_code == 409

    def test_search_filter_sort_pagination_large_wei(self, tmp_path):
        app = svc.create_app(_settings(tmp_path))
        c = TestClient(app)

        items = [
            _listing_payload(sku="CARD-01", category="TRADING_CARD", condition="GRADED", title="Charizard PSA 10 100% Real", price_wei=str(Web3.to_wei(15, "ether"))),
            _listing_payload(sku="FIG-01", category="FIGURE", condition="LIKE_NEW", title="Gundam Metal Build Strike", price_wei=str(Web3.to_wei(2, "ether"))),
            _listing_payload(sku="COIN-01", category="COIN", condition="USED_GOOD", title="Xu bac Dong Duong 1900", price_wei=str(Web3.to_wei(5, "ether") // 10)),
        ]
        for p in items:
            assert c.post("/listings", json=p, headers=_headers(SELLER_A)).status_code == 201

        # Search escaping % literally (Charizard has "100%")
        r_q = c.get("/listings", params={"q": "100%"})
        assert r_q.status_code == 200
        assert [x["sku"] for x in r_q.json()["items"]] == ["CARD-01"]

        # Numeric wei sort (> 2^63 wei: 15 AVAX > 2 AVAX > 0.5 AVAX)
        r_asc = c.get("/listings", params={"sort": "price_asc"})
        assert [x["sku"] for x in r_asc.json()["items"]] == ["COIN-01", "FIG-01", "CARD-01"]

        r_desc = c.get("/listings", params={"sort": "price_desc"})
        assert [x["sku"] for x in r_desc.json()["items"]] == ["CARD-01", "FIG-01", "COIN-01"]

        # Price range filter
        r_range = c.get("/listings", params={
            "min_price_wei": str(Web3.to_wei(1, "ether")),
            "max_price_wei": str(Web3.to_wei(10, "ether")),
        })
        assert [x["sku"] for x in r_range.json()["items"]] == ["FIG-01"]

        # Category + Condition filter
        r_cat = c.get("/listings", params={"category": "COIN", "condition": "USED_GOOD"})
        assert [x["sku"] for x in r_cat.json()["items"]] == ["COIN-01"]

        # Pagination
        r_p1 = c.get("/listings", params={"sort": "price_asc", "page": 1, "limit": 2})
        r_p2 = c.get("/listings", params={"sort": "price_asc", "page": 2, "limit": 2})
        assert r_p1.json()["total"] == 3 and r_p1.json()["total_pages"] == 2
        assert [x["sku"] for x in r_p1.json()["items"]] == ["COIN-01", "FIG-01"]
        assert [x["sku"] for x in r_p2.json()["items"]] == ["CARD-01"]


class TestDuplicateDetection:
    def test_duplicate_active_sku_blocked_but_diff_seller_or_cancelled_allowed(self, tmp_path):
        app = svc.create_app(_settings(tmp_path))
        c = TestClient(app)

        r1 = c.post("/listings", json=_listing_payload(sku="lego-999"), headers=_headers(SELLER_A))
        assert r1.status_code == 201
        lid1 = r1.json()["id"]

        # Same seller + normalized SKU -> 409 blocked
        r_dup = c.post("/listings", json=_listing_payload(sku=" LEGO-999 "), headers=_headers(SELLER_A))
        assert r_dup.status_code == 409
        assert r_dup.json()["error_code"] == "DUPLICATE_ACTIVE_SKU"

        # Different seller -> allowed
        r_other = c.post("/listings", json=_listing_payload(sku="LEGO-999"), headers=_headers(SELLER_B))
        assert r_other.status_code == 201

        # After seller A cancels original -> re-listing same SKU allowed
        assert c.patch(f"/listings/{lid1}", json={"status": "CANCELLED"}, headers=_headers(SELLER_A)).status_code == 200
        r_relist = c.post("/listings", json=_listing_payload(sku="LEGO-999"), headers=_headers(SELLER_A))
        assert r_relist.status_code == 201

    def test_similar_sha256_and_phash_warn_without_blocking(self, tmp_path, file_server):
        root, base = file_server
        # Create sample collectible image A & visually nearly-identical image B (1 tiny pixel change)
        img_a = Image.new("RGB", (128, 128), (40, 80, 180))
        d = ImageDraw.Draw(img_a)
        d.rectangle([24, 24, 96, 96], fill=(240, 180, 77))
        img_a.save(root / "dup_a.png")

        img_b = img_a.copy()
        img_b.putpixel((2, 2), (41, 80, 180))  # khác SHA-256 nhưng pHash gần như y hệt
        img_b.save(root / "dup_b.png")

        s = _settings(tmp_path, ipfs_gateway=base + "/", inspect_listing_images=True)
        app = svc.create_app(s)
        c = TestClient(app)

        # Listing 1
        r1 = c.post(
            "/listings",
            json=_listing_payload(sku="SKU-IMG-1", images=[{"uri": "ipfs://dup_a.png", "is_primary": True}]),
            headers=_headers(SELLER_A),
        )
        assert r1.status_code == 201
        assert r1.json()["review_required"] is False
        assert r1.json()["primary_image_sha256"]
        assert r1.json()["primary_image_phash"]

        # Listing 2: different SKU, EXACT same image bytes -> NOT blocked (201), warns SHA-256
        r2 = c.post(
            "/listings",
            json=_listing_payload(sku="SKU-IMG-2", images=[{"uri": "ipfs://dup_a.png", "is_primary": True}]),
            headers=_headers(SELLER_B),
        )
        assert r2.status_code == 201
        assert r2.json()["review_required"] is True
        assert any(w["code"] == "SIMILAR_IMAGE_SHA256" for w in r2.json()["warnings"])

        # Listing 3: different SKU & bytes, near-identical pHash -> NOT blocked (201), warns pHash
        r3 = c.post(
            "/listings",
            json=_listing_payload(sku="SKU-IMG-3", images=[{"uri": "ipfs://dup_b.png", "is_primary": True}]),
            headers=_headers(SELLER_B),
        )
        assert r3.status_code == 201
        assert r3.json()["review_required"] is True
        assert any(w["code"] == "SIMILAR_IMAGE_PHASH" for w in r3.json()["warnings"])


class TestPurchaseRequestsConcurrencyAndTTL:
    def test_concurrent_two_buyers_qty1_only_one_succeeds(self, tmp_path):
        app = svc.create_app(_settings(tmp_path))
        c = TestClient(app)

        lst = c.post(
            "/listings",
            json=_listing_payload(quantity_total=1),
            headers=_headers(SELLER_A),
        ).json()
        lid = lst["id"]

        # Two buyers submit PENDING requests
        req1 = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_headers(BUYER_1)).json()
        req2 = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_headers(BUYER_2)).json()

        # Stranger/buyer cannot accept
        assert c.post(f"/requests/{req1['id']}/decision", json={"action": "accept"}, headers=_headers(BUYER_1)).status_code == 403

        # Concurrent accept race across two threads using Barrier
        barrier = threading.Barrier(2)

        def accept(req_id: str) -> int:
            barrier.wait()
            local_client = TestClient(app)
            resp = local_client.post(
                f"/requests/{req_id}/decision",
                json={"action": "accept"},
                headers=_headers(SELLER_A),
            )
            return resp.status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(accept, [req1["id"], req2["id"]]))

        assert sorted(statuses) == [200, 409]
        detail = c.get(f"/listings/{lid}").json()
        assert detail["quantity_reserved"] == 1
        assert detail["quantity_available"] == 0
        assert detail["status"] == "RESERVED"

    def test_cannot_edit_price_or_cancel_while_reserved_and_ttl_releases_unless_bound(self, tmp_path):
        clock = _FakeClock(1_700_000_000)
        s = _settings(tmp_path, reservation_ttl_seconds=1800)
        app = svc.create_app(s, client=_MockMarketplaceChain())
        app.state.marketplace.clock = clock
        c = TestClient(app)

        lid = c.post("/listings", json=_listing_payload(quantity_total=1), headers=_headers(SELLER_A)).json()["id"]
        req_id = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_headers(BUYER_1)).json()["id"]
        accepted = c.post(f"/requests/{req_id}/decision", json={"action": "accept"}, headers=_headers(SELLER_A)).json()
        assert accepted["reservation_expires_at"] == 1_700_000_000 + 1800

        # Cannot edit price or cancel while reserved
        assert c.patch(f"/listings/{lid}", json={"price_wei": str(Web3.to_wei(9, "ether"))}, headers=_headers(SELLER_A)).status_code == 409
        assert c.patch(f"/listings/{lid}", json={"status": "CANCELLED"}, headers=_headers(SELLER_A)).status_code == 409

        # Buyer cannot cancel prematurely before TTL expires
        assert c.post(f"/requests/{req_id}/cancel", headers=_headers(BUYER_1)).status_code == 409

        # Advance 29 min -> still reserved
        clock.advance(1740)
        assert c.get(f"/listings/{lid}").json()["status"] == "RESERVED"

        # Advance past 30 min -> lazy expiry releases reservation cleanly!
        clock.advance(120)
        listing_after = c.get(f"/listings/{lid}").json()
        assert listing_after["status"] == "ACTIVE"
        assert listing_after["quantity_reserved"] == 0
        assert listing_after["quantity_available"] == 1
        req_after = c.get(f"/requests/{req_id}", headers=_headers(BUYER_1)).json()
        assert req_after["status"] == "EXPIRED"

        # Now test protection: when bound in listing_trades (ESCROW_CREATED), TTL MUST NOT release!
        req2_id = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_headers(BUYER_2)).json()["id"]
        c.post(f"/requests/{req2_id}/decision", json={"action": "accept"}, headers=_headers(SELLER_A))
        with app.state.db.write_tx() as conn:
            conn.execute(
                """
                INSERT INTO listing_trades (chain_id, escrow_address, trade_id, listing_id, request_id, tx_hash, synced_state, flagged, last_synced_at)
                VALUES (31337, ?, 42, ?, ?, ?, 'Created', 0, ?)
                """,
                (ESCROW_ADDR, lid, req2_id, "0x" + "ab" * 32, clock()),
            )
            conn.execute("UPDATE purchase_requests SET status = 'ESCROW_CREATED' WHERE id = ?", (req2_id,))

        clock.advance(7200)
        assert c.post("/marketplace/reconcile", headers=_headers(SELLER_A)).json()["expired_released"] == 0
        assert c.get(f"/listings/{lid}").json()["status"] == "RESERVED"
        assert c.get(f"/requests/{req2_id}", headers=_headers(BUYER_2)).json()["status"] == "ESCROW_CREATED"


class TestSecurityReplayRateLimitPersistence:
    def test_spoofed_actor_field_rejected_and_missing_headers_401(self, tmp_path):
        app = svc.create_app(_settings(tmp_path))
        c = TestClient(app)

        # Missing X-API-Key -> 401
        r1 = c.post("/listings", json=_listing_payload(), headers={"X-Authenticated-Wallet": SELLER_A})
        assert r1.status_code == 401

        # Missing X-Authenticated-Wallet -> 401
        r2 = c.post("/listings", json=_listing_payload(), headers={"X-API-Key": API_KEY})
        assert r2.status_code == 401

        # Attempt to pass spoofed seller_wallet inside JSON body -> 422 extra forbidden
        spoofed = _listing_payload(seller_wallet=SELLER_B)
        r3 = c.post("/listings", json=spoofed, headers=_headers(SELLER_A))
        assert r3.status_code == 422

        # Non-31337 fail-closed without ATTEST_API_KEY -> 503 INSECURE_CONFIG
        fuji_app = svc.create_app(_settings(tmp_path / "fuji", chain_id=43113, attest_api_key=None, allow_local_hosts=False))
        r4 = TestClient(fuji_app).post("/listings", json=_listing_payload(), headers={"X-Authenticated-Wallet": SELLER_A})
        assert r4.status_code == 503
        assert r4.json()["error_code"] == "INSECURE_CONFIG"

    def test_proxy_hmac_replay_protection_and_restart_persistence(self, tmp_path):
        clock = _FakeClock(1_700_000_000)
        s = _settings(tmp_path, require_proxy_signature=True, proxy_sig_ttl_seconds=300)
        app1 = svc.create_app(s)
        app1.state.marketplace.clock = clock
        c1 = TestClient(app1)

        # Unsigned request blocked when require_proxy_signature=True
        assert c1.post("/listings", json=_listing_payload(), headers=_headers(SELLER_A)).status_code == 401

        # Signed request succeeds
        hdrs = _signed_headers("POST", "/listings", SELLER_A, "nonce-unique-0001", clock())
        r_ok = c1.post("/listings", json=_listing_payload(sku="PERSIST-01"), headers=hdrs)
        assert r_ok.status_code == 201
        lid = r_ok.json()["id"]

        # Exact replay of same nonce -> 401 REPLAY_DETECTED
        r_rep = c1.post("/listings", json=_listing_payload(sku="PERSIST-02"), headers=hdrs)
        assert r_rep.status_code == 401
        assert r_rep.json()["error_code"] == "REPLAY_DETECTED"

        # Tampered wallet header with original signature -> 401 INVALID_PROXY_SIGNATURE
        bad_hdrs = dict(hdrs, **{"X-Authenticated-Wallet": SELLER_B})
        assert c1.post("/listings", json=_listing_payload(sku="PERSIST-03"), headers=bad_hdrs).json()["error_code"] == "INVALID_PROXY_SIGNATURE"

        # Expired timestamp -> 401 EXPIRED_PROXY_REQUEST
        old_hdrs = _signed_headers("POST", "/listings", SELLER_A, "nonce-old-0001", clock() - 400)
        assert c1.post("/listings", json=_listing_payload(sku="PERSIST-04"), headers=old_hdrs).json()["error_code"] == "EXPIRED_PROXY_REQUEST"

        # Restart backend (new FastAPI instance pointing at same DATA_DIR)
        app2 = svc.create_app(s)
        app2.state.marketplace.clock = clock
        c2 = TestClient(app2)
        assert c2.get(f"/listings/{lid}").json()["sku"] == "PERSIST-01"
        # Nonce replay STILL blocked after restart!
        r_rep_restart = c2.post("/listings", json=_listing_payload(sku="PERSIST-05"), headers=hdrs)
        assert r_rep_restart.status_code == 401
        assert r_rep_restart.json()["error_code"] == "REPLAY_DETECTED"

    def test_per_wallet_rate_limiting_and_idempotency_key(self, tmp_path):
        app = svc.create_app(_settings(tmp_path))
        c = TestClient(app)

        # Idempotency-Key returns same listing on retry, 409 on payload mismatch
        idem_h = _headers(SELLER_A, **{"Idempotency-Key": "idem-create-1"})
        r1 = c.post("/listings", json=_listing_payload(sku="IDEM-01"), headers=idem_h)
        r2 = c.post("/listings", json=_listing_payload(sku="IDEM-01"), headers=idem_h)
        assert r1.status_code == 201 and r2.status_code == 201
        assert r1.json()["id"] == r2.json()["id"]
        assert c.post("/listings", json=_listing_payload(sku="IDEM-OTHER"), headers=idem_h).status_code == 409

        # Wallet A hits create_listing limit (30/min), Wallet B from same proxy IP is unaffected!
        for idx in range(27):
            res = c.post("/listings", json=_listing_payload(sku=f"SPAM-{idx}"), headers=_headers(SELLER_A))
            assert res.status_code == 201
        assert c.post("/listings", json=_listing_payload(sku="SPAM-OVER"), headers=_headers(SELLER_A)).status_code == 429
        assert c.post("/listings", json=_listing_payload(sku="SELLER-B-OK"), headers=_headers(SELLER_B)).status_code == 201


class TestBindTradeValidationUnit:
    def _setup_accepted(self, tmp_path, mock_client):
        app = svc.create_app(_settings(tmp_path), client=mock_client)
        c = TestClient(app)
        lid = c.post("/listings", json=_listing_payload(quantity_total=1), headers=_headers(SELLER_A)).json()["id"]
        req_id = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_headers(BUYER_1)).json()["id"]
        c.post(f"/requests/{req_id}/decision", json={"action": "accept"}, headers=_headers(SELLER_A))
        return c, req_id

    @pytest.mark.parametrize(
        ("exc", "expected_status", "expected_code"),
        [
            (ChainTxNotFound("missing"), 404, "TX_NOT_FOUND"),
            (ChainValidationError("TRANSACTION_REVERTED", "reverted"), 422, "TRANSACTION_REVERTED"),
            (ChainValidationError("WRONG_CONTRACT_ADDRESS", "wrong to"), 422, "WRONG_CONTRACT_ADDRESS"),
            (ChainValidationError("MISSING_TRADE_CREATED_EVENT", "no event"), 422, "MISSING_TRADE_CREATED_EVENT"),
            (ChainValidationError("TRADE_ID_MISMATCH", "bad id"), 422, "TRADE_ID_MISMATCH"),
            (ChainError("rpc http 500 http://secret-rpc-key"), 502, "CHAIN_RPC_ERROR"),
        ],
    )
    def test_bind_trade_rejects_invalid_receipts_and_sanitizes_rpc_errors(self, tmp_path, exc, expected_status, expected_code):
        class MockClient:
            escrow = type("E", (), {"address": ESCROW_ADDR})()
            def chain_id(self): return 31337
            def verify_create_trade_tx(self, tx_hash, expected_trade_id=None):
                raise exc

        c, req_id = self._setup_accepted(tmp_path, MockClient())
        r = c.post(
            f"/requests/{req_id}/bind-trade",
            json={"tx_hash": "0x" + "12" * 32, "trade_id": 1},
            headers=_headers(SELLER_A),
        )
        assert r.status_code == expected_status
        assert r.json()["error_code"] == expected_code
        assert "secret-rpc-key" not in r.text

    @pytest.mark.parametrize(
        ("bad_seller", "bad_buyer", "bad_val", "expected_code"),
        [
            (STRANGER, BUYER_1, Web3.to_wei(2, "ether"), "SELLER_MISMATCH"),
            (SELLER_A, STRANGER, Web3.to_wei(2, "ether"), "BUYER_MISMATCH"),
            (SELLER_A, BUYER_1, Web3.to_wei(1, "ether"), "ITEM_VALUE_MISMATCH"),
        ],
    )
    def test_bind_trade_rejects_mismatched_parties_or_value(self, tmp_path, bad_seller, bad_buyer, bad_val, expected_code):
        class MockClient:
            escrow = type("E", (), {"address": ESCROW_ADDR})()
            def chain_id(self): return 31337
            def verify_create_trade_tx(self, tx_hash, expected_trade_id=None):
                t = Trade(
                    trade_id=1, seller=bad_seller, buyer=bad_buyer, item_value=bad_val,
                    deposit_required=bad_val * 3000 // 10000, seller_deposit=0, buyer_deposit=0,
                    nonce="0x" + "11" * 32, seller_evidence_hash="0x" + "00" * 32,
                    buyer_evidence_hash="0x" + "00" * 32, report_hash="0x" + "00" * 32,
                    risk_score=0, flagged=False, created_at=100, evidence_deadline=0,
                    dispute_deadline=0, state=TradeState.Created,
                )
                return CreatedTradeReceipt(
                    chain_id=31337, escrow_address=ESCROW_ADDR, tx_hash=tx_hash,
                    tx_to=ESCROW_ADDR, status=1, trade_id=1,
                    seller=bad_seller.lower(), buyer=bad_buyer.lower(), item_value=bad_val,
                    nonce=t.nonce, block_number=1, trade=t,
                )

        c, req_id = self._setup_accepted(tmp_path, MockClient())
        r = c.post(
            f"/requests/{req_id}/bind-trade",
            json={"tx_hash": "0x" + "34" * 32, "trade_id": 1},
            headers=_headers(SELLER_A),
        )
        assert r.status_code == 422
        assert r.json()["error_code"] == expected_code


class TestMkt002RemediationUnit:
    def test_unverifiable_chain_refuses_ttl_release_and_cancel(self, tmp_path):
        clock = _FakeClock(1_700_000_000)
        s = _settings(tmp_path, reservation_ttl_seconds=60)
        # Case 1: No RPC client configured (client=None)
        app = svc.create_app(s, client=None)
        app.state.marketplace.clock = clock
        c = TestClient(app)

        lid = c.post("/listings", json=_listing_payload(quantity_total=1), headers=_headers(SELLER_A)).json()["id"]
        # PENDING request can still be cancelled cleanly offline (never reached Accepted)
        pend_id = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_headers(BUYER_2)).json()["id"]
        assert c.post(f"/requests/{pend_id}/cancel", headers=_headers(BUYER_2)).status_code == 200

        req1 = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_headers(BUYER_1)).json()["id"]
        assert c.post(f"/requests/{req1}/decision", json={"action": "accept"}, headers=_headers(SELLER_A)).status_code == 200

        clock.advance(120)
        # Fail-safe: do NOT expire ACCEPTED when chain state is unverified
        listing = c.get(f"/listings/{lid}").json()
        assert listing["status"] == "RESERVED"
        assert listing["quantity_reserved"] == 1
        assert c.get(f"/requests/{req1}", headers=_headers(BUYER_1)).json()["status"] == "ACCEPTED"
        # Buyer 2 cannot reserve while Buyer 1 hold is locked
        r_b2 = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_headers(BUYER_2))
        assert r_b2.status_code == 409
        assert r_b2.json()["error_code"] == "LISTING_UNAVAILABLE"
        # Cancel ACCEPTED is refused offline (503 CHAIN_UNVERIFIED_CANNOT_RELEASE)
        r_cancel = c.post(f"/requests/{req1}/cancel", headers=_headers(BUYER_1))
        assert r_cancel.status_code == 503
        assert r_cancel.json()["error_code"] == "CHAIN_UNVERIFIED_CANNOT_RELEASE"
        # Reconcile does not release either
        rec = c.post("/marketplace/reconcile", headers=_headers(SELLER_A)).json()
        assert rec["expired_released"] == 0

        # Case 2: RPC errors while verifying nextTradeId / getTrade -> also fail-safe + sanitized error
        mock = _MockMarketplaceChain()
        mock.fail_next_trade_id = ChainError("rpc outage https://secret-node.internal/key")
        app2 = svc.create_app(_settings(tmp_path / "rpc_fail", reservation_ttl_seconds=60), client=mock)
        app2.state.marketplace.clock = clock
        c2 = TestClient(app2)
        lid2 = c2.post("/listings", json=_listing_payload(sku="RPC-FAIL-1", quantity_total=1), headers=_headers(SELLER_A)).json()["id"]
        req2 = c2.post(f"/listings/{lid2}/requests", json={"quantity": 1}, headers=_headers(BUYER_1)).json()["id"]
        c2.post(f"/requests/{req2}/decision", json={"action": "accept"}, headers=_headers(SELLER_A))
        clock.advance(120)
        assert c2.get(f"/requests/{req2}", headers=_headers(BUYER_1)).json()["status"] == "ACCEPTED"
        r_c2 = c2.post(f"/requests/{req2}/cancel", headers=_headers(SELLER_A))
        assert r_c2.status_code == 502
        assert r_c2.json()["error_code"] == "CHAIN_UNVERIFIED_CANNOT_RELEASE"
        assert "secret-node.internal" not in r_c2.text

    def test_unbound_onchain_trade_blocks_ttl_and_cancel_until_cancelled(self, tmp_path):
        clock = _FakeClock(1_700_000_000)
        mock = _MockMarketplaceChain(initial_next_trade_id=2)
        # Pre-existing unbound historical trade tid=1 BEFORE this request was accepted should NOT block new request
        mock.add_trade(_make_trade(1, seller=SELLER_A, buyer=BUYER_1, state=TradeState.Created))

        s = _settings(tmp_path, reservation_ttl_seconds=60)
        app = svc.create_app(s, client=mock)
        app.state.marketplace.clock = clock
        c = TestClient(app)

        lid = c.post("/listings", json=_listing_payload(quantity_total=1), headers=_headers(SELLER_A)).json()["id"]
        # Sanity: historical trade tid=1 does not block a fresh accepted request when tid=2 is absent
        req_hist = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_headers(BUYER_1)).json()["id"]
        c.post(f"/requests/{req_hist}/decision", json={"action": "accept"}, headers=_headers(SELLER_A))
        clock.advance(120)
        assert c.get(f"/requests/{req_hist}", headers=_headers(BUYER_1)).json()["status"] == "EXPIRED"

        # Now accept Buyer 1 again (min_onchain_trade_id == 2), then mint unbound trade tid=2 (bind-trade failed)
        req1 = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_headers(BUYER_1)).json()["id"]
        acc = c.post(f"/requests/{req1}/decision", json={"action": "accept"}, headers=_headers(SELLER_A))
        assert acc.status_code == 200
        mock.add_trade(_make_trade(2, seller=SELLER_A, buyer=BUYER_1, state=TradeState.Created))

        clock.advance(120)
        # Even after TTL, reservation stays held because tid=2 exists unbound on-chain
        assert c.get(f"/listings/{lid}").json()["quantity_reserved"] == 1
        assert c.get(f"/requests/{req1}", headers=_headers(BUYER_1)).json()["status"] == "ACCEPTED"
        assert c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_headers(BUYER_2)).status_code == 409
        r_cancel = c.post(f"/requests/{req1}/cancel", headers=_headers(BUYER_1))
        assert r_cancel.status_code == 409
        assert r_cancel.json()["error_code"] == "ONCHAIN_TRADE_ALREADY_EXISTS"

        # Once tid=2 is Cancelled on-chain, TTL expiry releases reservation safely
        mock.trades[2] = _make_trade(2, seller=SELLER_A, buyer=BUYER_1, state=TradeState.Cancelled)
        assert c.get(f"/requests/{req1}", headers=_headers(BUYER_1)).json()["status"] == "EXPIRED"
        listing_after = c.get(f"/listings/{lid}").json()
        assert listing_after["status"] == "ACTIVE"
        assert listing_after["quantity_reserved"] == 0

    @pytest.mark.parametrize("onchain_state", [TradeState.Created, TradeState.Resolved])
    def test_expired_bind_recovery_blocks_oversell_when_other_buyer_holds_stock(self, tmp_path, onchain_state):
        clock = _FakeClock(1_700_000_000)
        mock = _MockMarketplaceChain(initial_next_trade_id=1)
        s = _settings(tmp_path, reservation_ttl_seconds=60)
        app = svc.create_app(s, client=mock)
        app.state.marketplace.clock = clock
        c = TestClient(app)

        lid = c.post("/listings", json=_listing_payload(quantity_total=1), headers=_headers(SELLER_A)).json()["id"]
        req1 = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_headers(BUYER_1)).json()["id"]
        c.post(f"/requests/{req1}/decision", json={"action": "accept"}, headers=_headers(SELLER_A))

        # Expire cleanly while chain has no trade yet
        clock.advance(120)
        assert c.get(f"/requests/{req1}", headers=_headers(BUYER_1)).json()["status"] == "EXPIRED"

        # Buyer 2 reserves the 1 available item
        req2 = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_headers(BUYER_2)).json()["id"]
        assert c.post(f"/requests/{req2}/decision", json={"action": "accept"}, headers=_headers(SELLER_A)).status_code == 200

        # Late recovery bind-trade on EXPIRED req1 MUST be blocked (no oversell!)
        tx_hash = mock.add_trade(_make_trade(1, seller=SELLER_A, buyer=BUYER_1, state=onchain_state))
        r_bind = c.post(
            f"/requests/{req1}/bind-trade",
            json={"tx_hash": tx_hash, "trade_id": 1},
            headers=_headers(SELLER_A),
        )
        assert r_bind.status_code == 409
        assert r_bind.json()["error_code"] == "INSUFFICIENT_STOCK_AFTER_EXPIRY"
        listing = c.get(f"/listings/{lid}").json()
        assert listing["quantity_reserved"] == 1
        assert listing["quantity_sold"] == 0
        assert c.get(f"/requests/{req2}", headers=_headers(BUYER_2)).json()["status"] == "ACCEPTED"

    def test_bind_resolved_from_accepted_decrements_reserved_and_idempotency_without_trade_id(self, tmp_path):
        mock = _MockMarketplaceChain(initial_next_trade_id=1)
        s = _settings(tmp_path, reservation_ttl_seconds=1800)
        app = svc.create_app(s, client=mock)
        c = TestClient(app)

        lid = c.post("/listings", json=_listing_payload(quantity_total=1), headers=_headers(SELLER_A)).json()["id"]
        req1 = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_headers(BUYER_1)).json()["id"]
        c.post(f"/requests/{req1}/decision", json={"action": "accept"}, headers=_headers(SELLER_A))

        # Trade is already Resolved on-chain before bind-trade arrives!
        tx_hash = mock.add_trade(_make_trade(1, seller=SELLER_A, buyer=BUYER_1, state=TradeState.Resolved))
        idem_h = _headers(SELLER_A, **{"Idempotency-Key": "bind-resolved-1"})
        r1 = c.post(f"/requests/{req1}/bind-trade", json={"tx_hash": tx_hash}, headers=idem_h)
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1["status"] == "COMPLETED"
        assert b1["trade_id"] == 1
        assert b1["recovered"] is False

        # Inventory MUST move cleanly from quantity_reserved=1 -> quantity_sold=1, quantity_reserved=0 (no CHECK error!)
        listing = c.get(f"/listings/{lid}").json()
        assert listing["status"] == "SOLD"
        assert listing["quantity_reserved"] == 0
        assert listing["quantity_sold"] == 1
        assert listing["quantity_available"] == 0

        # Idempotent retry without trade_id returns cached 200; different tx_hash conflicts with 409
        r2 = c.post(f"/requests/{req1}/bind-trade", json={"tx_hash": tx_hash}, headers=idem_h)
        assert r2.status_code == 200 and r2.json()["trade_id"] == 1
        r_conflict = c.post(f"/requests/{req1}/bind-trade", json={"tx_hash": "0x" + "99" * 32}, headers=idem_h)
        assert r_conflict.status_code == 409
        assert r_conflict.json()["error_code"] == "IDEMPOTENCY_CONFLICT"

    def test_non_ascii_proxy_signature_returns_401_not_500(self, tmp_path):
        now = int(time.time())
        app = svc.create_app(_settings(tmp_path, require_proxy_signature=True))
        c = TestClient(app)
        bad_hdr = {
            "X-API-Key": API_KEY,
            "X-Authenticated-Wallet": SELLER_A,
            "X-Authenticated-Chain-Id": "31337",
            "X-Auth-Timestamp": str(now),
            "X-Auth-Nonce": "nonce-nonascii-1",
            "X-Auth-Signature": "chữ-ký-không-hợp-lệ",
        }
        raw_hdrs = [(k.encode("ascii"), v.encode("utf-8")) for k, v in bad_hdr.items()]
        r = c.post("/listings", json=_listing_payload(), headers=raw_hdrs)
        assert r.status_code == 401
        assert r.json()["error_code"] == "INVALID_PROXY_SIGNATURE"

    def test_sec02_fuji_requires_proxy_signature_and_enforces_hmac_replay(self, tmp_path):
        clock = _FakeClock(1_700_000_000)
        # 1. chain 43113 + require_proxy_signature=False -> 503 INSECURE_CONFIG (even with ATTEST_API_KEY)
        fuji_no_sig = svc.create_app(
            _settings(
                tmp_path / "fuji_no_sig",
                chain_id=43113,
                attest_api_key=API_KEY,
                allow_local_hosts=False,
                enforce_evidence_hash=True,
                require_proxy_signature=False,
            )
        )
        r_fail = TestClient(fuji_no_sig).post(
            "/listings",
            json=_listing_payload(sku="FUJI-NOSIG-01"),
            headers=_headers(SELLER_A),
        )
        assert r_fail.status_code == 503
        assert r_fail.json()["error_code"] == "INSECURE_CONFIG"

        # 2. chain 43113 + require_proxy_signature=True -> unsigned rejected (401), signed passes (201), replay blocked (401)
        fuji_safe = svc.create_app(
            _settings(
                tmp_path / "fuji_safe",
                chain_id=43113,
                attest_api_key=API_KEY,
                allow_local_hosts=False,
                enforce_evidence_hash=True,
                require_proxy_signature=True,
            )
        )
        fuji_safe.state.marketplace.clock = clock
        c = TestClient(fuji_safe)

        r_unsigned = c.post("/listings", json=_listing_payload(sku="FUJI-OK-01"), headers=_headers(SELLER_A))
        assert r_unsigned.status_code == 401
        assert r_unsigned.json()["error_code"] == "MISSING_PROXY_SIGNATURE"

        hdrs = _signed_headers("POST", "/listings", SELLER_A, "fuji-nonce-0001", clock(), chain_id=43113)
        r_ok = c.post("/listings", json=_listing_payload(sku="FUJI-OK-01"), headers=hdrs)
        assert r_ok.status_code == 201

        r_rep = c.post("/listings", json=_listing_payload(sku="FUJI-OK-02"), headers=hdrs)
        assert r_rep.status_code == 401
        assert r_rep.json()["error_code"] == "REPLAY_DETECTED"


class TestPhase3T1GetListingTtlGuard:
    def test_get_listing_skips_expire_and_write_tx_when_no_expired_reservation(self, tmp_path, monkeypatch):
        clock = _FakeClock(1_700_000_000)
        mock_chain = _MockMarketplaceChain(initial_next_trade_id=1)
        s = _settings(tmp_path, reservation_ttl_seconds=1800)
        app = svc.create_app(s, client=mock_chain)
        app.state.marketplace.clock = clock
        c = TestClient(app)

        lid = c.post("/listings", json=_listing_payload(quantity_total=1), headers=_headers(SELLER_A)).json()["id"]
        req_id = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_headers(BUYER_1)).json()["id"]
        assert c.post(f"/requests/{req_id}/decision", json={"action": "accept"}, headers=_headers(SELLER_A)).status_code == 200

        # Advance 10 minutes (still within 30m TTL) -> has_expired is False
        clock.advance(600)

        expire_calls = 0
        orig_expire = app.state.marketplace.expire_stale_reservations

        def tracked_expire(*args, **kwargs):
            nonlocal expire_calls
            expire_calls += 1
            return orig_expire(*args, **kwargs)

        write_tx_calls = 0
        orig_write_tx = app.state.db.write_tx

        def tracked_write_tx(*args, **kwargs):
            nonlocal write_tx_calls
            write_tx_calls += 1
            return orig_write_tx(*args, **kwargs)

        rpc_next_trade_calls = 0
        orig_next_id = mock_chain.next_trade_id

        def tracked_next_id():
            nonlocal rpc_next_trade_calls
            rpc_next_trade_calls += 1
            return orig_next_id()

        monkeypatch.setattr(app.state.marketplace, "expire_stale_reservations", tracked_expire)
        monkeypatch.setattr(app.state.db, "write_tx", tracked_write_tx)
        monkeypatch.setattr(mock_chain, "next_trade_id", tracked_next_id)

        res = c.get(f"/listings/{lid}")
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "RESERVED"
        assert body["quantity_reserved"] == 1
        assert expire_calls == 0
        assert write_tx_calls == 0
        assert rpc_next_trade_calls == 0

    def test_get_listing_fail_closed_when_expired_but_client_none_or_rpc_error(self, tmp_path, monkeypatch):
        clock = _FakeClock(1_700_000_000)
        # Case A: verify_chain_before_ttl_release=True and client=None -> fail-closed & skips expire call
        s_none = _settings(tmp_path / "client_none", reservation_ttl_seconds=60, verify_chain_before_ttl_release=True)
        app_none = svc.create_app(s_none, client=None)
        app_none.state.marketplace.clock = clock
        c_none = TestClient(app_none)

        lid1 = c_none.post("/listings", json=_listing_payload(quantity_total=1), headers=_headers(SELLER_A)).json()["id"]
        req1 = c_none.post(f"/listings/{lid1}/requests", json={"quantity": 1}, headers=_headers(BUYER_1)).json()["id"]
        assert c_none.post(f"/requests/{req1}/decision", json={"action": "accept"}, headers=_headers(SELLER_A)).status_code == 200

        clock.advance(120)

        expire_calls_none = 0
        orig_expire_none = app_none.state.marketplace.expire_stale_reservations

        def tracked_expire_none(*args, **kwargs):
            nonlocal expire_calls_none
            expire_calls_none += 1
            return orig_expire_none(*args, **kwargs)

        monkeypatch.setattr(app_none.state.marketplace, "expire_stale_reservations", tracked_expire_none)

        detail_none = c_none.get(f"/listings/{lid1}").json()
        assert detail_none["status"] == "RESERVED"
        assert detail_none["quantity_reserved"] == 1
        assert detail_none["quantity_available"] == 0
        assert expire_calls_none == 0
        assert c_none.get(f"/requests/{req1}", headers=_headers(BUYER_1)).json()["status"] == "ACCEPTED"

        # Case B: verify_chain_before_ttl_release=True with RPC client error -> fail-closed
        mock_err = _MockMarketplaceChain(initial_next_trade_id=1)
        app_err = svc.create_app(_settings(tmp_path / "rpc_err", reservation_ttl_seconds=60), client=mock_err)
        app_err.state.marketplace.clock = clock
        c_err = TestClient(app_err)

        lid2 = c_err.post("/listings", json=_listing_payload(sku="TTL-RPC-ERR", quantity_total=1), headers=_headers(SELLER_A)).json()["id"]
        req2 = c_err.post(f"/listings/{lid2}/requests", json={"quantity": 1}, headers=_headers(BUYER_1)).json()["id"]
        assert c_err.post(f"/requests/{req2}/decision", json={"action": "accept"}, headers=_headers(SELLER_A)).status_code == 200

        mock_err.fail_next_trade_id = ChainError("rpc timeout")
        clock.advance(120)
        detail_err = c_err.get(f"/listings/{lid2}").json()
        assert detail_err["status"] == "RESERVED"
        assert detail_err["quantity_reserved"] == 1
        assert c_err.get(f"/requests/{req2}", headers=_headers(BUYER_1)).json()["status"] == "ACCEPTED"

        # Case C: Once RPC recovers and confirms no trade on-chain, get_listing releases TTL cleanly
        mock_err.fail_next_trade_id = None
        detail_released = c_err.get(f"/listings/{lid2}").json()
        assert detail_released["status"] == "ACTIVE"
        assert detail_released["quantity_reserved"] == 0
        assert detail_released["quantity_available"] == 1
        assert c_err.get(f"/requests/{req2}", headers=_headers(BUYER_1)).json()["status"] == "EXPIRED"
