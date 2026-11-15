"""
Integration tests (MKT-002): Real Anvil + Escrow.sol + CollectibleToken (CDU) +
FastAPI Marketplace Backend + SQLite WAL + AutoAgent AI attest & Read-only Sync.
"""

from __future__ import annotations

import json

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from web3 import Web3

import attest_service as svc
import evidence_check as ec
import synth
from auto_agent import listing_message
from chain import TradeState, evidence_hash_of

ROOT = svc.ROOT_DIR
OUT = ROOT / "contracts" / "out"

# Key mặc định CÔNG KHAI của anvil — chỉ dùng cho local test.
DEPLOYER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
AGENT = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
SELLER = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
BUYER = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
STRANGER = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"

WINDOW = 60
ITEM_VALUE = Web3.to_wei(2, "ether")
API_KEY = "anvil-mkt-test-key"


def _artifact(name: str):
    f = OUT / f"{name}.sol" / f"{name}.json"
    if not f.exists():
        pytest.skip(f"Thiếu {f} — chạy `forge build` trong contracts/")
    d = json.loads(f.read_text(encoding="utf-8"))
    return d["abi"], d["bytecode"]["object"]


def _ocr_ok() -> bool:
    try:
        ec.pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(ec.pytesseract is None or not _ocr_ok(), reason="Tesseract chưa cài")


class _AnvilChain:
    def __init__(self, url: str):
        self.w3 = Web3(Web3.HTTPProvider(url))
        self.acct = {
            k: self.w3.eth.account.from_key(v)
            for k, v in dict(
                deployer=DEPLOYER, agent=AGENT, seller=SELLER, buyer=BUYER, stranger=STRANGER
            ).items()
        }
        tok_abi, tok_bin = _artifact("CollectibleToken")
        esc_abi, esc_bin = _artifact("Escrow")
        self.token = self._deploy(tok_abi, tok_bin)
        self.escrow = self._deploy(
            esc_abi, esc_bin, self.token.address, self.acct["agent"].address, WINDOW, WINDOW, WINDOW
        )
        # Contract giả thứ hai để kiểm tra bind-trade từ chối receipt sai địa chỉ Escrow
        self.other_token = self._deploy(tok_abi, tok_bin)
        self.other_escrow = self._deploy(
            esc_abi, esc_bin, self.other_token.address, self.acct["agent"].address, WINDOW, WINDOW, WINDOW
        )
        self.tx("deployer", self.token.functions.setEscrow(self.escrow.address))
        self.tx("deployer", self.other_token.functions.setEscrow(self.other_escrow.address))

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
        assert r["status"] == 1, f"tx reverted: {fn.fn_name}"
        return r

    def warp(self, secs: int):
        self.w3.provider.make_request("evm_increaseTime", [secs])
        self.w3.provider.make_request("evm_mine", [])


@pytest.fixture(scope="module")
def chain(anvil):
    return _AnvilChain(anvil)


def _settings(anvil, chain, file_server, data_dir, **kw):
    opts = dict(
        rpc_url=anvil,
        agent_private_key=AGENT,
        escrow_address=chain.escrow.address,
        escrow_abi_path=OUT / "Escrow.sol" / "Escrow.json",
        data_dir=data_dir,
        ipfs_gateway=file_server[1] + "/",
        allow_local_hosts=True,
        attest_api_key=API_KEY,
        inspect_listing_images=True,
        reservation_ttl_seconds=1800,
    )
    opts.update(kw)
    return svc.Settings(**opts)


def _hdr(wallet: str, **extra) -> dict[str, str]:
    h = {"X-API-Key": API_KEY, "X-Authenticated-Wallet": wallet}
    h.update(extra)
    return h


def _publish(file_server, name: str, img) -> str:
    root, _ = file_server
    path = synth.write_image(img, str(root / f"{name}.jpg"))
    return f"ipfs://{path.replace(chr(92), '/').split('/')[-1]}"


def _photo(item, seed, short, nonce_hex, **kw):
    for k in range(6):
        img = synth.photograph(item, seed + 1000 * k, short, **kw)
        if short is None or ec.check_nonce(img, nonce_hex).found:
            return img
    raise AssertionError("OCR không đọc được nonce sau 6 lần thử")


def _sign_listing(chain, key: str, tid: int, uri: str) -> str:
    msg = listing_message(31337, chain.escrow.address, tid, uri)
    return Account.sign_message(encode_defunct(text=msg), private_key=key).signature.hex()


def test_full_marketplace_to_escrow_and_ai_attest_end_to_end(anvil, chain, file_server, tmp_path):
    app = svc.create_app(_settings(anvil, chain, file_server, tmp_path / "data"))
    c = TestClient(app)
    seller_addr = chain.acct["seller"].address
    buyer_addr = chain.acct["buyer"].address
    stranger_addr = chain.acct["stranger"].address

    # 1. Seller publishes collectible item photo + gallery photo -> creates listing
    item = synth.make_item(101)
    primary_uri = _publish(file_server, "mkt_lego_101", item)
    detail_uri = _publish(file_server, "mkt_lego_101_detail", item)

    r_list = c.post(
        "/listings",
        json={
            "sku": "LEGO-10305-E2E",
            "category": "LEGO",
            "title": "LEGO Lion Knights Castle Mint",
            "description": "Nguyên hộp, góc vuông sắc nét.",
            "price_wei": str(ITEM_VALUE),
            "condition": "SEALED_NEW",
            "quantity_total": 1,
            "images": [
                {"uri": primary_uri, "is_primary": True},
                {"uri": detail_uri, "is_primary": False},
            ],
        },
        headers=_hdr(seller_addr),
    )
    assert r_list.status_code == 201, r_list.text
    listing = r_list.json()
    lid = listing["id"]
    assert listing["primary_image_sha256"] and listing["primary_image_phash"]

    # 2. Buyer finds listing & submits purchase request
    found = c.get("/listings", params={"q": "Lion Knights", "category": "LEGO"}).json()
    assert found["total"] == 1 and found["items"][0]["id"] == lid
    r_req = c.post(
        f"/listings/{lid}/requests",
        json={"quantity": 1, "buyer_note": "Đóng thùng carton hai lớp giúp mình."},
        headers=_hdr(buyer_addr),
    )
    assert r_req.status_code == 201
    req_id = r_req.json()["id"]

    # 3. Seller accepts -> atomic reserve (quantity=1 -> status RESERVED)
    r_acc = c.post(f"/requests/{req_id}/decision", json={"action": "accept"}, headers=_hdr(seller_addr))
    assert r_acc.status_code == 200 and r_acc.json()["status"] == "ACCEPTED"
    assert c.get(f"/listings/{lid}").json()["status"] == "RESERVED"

    # 4. Seller creates REAL trade on Anvil Escrow
    rcpt = chain.tx("seller", chain.escrow.functions.createTrade(buyer_addr, ITEM_VALUE))
    tx_hash = Web3.to_hex(rcpt["transactionHash"])
    tid = chain.escrow.functions.nextTradeId().call() - 1

    # Negative check A: Receipt from OTHER Escrow contract must be rejected (422)
    other_rcpt = chain.tx("seller", chain.other_escrow.functions.createTrade(buyer_addr, ITEM_VALUE))
    other_tx_hash = Web3.to_hex(other_rcpt["transactionHash"])
    r_wrong_escrow = c.post(
        f"/requests/{req_id}/bind-trade",
        json={"tx_hash": other_tx_hash, "trade_id": 1},
        headers=_hdr(seller_addr),
    )
    assert r_wrong_escrow.status_code == 422
    assert r_wrong_escrow.json()["error_code"] == "WRONG_CONTRACT_ADDRESS"

    # Negative check B: Non-seller (buyer/stranger) cannot bind-trade (403)
    assert c.post(
        f"/requests/{req_id}/bind-trade",
        json={"tx_hash": tx_hash, "trade_id": tid},
        headers=_hdr(buyer_addr),
    ).status_code == 403

    # 5. Valid bind-trade succeeds -> links listingId <-> tradeId & transitions ESCROW_CREATED
    r_bind = c.post(
        f"/requests/{req_id}/bind-trade",
        json={"tx_hash": tx_hash, "trade_id": tid},
        headers=_hdr(seller_addr),
    )
    assert r_bind.status_code == 200, r_bind.text
    bound = r_bind.json()
    assert bound["status"] == "ESCROW_CREATED"
    assert bound["trade_id"] == tid
    assert bound["synced_state"] == "Created"

    # Duplicate bind on another request with SAME tx_hash or trade_id must be rejected (409)
    r_list2 = c.post(
        "/listings",
        json={
            "sku": "LEGO-DUP-BIND",
            "category": "LEGO",
            "title": "Second Listing",
            "price_wei": str(ITEM_VALUE),
            "condition": "LIKE_NEW",
            "quantity_total": 1,
            "images": [{"uri": detail_uri, "is_primary": True}],
        },
        headers=_hdr(seller_addr),
    ).json()
    req2_id = c.post(f"/listings/{r_list2['id']}/requests", json={"quantity": 1}, headers=_hdr(buyer_addr)).json()["id"]
    c.post(f"/requests/{req2_id}/decision", json={"action": "accept"}, headers=_hdr(seller_addr))
    r_dup_bind = c.post(
        f"/requests/{req2_id}/bind-trade",
        json={"tx_hash": tx_hash, "trade_id": tid},
        headers=_hdr(seller_addr),
    )
    assert r_dup_bind.status_code == 409

    # 6. Both parties deposit 30% AVAX on-chain (CDU Soulbound minted 1:1!)
    dep = chain.escrow.functions.getTrade(tid).call()[3]
    chain.tx("seller", chain.escrow.functions.deposit(tid), dep)
    chain.tx("buyer", chain.escrow.functions.deposit(tid), dep)
    assert chain.token.functions.balanceOf(seller_addr).call() == dep
    assert chain.token.functions.balanceOf(buyer_addr).call() == dep

    # Sync trade -> AwaitingEvidence; trade context returns linked listing!
    r_sync1 = c.post(f"/trades/{tid}/sync", headers=_hdr(buyer_addr))
    assert r_sync1.status_code == 200
    assert r_sync1.json()["synced_state"] == "AwaitingEvidence"
    ctx = c.get(f"/trades/{tid}/context").json()
    assert ctx["bound"] is True and ctx["listing_id"] == lid and ctx["listing"]["sku"] == "LEGO-10305-E2E"

    # 7. Submit packing & unboxing evidence + run AutoAgent AI attest (must work cleanly!)
    nonce = Web3.to_hex(chain.escrow.functions.getTrade(tid).call()[6])
    short = ec.short_nonce(nonce)
    seller_ev = _publish(file_server, f"ev_s_{tid}", _photo(item, tid, short, nonce))
    buyer_ev = _publish(file_server, f"ev_b_{tid}", _photo(item, tid + 30, short, nonce, brightness=0.9))
    chain.tx("seller", chain.escrow.functions.submitEvidence(tid, evidence_hash_of(seller_ev)))
    chain.tx("buyer", chain.escrow.functions.submitEvidence(tid, evidence_hash_of(buyer_ev)))

    assert c.post(f"/trade/{tid}/uris", json={"role": "seller", "uri": seller_ev}, headers={"X-API-Key": API_KEY}).status_code == 200
    assert c.post(f"/trade/{tid}/uris", json={"role": "buyer", "uri": buyer_ev}, headers={"X-API-Key": API_KEY}).status_code == 200
    assert c.post(
        f"/trade/{tid}/uris",
        json={"role": "listing", "uri": primary_uri, "signature": _sign_listing(chain, SELLER, tid, primary_uri)},
        headers={"X-API-Key": API_KEY},
    ).status_code == 200

    app.state.agent.tick()
    trade_after_ai = chain.escrow.functions.getTrade(tid).call()
    assert trade_after_ai[15] == TradeState.Attested
    assert trade_after_ai[11] is False  # clean verify

    # 8. Resolve cleanly on-chain -> AutoAgent.tick() read-only reconciles listing -> SOLD!
    chain.warp(WINDOW + 1)
    chain.tx("stranger", chain.escrow.functions.resolveClean(tid))
    assert chain.token.functions.balanceOf(seller_addr).call() == 0

    app.state.agent.tick()  # AutoAgent.tick() reconciles read-only!
    final_listing = c.get(f"/listings/{lid}").json()
    assert final_listing["status"] == "SOLD"
    assert final_listing["quantity_sold"] == 1
    assert final_listing["quantity_reserved"] == 0
    assert c.get(f"/requests/{req_id}", headers=_hdr(buyer_addr)).json()["status"] == "COMPLETED"

    # Verify idempotent manual sync after already COMPLETED never double-counts quantity_sold!
    r_sync2 = c.post(f"/trades/{tid}/sync", headers=_hdr(seller_addr))
    assert r_sync2.status_code == 200 and r_sync2.json()["quantity_sold"] == 1
    assert c.post(f"/trades/{tid}/sync", headers=_hdr(stranger_addr)).status_code == 403


def test_bind_trade_recovery_after_expired_ttl_and_restart(anvil, chain, file_server, tmp_path):
    now = [1_700_000_000]
    s = _settings(anvil, chain, file_server, tmp_path / "rec_data", reservation_ttl_seconds=5)
    app1 = svc.create_app(s)
    app1.state.marketplace.clock = lambda: now[0]
    c1 = TestClient(app1)

    seller_addr = chain.acct["seller"].address
    buyer_addr = chain.acct["buyer"].address
    item = synth.make_item(202)
    uri = _publish(file_server, "rec_item_202", item)

    lid = c1.post(
        "/listings",
        json={
            "sku": "REC-CASE-01",
            "category": "FIGURE",
            "title": "Figure Recovery Case",
            "price_wei": str(ITEM_VALUE),
            "condition": "LIKE_NEW",
            "quantity_total": 1,
            "images": [{"uri": uri, "is_primary": True}],
        },
        headers=_hdr(seller_addr),
    ).json()["id"]

    req_id = c1.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_hdr(buyer_addr)).json()["id"]
    c1.post(f"/requests/{req_id}/decision", json={"action": "accept"}, headers=_hdr(seller_addr))

    # Advance past 5s TTL BEFORE any trade exists on Anvil -> chain is verified empty, so TTL expires cleanly!
    now[0] += 60
    assert c1.get(f"/requests/{req_id}", headers=_hdr(seller_addr)).json()["status"] == "EXPIRED"
    assert c1.get(f"/listings/{lid}").json()["quantity_reserved"] == 0

    # Simulate late on-chain createTrade + backend restart before recovery bind call (omit trade_id to test event extraction!)
    rcpt = chain.tx("seller", chain.escrow.functions.createTrade(buyer_addr, ITEM_VALUE))
    tx_hash = Web3.to_hex(rcpt["transactionHash"])
    tid = chain.escrow.functions.nextTradeId().call() - 1

    app2 = svc.create_app(s)
    app2.state.marketplace.clock = lambda: now[0]
    c2 = TestClient(app2)

    r_recover = c2.post(
        f"/requests/{req_id}/bind-trade",
        json={"tx_hash": tx_hash},
        headers=_hdr(seller_addr),
    )
    assert r_recover.status_code == 200, r_recover.text
    rec = r_recover.json()
    assert rec["recovered"] is True
    assert rec["status"] == "ESCROW_CREATED"
    assert rec["trade_id"] == tid
    assert c2.get(f"/listings/{lid}").json()["status"] == "RESERVED"

    # Calling bind-trade again idempotently succeeds cleanly
    r_retry = c2.post(f"/requests/{req_id}/bind-trade", json={"tx_hash": tx_hash, "trade_id": tid}, headers=_hdr(seller_addr))
    assert r_retry.status_code == 200 and r_retry.json()["recovered"] is True


def test_cancelled_onchain_trade_restores_listing_inventory(anvil, chain, file_server, tmp_path):
    s = _settings(anvil, chain, file_server, tmp_path / "cancel_data")
    app = svc.create_app(s)
    c = TestClient(app)

    seller_addr = chain.acct["seller"].address
    buyer_addr = chain.acct["buyer"].address
    item = synth.make_item(303)
    uri = _publish(file_server, "cancel_item_303", item)

    lid = c.post(
        "/listings",
        json={
            "sku": "CANCEL-RESTORE-01",
            "category": "COIN",
            "title": "Silver Dollar Restoration Test",
            "price_wei": str(ITEM_VALUE),
            "condition": "GRADED",
            "quantity_total": 1,
            "images": [{"uri": uri, "is_primary": True}],
        },
        headers=_hdr(seller_addr),
    ).json()["id"]

    req_id = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_hdr(buyer_addr)).json()["id"]
    c.post(f"/requests/{req_id}/decision", json={"action": "accept"}, headers=_hdr(seller_addr))
    rcpt = chain.tx("seller", chain.escrow.functions.createTrade(buyer_addr, ITEM_VALUE))
    tx_hash = Web3.to_hex(rcpt["transactionHash"])
    tid = chain.escrow.functions.nextTradeId().call() - 1
    assert c.post(f"/requests/{req_id}/bind-trade", json={"tx_hash": tx_hash, "trade_id": tid}, headers=_hdr(seller_addr)).status_code == 200

    # Seller cancels unfunded on-chain -> reconcile / sync restores listing stock to ACTIVE
    chain.tx("seller", chain.escrow.functions.cancelUnfunded(tid))
    r_sync = c.post(f"/trades/{tid}/sync", headers=_hdr(seller_addr))
    assert r_sync.status_code == 200
    assert r_sync.json()["synced_state"] == "Cancelled"
    assert r_sync.json()["request_status"] == "TRADE_CANCELLED"
    assert r_sync.json()["listing_status"] == "ACTIVE"
    assert r_sync.json()["quantity_reserved"] == 0


def test_remediation_two_buyers_ttl_unbound_trade_prevents_oversell_and_completes(anvil, chain, file_server, tmp_path):
    now = [1_700_000_000]
    s = _settings(anvil, chain, file_server, tmp_path / "remed_oversell", reservation_ttl_seconds=5)
    app1 = svc.create_app(s)
    app1.state.marketplace.clock = lambda: now[0]
    c1 = TestClient(app1)

    seller_addr = chain.acct["seller"].address
    buyer1_addr = chain.acct["buyer"].address
    buyer2_addr = chain.acct["stranger"].address
    item = synth.make_item(404)
    uri = _publish(file_server, "remed_404", item)

    lid = c1.post(
        "/listings",
        json={
            "sku": "REMED-QTY1-01",
            "category": "FIGURE",
            "title": "Limited Figure Qty 1 Remediation",
            "price_wei": str(ITEM_VALUE),
            "condition": "SEALED_NEW",
            "quantity_total": 1,
            "images": [{"uri": uri, "is_primary": True}],
        },
        headers=_hdr(seller_addr),
    ).json()["id"]

    # Both buyers submit purchase requests while item is available; Seller accepts Buyer 1
    req1 = c1.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_hdr(buyer1_addr)).json()["id"]
    req2 = c1.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_hdr(buyer2_addr)).json()["id"]
    assert c1.post(f"/requests/{req1}/decision", json={"action": "accept"}, headers=_hdr(seller_addr)).status_code == 200

    # Seller creates trade on Anvil cleanly, then bind-trade API fails before TTL passes!
    rcpt = chain.tx("seller", chain.escrow.functions.createTrade(buyer1_addr, ITEM_VALUE))
    tx_hash = Web3.to_hex(rcpt["transactionHash"])
    tid = chain.escrow.functions.nextTradeId().call() - 1

    # Advance well past 5s TTL
    now[0] += 60

    # Read endpoints + reconcile MUST keep req1 RESERVED/ACCEPTED because unbound trade exists on-chain!
    assert c1.get(f"/listings/{lid}").json()["quantity_reserved"] == 1
    assert c1.get(f"/listings/{lid}").json()["status"] == "RESERVED"
    assert c1.get(f"/requests/{req1}", headers=_hdr(buyer1_addr)).json()["status"] == "ACCEPTED"
    rec = c1.post("/marketplace/reconcile", headers=_hdr(seller_addr)).json()
    assert rec["expired_released"] == 0

    # Buyer 2 MUST NOT be able to reserve or get accepted after TTL passed
    r_b2_new = c1.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_hdr(buyer2_addr))
    assert r_b2_new.status_code == 409 and r_b2_new.json()["error_code"] == "LISTING_UNAVAILABLE"
    r_b2_acc = c1.post(f"/requests/{req2}/decision", json={"action": "accept"}, headers=_hdr(seller_addr))
    assert r_b2_acc.status_code == 409 and r_b2_acc.json()["error_code"] == "OUT_OF_STOCK_OR_RESERVED"

    # Attempting to cancel req1 while trade exists on Anvil is blocked with 409 ONCHAIN_TRADE_ALREADY_EXISTS
    r_cancel = c1.post(f"/requests/{req1}/cancel", headers=_hdr(buyer1_addr))
    assert r_cancel.status_code == 409 and r_cancel.json()["error_code"] == "ONCHAIN_TRADE_ALREADY_EXISTS"

    # Simulate backend restart, then retry bind-trade (first with Idempotency-Key & omitted trade_id)
    app2 = svc.create_app(s)
    app2.state.marketplace.clock = lambda: now[0]
    c2 = TestClient(app2)
    idem_h = _hdr(seller_addr, **{"Idempotency-Key": "remed-bind-anvil-1"})
    r_bind = c2.post(f"/requests/{req1}/bind-trade", json={"tx_hash": tx_hash}, headers=idem_h)
    assert r_bind.status_code == 200, r_bind.text
    b = r_bind.json()
    assert b["status"] == "ESCROW_CREATED"
    assert b["recovered"] is False
    assert b["trade_id"] == tid

    # Retries succeed idempotently without changing stock
    assert c2.post(f"/requests/{req1}/bind-trade", json={"tx_hash": tx_hash}, headers=idem_h).status_code == 200
    assert c2.post(f"/requests/{req1}/bind-trade", json={"tx_hash": tx_hash, "trade_id": tid}, headers=_hdr(seller_addr)).status_code == 200

    # Full Escrow completion (deposit + evidence + AI attest + resolveClean + reconcile) -> SOLD
    dep = chain.escrow.functions.getTrade(tid).call()[3]
    chain.tx("seller", chain.escrow.functions.deposit(tid), dep)
    chain.tx("buyer", chain.escrow.functions.deposit(tid), dep)
    nonce = Web3.to_hex(chain.escrow.functions.getTrade(tid).call()[6])
    short = ec.short_nonce(nonce)
    seller_ev = _publish(file_server, f"ev_remed_s_{tid}", _photo(item, tid + 100, short, nonce))
    buyer_ev = _publish(file_server, f"ev_remed_b_{tid}", _photo(item, tid + 200, short, nonce, brightness=0.9))
    chain.tx("seller", chain.escrow.functions.submitEvidence(tid, evidence_hash_of(seller_ev)))
    chain.tx("buyer", chain.escrow.functions.submitEvidence(tid, evidence_hash_of(buyer_ev)))
    assert c2.post(f"/trade/{tid}/uris", json={"role": "seller", "uri": seller_ev}, headers={"X-API-Key": API_KEY}).status_code == 200
    assert c2.post(f"/trade/{tid}/uris", json={"role": "buyer", "uri": buyer_ev}, headers={"X-API-Key": API_KEY}).status_code == 200
    assert c2.post(
        f"/trade/{tid}/uris",
        json={"role": "listing", "uri": uri, "signature": _sign_listing(chain, SELLER, tid, uri)},
        headers={"X-API-Key": API_KEY},
    ).status_code == 200

    app2.state.agent.tick()
    chain.warp(WINDOW + 1)
    chain.tx("stranger", chain.escrow.functions.resolveClean(tid))
    app2.state.agent.tick()

    final = c2.get(f"/listings/{lid}").json()
    assert final["status"] == "SOLD"
    assert final["quantity_sold"] == 1
    assert final["quantity_reserved"] == 0
    assert c2.post(f"/requests/{req2}/decision", json={"action": "accept"}, headers=_hdr(seller_addr)).status_code == 409


def test_remediation_unbound_cancelled_trade_releases_and_direct_resolved_bind(anvil, chain, file_server, tmp_path):
    now = [1_700_000_000]
    s = _settings(anvil, chain, file_server, tmp_path / "remed_cancel_res", reservation_ttl_seconds=5)
    app = svc.create_app(s)
    app.state.marketplace.clock = lambda: now[0]
    c = TestClient(app)

    seller_addr = chain.acct["seller"].address
    buyer1_addr = chain.acct["buyer"].address
    buyer2_addr = chain.acct["stranger"].address
    item = synth.make_item(505)
    uri = _publish(file_server, "remed_505", item)

    lid = c.post(
        "/listings",
        json={
            "sku": "REMED-CANCEL-RES-01",
            "category": "TRADING_CARD",
            "title": "Graded Card Unbound Cancel & Direct Resolve",
            "price_wei": str(ITEM_VALUE),
            "condition": "GRADED",
            "quantity_total": 1,
            "images": [{"uri": uri, "is_primary": True}],
        },
        headers=_hdr(seller_addr),
    ).json()["id"]

    # 1) Unbound trade blocks TTL expiry, then cancelUnfunded on Anvil restores stock safely!
    req1 = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_hdr(buyer1_addr)).json()["id"]
    c.post(f"/requests/{req1}/decision", json={"action": "accept"}, headers=_hdr(seller_addr))
    chain.tx("seller", chain.escrow.functions.createTrade(buyer1_addr, ITEM_VALUE))
    tid1 = chain.escrow.functions.nextTradeId().call() - 1

    now[0] += 60
    assert c.get(f"/requests/{req1}", headers=_hdr(buyer1_addr)).json()["status"] == "ACCEPTED"

    chain.tx("seller", chain.escrow.functions.cancelUnfunded(tid1))
    assert c.get(f"/requests/{req1}", headers=_hdr(buyer1_addr)).json()["status"] == "EXPIRED"
    assert c.get(f"/listings/{lid}").json()["status"] == "ACTIVE"
    assert c.get(f"/listings/{lid}").json()["quantity_reserved"] == 0

    # 2) Buyer 2 reserves, completes full on-chain trade BEFORE calling bind-trade -> bind moves ACCEPTED -> RESOLVED cleanly!
    req2 = c.post(f"/listings/{lid}/requests", json={"quantity": 1}, headers=_hdr(buyer2_addr)).json()["id"]
    assert c.post(f"/requests/{req2}/decision", json={"action": "accept"}, headers=_hdr(seller_addr)).status_code == 200
    rcpt2 = chain.tx("seller", chain.escrow.functions.createTrade(buyer2_addr, ITEM_VALUE))
    tx2 = Web3.to_hex(rcpt2["transactionHash"])
    tid2 = chain.escrow.functions.nextTradeId().call() - 1
    dep2 = chain.escrow.functions.getTrade(tid2).call()[3]
    chain.tx("seller", chain.escrow.functions.deposit(tid2), dep2)
    chain.tx("stranger", chain.escrow.functions.deposit(tid2), dep2)
    nonce2 = Web3.to_hex(chain.escrow.functions.getTrade(tid2).call()[6])
    short2 = ec.short_nonce(nonce2)
    s_ev = _publish(file_server, f"ev_res_s_{tid2}", _photo(item, tid2 + 300, short2, nonce2))
    b_ev = _publish(file_server, f"ev_res_b_{tid2}", _photo(item, tid2 + 400, short2, nonce2, brightness=0.9))
    chain.tx("seller", chain.escrow.functions.submitEvidence(tid2, evidence_hash_of(s_ev)))
    chain.tx("stranger", chain.escrow.functions.submitEvidence(tid2, evidence_hash_of(b_ev)))
    c.post(f"/trade/{tid2}/uris", json={"role": "seller", "uri": s_ev}, headers={"X-API-Key": API_KEY})
    c.post(f"/trade/{tid2}/uris", json={"role": "buyer", "uri": b_ev}, headers={"X-API-Key": API_KEY})
    c.post(f"/trade/{tid2}/uris", json={"role": "listing", "uri": uri, "signature": _sign_listing(chain, SELLER, tid2, uri)}, headers={"X-API-Key": API_KEY})
    app.state.agent.tick()
    chain.warp(WINDOW + 1)
    chain.tx("buyer", chain.escrow.functions.resolveClean(tid2))

    # Late bind-trade directly from ACCEPTED to Resolved on-chain MUST NOT trigger SQLite CHECK failure!
    r_bind2 = c.post(f"/requests/{req2}/bind-trade", json={"tx_hash": tx2, "trade_id": tid2}, headers=_hdr(seller_addr))
    assert r_bind2.status_code == 200, r_bind2.text
    assert r_bind2.json()["status"] == "COMPLETED"
    final = c.get(f"/listings/{lid}").json()
    assert final["status"] == "SOLD"
    assert final["quantity_reserved"] == 0
    assert final["quantity_sold"] == 1
