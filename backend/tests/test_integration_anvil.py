"""
Integration test: contract thật trên anvil ↔ backend FastAPI ↔ AI pipeline thật.

Luồng mỗi kịch bản: deploy → createTrade → deposit x2 → sinh ảnh có nonce ĐỌC TỪ
CHAIN → submitEvidence(keccak(url)) x2 → POST /verify-evidence (backend tự ký
attest()) → kiểm tra state/reportHash on-chain → resolveClean / dispute.

Yêu cầu: Foundry (anvil) + `forge build` đã chạy trong contracts/ + Tesseract.
"""

import json

import pytest
from fastapi.testclient import TestClient
from web3 import Web3

import attest_service as svc
import evidence_check as ec
import synth
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


def _artifact(name):
    f = OUT / f"{name}.sol" / f"{name}.json"
    if not f.exists():
        pytest.skip(f"Thiếu {f} — chạy `forge build` trong contracts/")
    d = json.loads(f.read_text(encoding="utf-8"))
    return d["abi"], d["bytecode"]["object"]


def _ocr_ok():
    try:
        ec.pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(ec.pytesseract is None or not _ocr_ok(), reason="Tesseract chưa cài")


class Chain:
    def __init__(self, url):
        self.w3 = Web3(Web3.HTTPProvider(url))
        self.acct = {k: self.w3.eth.account.from_key(v) for k, v in
                     dict(deployer=DEPLOYER, agent=AGENT, seller=SELLER, buyer=BUYER, stranger=STRANGER).items()}
        tok_abi, tok_bin = _artifact("CollectibleToken")
        esc_abi, esc_bin = _artifact("Escrow")
        self.token = self._deploy(tok_abi, tok_bin)
        self.escrow = self._deploy(esc_abi, esc_bin, self.token.address, self.acct["agent"].address,
                                   WINDOW, WINDOW, WINDOW)
        self.tx("deployer", self.token.functions.setEscrow(self.escrow.address))
        self.esc_abi = esc_abi

    def _deploy(self, abi, bytecode, *args):
        c = self.w3.eth.contract(abi=abi, bytecode=bytecode)
        r = self.tx("deployer", c.constructor(*args))
        return self.w3.eth.contract(address=r["contractAddress"], abi=abi)

    def tx(self, who, fn, value=0):
        a = self.acct[who]
        t = fn.build_transaction({"from": a.address, "value": value,
                                  "nonce": self.w3.eth.get_transaction_count(a.address, "pending")})
        h = self.w3.eth.send_raw_transaction(a.sign_transaction(t).raw_transaction)
        r = self.w3.eth.wait_for_transaction_receipt(h)
        assert r["status"] == 1, f"tx reverted: {fn.fn_name}"
        return r

    def warp(self, secs):
        self.w3.provider.make_request("evm_increaseTime", [secs])
        self.w3.provider.make_request("evm_mine", [])

    def trade(self, tid):
        return self.escrow.functions.getTrade(tid).call()

    def balance(self, who):
        return self.w3.eth.get_balance(self.acct[who].address)

    def funded_trade(self):
        self.tx("seller", self.escrow.functions.createTrade(self.acct["buyer"].address, ITEM_VALUE))
        tid = self.escrow.functions.nextTradeId().call() - 1
        dep = self.trade(tid)[3]
        self.tx("seller", self.escrow.functions.deposit(tid), dep)
        self.tx("buyer", self.escrow.functions.deposit(tid), dep)
        return tid


@pytest.fixture(scope="module")
def chain(anvil):
    return Chain(anvil)


def _settings(anvil, chain, file_server, data_dir, agent_key=AGENT):
    """file_server đóng vai IPFS gateway: ipfs://<tên file> → http://127.0.0.1:<port>/<tên file>.
    Gateway chạy trên loopback nên phải bật allow_local_hosts (chỉ cho test)."""
    return svc.Settings(
        rpc_url=anvil, agent_private_key=agent_key, escrow_address=chain.escrow.address,
        escrow_abi_path=OUT / "Escrow.sol" / "Escrow.json", data_dir=data_dir,
        ipfs_gateway=file_server[1] + "/", allow_local_hosts=True,
    )


@pytest.fixture
def client(chain, anvil, file_server, tmp_path):
    # App mới cho mỗi test: rate limiter (10 req/phút/IP) nằm trong app, dùng chung
    # một app cho cả module sẽ dính 429 giữa chừng.
    return TestClient(svc.create_app(_settings(anvil, chain, file_server, tmp_path)))


def _publish(file_server, name, img=None, frames=None):
    """Ghi file vào thư mục của gateway giả, trả URI ipfs:// như frontend gửi thật."""
    root, _ = file_server
    if frames is not None:
        path = synth.write_video(frames, str(root / f"{name}.mp4"))
    else:
        path = synth.write_image(img, str(root / f"{name}.jpg"))
    return f"ipfs://{path.replace(chr(92), '/').split('/')[-1]}"


def _photo(item, seed, short, nonce_hex, **kw):
    """Ảnh có nonce mà OCR chắc chắn đọc được. Nonce on-chain là ngẫu nhiên và OCR
    trên font tổng hợp đạt ~99% (đo ở ai-pipeline), nên đổi góc chụp nếu lỡ trượt —
    test này kiểm tra đường ống backend ↔ chain, độ chính xác OCR có unit test riêng."""
    for k in range(6):
        img = synth.photograph(item, seed + 1000 * k, short, **kw)
        if short is None or ec.check_nonce(img, nonce_hex).found:
            return img
    raise AssertionError("OCR không đọc được nonce sau 6 lần thử")


def _evidence(chain, file_server, tid, *, seller_nonce=True, buyer_nonce=True, item_seed=11,
              buyer_item_seed=None, buyer_video=False, seller_img=None):
    """Sinh ảnh với nonce thật của trade, publish qua gateway giả, neo keccak(url) on-chain."""
    nonce = Web3.to_hex(chain.trade(tid)[6])
    short = ec.short_nonce(nonce)
    item = synth.make_item(item_seed)
    buyer_item = synth.make_item(buyer_item_seed) if buyer_item_seed is not None else item
    listing = _publish(file_server, f"t{tid}_listing", item)
    seller = _publish(file_server, f"t{tid}_seller",
                      seller_img if seller_img is not None else _photo(item, tid, short if seller_nonce else None, nonce))
    if buyer_video:
        buyer = _publish(file_server, f"t{tid}_buyer", frames=synth.unbox_frames(buyer_item, short if buyer_nonce else None))
    else:
        buyer = _publish(file_server, f"t{tid}_buyer",
                         _photo(buyer_item, tid + 50, short if buyer_nonce else None, nonce, brightness=0.9))
    chain.tx("seller", chain.escrow.functions.submitEvidence(tid, evidence_hash_of(seller)))
    chain.tx("buyer", chain.escrow.functions.submitEvidence(tid, evidence_hash_of(buyer)))
    return {"trade_id": tid, "listing_image_url": listing, "seller_evidence_url": seller, "buyer_evidence_url": buyer}


# ---------------------------------------------------------------------------

def test_health(client, chain):
    body = client.get("/health").json()
    assert body["ok"] is True, body
    assert body["chain_id"] == 31337
    assert body["agent"] == chain.acct["agent"].address
    assert body["agent_matches_contract"] is True
    assert body["tesseract"] is True


def test_clean_trade_end_to_end(client, chain, file_server):
    s0, b0 = chain.balance("seller"), chain.balance("buyer")
    tid = chain.funded_trade()
    req = _evidence(chain, file_server, tid)

    r = client.post("/verify-evidence", json=req)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["attested"] and body["tx_hash"].startswith("0x")
    assert body["report"]["flagged"] is False, body["report"]["notes"]
    assert body["report"]["nonce_ok_seller"] and body["report"]["nonce_ok_buyer"]
    assert body["match_visual_png_b64"]

    t = chain.trade(tid)
    assert t[15] == TradeState.Attested
    assert t[10] == body["report"]["risk_score"]
    assert t[11] is False
    # reportHash on-chain == keccak256(report_json) — ai cũng kiểm chứng lại được
    assert Web3.to_hex(t[9]) == body["report_hash"] == Web3.to_hex(Web3.keccak(text=body["report_json"]))

    # Report được lưu và trả lại qua GET /report
    saved = client.get(f"/report/{tid}").json()
    assert saved["report_hash"] == body["report_hash"]
    assert saved["evidence"]["seller_evidence_url"] == req["seller_evidence_url"]

    # /trade endpoint
    info = client.get(f"/trade/{tid}").json()
    assert info["state"] == "Attested" and info["nonce_short"] == ec.short_nonce(Web3.to_hex(t[6]))

    # Hết dispute window → giải ngân sạch, hoàn đủ cọc
    chain.warp(WINDOW + 1)
    chain.tx("stranger", chain.escrow.functions.resolveClean(tid))
    assert chain.trade(tid)[15] == TradeState.Resolved
    assert chain.token.functions.totalSupply().call() == 0
    gas_tolerance = Web3.to_wei(0.01, "ether")
    assert s0 - chain.balance("seller") < gas_tolerance
    assert b0 - chain.balance("buyer") < gas_tolerance


def test_verify_again_after_attest_conflict(client, chain, file_server):
    tid = chain.funded_trade()
    req = _evidence(chain, file_server, tid)
    assert client.post("/verify-evidence", json=req).status_code == 200
    r = client.post("/verify-evidence", json=req)
    assert r.status_code == 409 and "Attested" in r.json()["detail"]


def test_missing_buyer_nonce_flags_and_dispute_slashes(client, chain, file_server):
    tid = chain.funded_trade()
    req = _evidence(chain, file_server, tid, buyer_nonce=False)

    body = client.post("/verify-evidence", json=req).json()
    assert body["report"]["flagged"] is True
    assert body["report"]["nonce_ok_buyer"] is False
    assert chain.trade(tid)[11] is True

    # flagged → không auto-resolve, ai cũng đẩy sang dispute được
    chain.warp(WINDOW + 1)
    chain.tx("stranger", chain.escrow.functions.fileComplaint(tid))
    assert chain.trade(tid)[15] == TradeState.Disputed

    dep = chain.trade(tid)[3]
    penalty = dep * 500 // 10000
    s0, b0 = chain.balance("seller"), chain.balance("buyer")
    chain.tx("deployer", chain.escrow.functions.resolveDispute(tid, chain.acct["buyer"].address))
    assert chain.balance("seller") - s0 == dep + penalty
    assert chain.balance("buyer") - b0 == dep - penalty


def test_wrong_item_shipped_is_high_risk(client, chain, file_server):
    tid = chain.funded_trade()
    req = _evidence(chain, file_server, tid, item_seed=21, buyer_item_seed=77)
    body = client.post("/verify-evidence", json=req).json()
    assert body["report"]["details"]["inliers_listing_buyer"] < ec.MIN_GOOD_INLIERS
    assert body["report"]["risk_score"] >= 50


def test_buyer_video_evidence(client, chain, file_server):
    tid = chain.funded_trade()
    req = _evidence(chain, file_server, tid, buyer_video=True, item_seed=31)
    body = client.post("/verify-evidence", json=req).json()
    assert body["report"]["details"]["buyer_evidence_kind"] == "video"
    assert body["report"]["nonce_ok_buyer"] is True
    assert body["report"]["flagged"] is False, body["report"]["notes"]


def test_reused_photo_across_trades_flagged(client, chain, file_server):
    # Trade A sạch → pHash ảnh seller vào kho
    tid_a = chain.funded_trade()
    nonce_a = ec.short_nonce(Web3.to_hex(chain.trade(tid_a)[6]))
    old_photo = _photo(synth.make_item(41), 3, nonce_a, Web3.to_hex(chain.trade(tid_a)[6]))
    req_a = _evidence(chain, file_server, tid_a, item_seed=41, seller_img=old_photo)
    assert client.post("/verify-evidence", json=req_a).json()["report"]["flagged"] is False

    # Trade B: seller dùng lại đúng ảnh cũ (nonce cũ) → tái sử dụng + sai nonce
    tid_b = chain.funded_trade()
    req_b = _evidence(chain, file_server, tid_b, item_seed=41, seller_img=old_photo)
    rep = client.post("/verify-evidence", json=req_b).json()["report"]
    assert rep["phash_reused"] is True
    assert rep["nonce_ok_seller"] is False
    assert rep["flagged"] is True


def test_evidence_url_must_match_onchain_hash(client, chain, file_server):
    tid = chain.funded_trade()
    req = _evidence(chain, file_server, tid)
    tampered = dict(req, seller_evidence_url=req["listing_image_url"])  # đổi ảnh sau khi neo
    r = client.post("/verify-evidence", json=tampered)
    assert r.status_code == 422 and "sellerEvidenceHash" in r.json()["detail"]
    assert chain.trade(tid)[15] == TradeState.AwaitingEvidence


def test_dry_run_does_not_attest(client, chain, file_server):
    tid = chain.funded_trade()
    req = _evidence(chain, file_server, tid)
    body = client.post("/verify-evidence", json=dict(req, dry_run=True, include_visual=False)).json()
    assert body["attested"] is False and body["tx_hash"] is None and body["match_visual_png_b64"] is None
    assert chain.trade(tid)[15] == TradeState.AwaitingEvidence
    assert client.get(f"/report/{tid}").status_code == 404


def test_not_funded_conflict(client, chain):
    chain.tx("seller", chain.escrow.functions.createTrade(chain.acct["buyer"].address, ITEM_VALUE))
    tid = chain.escrow.functions.nextTradeId().call() - 1
    r = client.post("/verify-evidence", json={"trade_id": tid, "listing_image_url": "ipfs://a",
                                              "seller_evidence_url": "ipfs://b", "buyer_evidence_url": "ipfs://c"})
    assert r.status_code == 409 and "Created" in r.json()["detail"]


def test_missing_evidence_conflict(client, chain):
    tid = chain.funded_trade()
    r = client.post("/verify-evidence", json={"trade_id": tid, "listing_image_url": "ipfs://a",
                                              "seller_evidence_url": "ipfs://b", "buyer_evidence_url": "ipfs://c"})
    assert r.status_code == 409 and "bằng chứng" in r.json()["detail"]


def test_unknown_trade_404(client):
    r = client.post("/verify-evidence", json={"trade_id": 99999, "listing_image_url": "ipfs://a",
                                              "seller_evidence_url": "ipfs://b", "buyer_evidence_url": "ipfs://c"})
    assert r.status_code == 404


def test_broken_image_422(client, chain, file_server):
    root, _ = file_server
    tid = chain.funded_trade()
    (root / f"t{tid}_broken.jpg").write_bytes(b"definitely not a jpeg")
    req = _evidence(chain, file_server, tid)
    # listing không neo on-chain → thay listing bằng file hỏng
    r = client.post("/verify-evidence", json=dict(req, listing_image_url=f"ipfs://t{tid}_broken.jpg"))
    assert r.status_code == 422


def test_wrong_agent_key_gives_502(chain, anvil, file_server, tmp_path):
    c = TestClient(svc.create_app(_settings(anvil, chain, file_server, tmp_path, agent_key=STRANGER)))
    assert c.get("/health").json()["agent_matches_contract"] is False
    tid = chain.funded_trade()
    req = _evidence(chain, file_server, tid)
    r = c.post("/verify-evidence", json=dict(req, include_visual=False))
    assert r.status_code == 502 and "not agent" in r.json()["detail"]


# ---------------------------------------------------------------------------
# Agent tự động (DEC-005 phương án A): sổ URI + vòng quét tự attest
# ---------------------------------------------------------------------------

from eth_account import Account  # noqa: E402
from eth_account.messages import encode_defunct  # noqa: E402

from auto_agent import listing_message  # noqa: E402


def _sign_listing(chain, key, tid, uri):
    msg = listing_message(31337, chain.escrow.address, tid, uri)
    return Account.sign_message(encode_defunct(text=msg), private_key=key).signature.hex()


def _register_all(c, chain, tid, req):
    for role in ("seller", "buyer"):
        r = c.post(f"/trade/{tid}/uris", json={"role": role, "uri": req[f"{role}_evidence_url"]})
        assert r.status_code == 200, r.text
    r = c.post(f"/trade/{tid}/uris", json={"role": "listing", "uri": req["listing_image_url"],
                                          "signature": _sign_listing(chain, SELLER, tid, req["listing_image_url"])})
    assert r.status_code == 200, r.text


def _agent_app(chain, anvil, file_server, data_dir):
    app = svc.create_app(_settings(anvil, chain, file_server, data_dir))
    return app, TestClient(app)


def test_auto_agent_attests_without_manual_call(chain, anvil, file_server, tmp_path):
    app, c = _agent_app(chain, anvil, file_server, tmp_path)
    tid = chain.funded_trade()
    assert c.get(f"/agent/status/{tid}").json()["phase"] == "waiting_evidence"

    req = _evidence(chain, file_server, tid)
    st = c.get(f"/agent/status/{tid}").json()
    assert st["phase"] == "waiting_uris" and set(st["missing_uris"]) == {"listing", "seller", "buyer"}

    app.state.agent.tick()  # chưa có URI → agent không làm gì
    assert chain.trade(tid)[15] == TradeState.AwaitingEvidence

    _register_all(c, chain, tid, req)
    assert c.get(f"/agent/status/{tid}").json()["phase"] == "queued"

    app.state.agent.tick()  # KHÔNG ai gọi /verify-evidence
    t = chain.trade(tid)
    assert t[15] == TradeState.Attested and t[11] is False
    saved = c.get(f"/report/{tid}").json()
    assert Web3.to_hex(t[9]) == saved["report_hash"]
    assert c.get(f"/agent/status/{tid}").json()["phase"] == "attested"

    app.state.agent.tick()  # nhịp sau không attest lại, không lỗi
    assert app.state.agent.status[tid]["attempts"] == 1


def test_auto_agent_flags_fraud(chain, anvil, file_server, tmp_path):
    app, c = _agent_app(chain, anvil, file_server, tmp_path)
    tid = chain.funded_trade()
    req = _evidence(chain, file_server, tid, buyer_nonce=False, item_seed=51)
    _register_all(c, chain, tid, req)
    app.state.agent.tick()
    t = chain.trade(tid)
    assert t[15] == TradeState.Attested and t[11] is True


def test_auto_agent_resumes_after_restart(chain, anvil, file_server, tmp_path):
    _, c1 = _agent_app(chain, anvil, file_server, tmp_path)
    tid = chain.funded_trade()
    req = _evidence(chain, file_server, tid, item_seed=61)
    _register_all(c1, chain, tid, req)

    app2, _ = _agent_app(chain, anvil, file_server, tmp_path)  # backend khởi động lại, cùng data_dir
    app2.state.agent.tick()
    assert chain.trade(tid)[15] == TradeState.Attested


def test_register_uri_validation(chain, anvil, file_server, tmp_path):
    _, c = _agent_app(chain, anvil, file_server, tmp_path)
    tid = chain.funded_trade()
    # bằng chứng chưa neo on-chain
    r = c.post(f"/trade/{tid}/uris", json={"role": "seller", "uri": "ipfs://whatever"})
    assert r.status_code == 409
    req = _evidence(chain, file_server, tid, item_seed=71)
    listing = req["listing_image_url"]
    # URI không khớp hash on-chain
    r = c.post(f"/trade/{tid}/uris", json={"role": "seller", "uri": req["buyer_evidence_url"]})
    assert r.status_code == 422 and "sellerEvidenceHash" in r.json()["detail"]
    # không phải ipfs://
    assert c.post(f"/trade/{tid}/uris", json={"role": "buyer", "uri": "http://x/a.jpg"}).status_code == 422
    # ảnh niêm yết: thiếu chữ ký / chữ ký của người khác / chữ ký cho URI khác
    assert c.post(f"/trade/{tid}/uris", json={"role": "listing", "uri": listing}).status_code == 422
    r = c.post(f"/trade/{tid}/uris", json={"role": "listing", "uri": listing,
                                          "signature": _sign_listing(chain, BUYER, tid, listing)})
    assert r.status_code == 403
    r = c.post(f"/trade/{tid}/uris", json={"role": "listing", "uri": listing,
                                          "signature": _sign_listing(chain, SELLER, tid, "ipfs://other")})
    assert r.status_code == 403
    # hợp lệ, gửi lại y hệt vẫn OK, đổi sang URI khác thì bị từ chối
    sig = _sign_listing(chain, SELLER, tid, listing)
    assert c.post(f"/trade/{tid}/uris", json={"role": "listing", "uri": listing, "signature": sig}).status_code == 200
    assert c.post(f"/trade/{tid}/uris", json={"role": "listing", "uri": listing, "signature": sig}).status_code == 200
    other = req["seller_evidence_url"]
    r = c.post(f"/trade/{tid}/uris", json={"role": "listing", "uri": other,
                                          "signature": _sign_listing(chain, SELLER, tid, other)})
    assert r.status_code == 409
    assert c.get(f"/trade/{tid}/uris").json()["uris"] == {"listing": listing}
    assert c.post("/trade/99999/uris", json={"role": "buyer", "uri": "ipfs://a-b-c"}).status_code == 404


def test_auto_agent_retries_then_gives_up(chain, anvil, file_server, tmp_path, monkeypatch):
    app, c = _agent_app(chain, anvil, file_server, tmp_path)
    agent = app.state.agent
    monkeypatch.setattr(agent, "RETRY_DELAY", 0.0)
    root, _ = file_server
    tid = chain.funded_trade()
    req = _evidence(chain, file_server, tid, item_seed=81)
    (root / f"t{tid}_broken.jpg").write_bytes(b"definitely not a jpeg")
    req["listing_image_url"] = f"ipfs://t{tid}_broken.jpg"
    _register_all(c, chain, tid, req)

    agent.tick()
    st = c.get(f"/agent/status/{tid}").json()
    assert st["phase"] == "retrying" and st["attempts"] == 1 and st["detail"]
    for _ in range(agent.MAX_ATTEMPTS - 1):
        agent.tick()
    assert c.get(f"/agent/status/{tid}").json()["phase"] == "failed"
    agent.tick()  # đã bỏ cuộc → không thử thêm
    assert agent.status[tid]["attempts"] == agent.MAX_ATTEMPTS
    assert chain.trade(tid)[15] == TradeState.AwaitingEvidence
    # nút thủ công vẫn dùng được như phương án dự phòng (ở đây vẫn 422 vì ảnh hỏng)
    assert c.post("/verify-evidence", json=req).status_code == 422
