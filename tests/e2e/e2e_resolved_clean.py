#!/usr/bin/env python3
"""Auto E2E — Happy Path ResolvedClean (Seller + Buyer + Agent) trên Avalanche Fuji 43113 hoặc Anvil.

Chạy toàn bộ luồng qua API marketplace THẬT của backend (in-process FastAPI app, cùng code
Final Freeze) + hợp đồng Escrow THẬT:
  listing (ảnh IPFS) → purchase request → accept → createTrade → bind-trade → deposit 30% ×2
  → evidence có QR/OCR nonce → pin IPFS → submitEvidence(keccak256(utf8(uri))) ×2 → đăng ký URI
  → Agent (ví được ủy quyền) verify + attest(flagged=false) → chờ DISPUTE_WINDOW → resolveClean
  → kiểm tra event ResolvedClean, hoàn cọc, CDU burn, reputation, listing SOLD.

Không in private key / JWT / API key. Khóa chỉ được đọc từ file local do Owner cấp quyền.

  python tests/e2e/e2e_resolved_clean.py --network fuji --testers <testers.json> \
      --backend-env backend/.env --root-env .env --out <dir>
  python tests/e2e/e2e_resolved_clean.py --network anvil --rpc http://127.0.0.1:8545 --out <dir>
"""
from __future__ import annotations

import argparse
import functools
import hashlib
import json
import os
import secrets
import sys
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "ai-pipeline"), str(ROOT / "ai-pipeline" / "tests")]

from eth_account import Account  # noqa: E402
from eth_account.messages import encode_defunct  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from web3 import Web3  # noqa: E402

import attest_service as svc  # noqa: E402
import evidence_check as ec  # noqa: E402
import synth  # noqa: E402
from auto_agent import listing_message  # noqa: E402
from chain import evidence_hash_of  # noqa: E402
from listings import compute_proxy_signature  # noqa: E402

STATES = ["Created", "AwaitingEvidence", "Attested", "Disputed", "Resolved", "Cancelled"]
ANVIL_KEYS = {  # khóa MẶC ĐỊNH CÔNG KHAI của anvil (#0 owner, #1 agent, #2 seller, #3 buyer) — chỉ dùng cho Anvil
    "owner": "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "agent": "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    "seller": "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    "buyer": "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
}
SNOWTRACE = "https://testnet.snowtrace.io/tx/"


def load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


class Run:
    def __init__(self, args):
        self.args = args
        self.steps: list[dict] = []
        self.txs: list[dict] = []
        self.data: dict = {"network": args.network, "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

    def step(self, sid: str, name: str, status: str, detail: str = "") -> None:
        self.steps.append({"id": sid, "name": name, "status": status, "detail": detail})
        print(f"[{status:7}] {sid} {name} {detail}", flush=True)

    def save(self) -> None:
        out = Path(self.args.out)
        out.mkdir(parents=True, exist_ok=True)
        self.data.update({"steps": self.steps, "txs": self.txs, "finished_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
        (out / f"e2e-{self.args.network}-result.json").write_text(json.dumps(self.data, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--network", choices=["fuji", "anvil"], required=True)
    ap.add_argument("--rpc", default=None)
    ap.add_argument("--testers", type=Path, help="JSON {seller, buyer} private keys (Fuji) — Owner cấp quyền")
    ap.add_argument("--backend-env", type=Path, default=ROOT / "backend" / ".env")
    ap.add_argument("--root-env", type=Path, default=ROOT / ".env")
    ap.add_argument("--escrow", default=None, help="Anvil: địa chỉ Escrow vừa deploy")
    ap.add_argument("--item-value-wei", type=int, default=Web3.to_wei("0.01", "ether"))
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    R = Run(args)
    try:
        return run(R)
    except Exception as exc:  # noqa: BLE001
        R.step("ABORT", "Unhandled error", "FAIL", f"{type(exc).__name__}: {str(exc)[:400]}")
        return 1
    finally:
        R.save()


def run(R: Run) -> int:
    a = R.args
    fuji = a.network == "fuji"
    data_dir = Path(tempfile.mkdtemp(prefix=f"e2e_{a.network}_"))
    api_key = secrets.token_urlsafe(48)  # API key ngẫu nhiên của kênh BFF in-process (không phải secret Owner)

    # ---------- 0. Môi trường ----------
    if fuji:
        be, root_env = load_env(a.backend_env), load_env(a.root_env)
        rpc = a.rpc or be.get("RPC_URL") or "https://api.avax-test.network/ext/bc/C/rpc"
        dep = json.loads((ROOT / "contracts" / "deployments" / "43113.json").read_text())
        escrow_addr, token_addr = dep["escrow"], dep["token"]
        agent_key = be["AGENT_PRIVATE_KEY"]
        testers = json.loads(a.testers.read_text(encoding="utf-8"))
        keys = {"seller": testers["seller"], "buyer": testers["buyer"], "agent": agent_key}
        pinata_jwt = root_env.get("PINATA_JWT") or be.get("PINATA_JWT")
        gateway = root_env.get("IPFS_GATEWAY") or "https://gateway.pinata.cloud/ipfs/"
        abi_path = ROOT / "backend" / "abi" / "Escrow.json"
    else:
        rpc = a.rpc or "http://127.0.0.1:8545"
        keys = dict(ANVIL_KEYS)
        agent_key = keys["agent"]
        pinata_jwt = None
        escrow_addr = a.escrow
        dep = json.loads((ROOT / "contracts" / "deployments" / "31337.json").read_text())
        escrow_addr = escrow_addr or dep["escrow"]
        token_addr = dep["token"]
        abi_path = ROOT / "contracts" / "out" / "Escrow.sol" / "Escrow.json"
        served = Path(tempfile.mkdtemp(prefix="e2e_gw_"))
        srv = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(SimpleHTTPRequestHandler, directory=str(served)))
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        gateway = f"http://127.0.0.1:{srv.server_address[1]}/"

    w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 60}))
    cid = w3.eth.chain_id
    abi = json.loads(abi_path.read_text())["abi"] if "abi" in json.loads(abi_path.read_text()) else json.loads(abi_path.read_text())
    escrow = w3.eth.contract(address=Web3.to_checksum_address(escrow_addr), abi=abi)
    erc20_abi = [{"name": "balanceOf", "type": "function", "stateMutability": "view", "inputs": [{"name": "a", "type": "address"}], "outputs": [{"type": "uint256"}]}]
    token = w3.eth.contract(address=Web3.to_checksum_address(token_addr), abi=erc20_abi)
    acct = {k: Account.from_key(v) for k, v in keys.items()}
    S, B, A = acct["seller"].address, acct["buyer"].address, acct["agent"].address
    onchain_agent, onchain_owner = escrow.functions.agent().call(), escrow.functions.owner().call()
    R.data.update({"chain_id": cid, "rpc_host": rpc.split("/")[2], "escrow": escrow.address, "token": token.address,
                   "seller": S, "buyer": B, "agent": A, "onchain_agent": onchain_agent, "owner": onchain_owner,
                   "windows": {"evidence": escrow.functions.EVIDENCE_WINDOW().call(),
                               "attest": escrow.functions.ATTEST_WINDOW().call(),
                               "dispute": escrow.functions.DISPUTE_WINDOW().call()}})
    expected_cid = 43113 if fuji else 31337
    roles_ok = (cid == expected_cid and A == onchain_agent and len({S, B, A, onchain_owner}) == 4)
    R.step("E0", "Chain/contract/roles", "PASS" if roles_ok else "FAIL",
           f"chain={cid} escrow={escrow.address} agent_match={A == onchain_agent} seller≠buyer≠agent≠owner={len({S, B, A, onchain_owner}) == 4}")
    if not roles_ok:
        return 1
    bal0 = {k: w3.eth.get_balance(v.address) for k, v in acct.items()}
    R.data["balances_before_wei"] = {k: str(v) for k, v in bal0.items()}
    item_value = a.item_value_wei
    need = item_value * 3000 // 10000 + Web3.to_wei("0.01", "ether")
    funds_ok = bal0["seller"] >= need and bal0["buyer"] >= need and bal0["agent"] >= Web3.to_wei("0.02", "ether")
    R.step("E0b", "Test AVAX balances", "PASS" if funds_ok else "BLOCKED",
           " ".join(f"{k}={Web3.from_wei(v, 'ether')}" for k, v in bal0.items()))
    if not funds_ok:
        return 2

    settings = svc.Settings(
        rpc_url=rpc, agent_private_key=agent_key, escrow_address=escrow.address, escrow_abi_path=abi_path,
        data_dir=data_dir, ipfs_gateway=gateway, allow_local_hosts=not fuji, attest_api_key=api_key,
        enforce_evidence_hash=True, require_proxy_signature=fuji, verify_chain_before_ttl_release=True,
        inspect_listing_images=True, reservation_ttl_seconds=1800, pinata_jwt=pinata_jwt, chain_id=cid,
        agent_auto=False,
    )
    app = svc.create_app(settings)
    c = TestClient(app)
    health = c.get("/health").json()
    R.data["health"] = {k: health.get(k) for k in ("ok", "chain_id", "agent", "agent_matches_contract", "tesseract", "pinata_relay_configured")}
    R.data["health"]["insecure_for_chain"] = (health.get("security_toggles") or {}).get("insecure_for_chain")
    h_ok = health.get("ok") and health.get("chain_id") == cid and health.get("agent_matches_contract") and not R.data["health"]["insecure_for_chain"]
    R.step("E0c", "Backend /health (in-process, Final Freeze toggles)", "PASS" if h_ok else "FAIL", json.dumps(R.data["health"]))
    if not h_ok:
        return 1

    def hdr(wallet: str, method: str, path: str) -> dict:
        h = {"X-API-Key": api_key, "X-Authenticated-Wallet": wallet, "X-Authenticated-Chain-Id": str(cid)}
        ts, nonce = int(time.time()), secrets.token_hex(12)
        h.update({"X-Auth-Timestamp": str(ts), "X-Auth-Nonce": nonce,
                  "X-Auth-Signature": compute_proxy_signature(api_key, method, path, wallet, cid, ts, nonce)})
        return h

    def call(method: str, path: str, who: str, **kw):
        wallet = acct[who].address
        r = c.request(method, path, headers=hdr(wallet, method, path), **kw)
        return r

    def tx(who: str, fn, label: str, value: int = 0):
        a_ = acct[who]
        t = fn.build_transaction({"from": a_.address, "value": value, "chainId": cid,
                                  "nonce": w3.eth.get_transaction_count(a_.address, "pending")})
        h = w3.eth.send_raw_transaction(a_.sign_transaction(t).raw_transaction)
        r = w3.eth.wait_for_transaction_receipt(h, timeout=180)
        fee = r["gasUsed"] * r.get("effectiveGasPrice", t.get("gasPrice", 0) or 0)
        rec = {"label": label, "from_role": who, "hash": Web3.to_hex(h), "block": r["blockNumber"], "status": r["status"],
               "gas_used": r["gasUsed"], "fee_wei": str(fee), "value_wei": str(value)}
        if fuji:
            rec["snowtrace"] = SNOWTRACE + Web3.to_hex(h)
        R.txs.append(rec)
        if r["status"] != 1:
            raise RuntimeError(f"{label} reverted: {Web3.to_hex(h)}")
        return r

    def publish(name: str, img) -> tuple[str, str]:
        tmp = Path(tempfile.mkdtemp()) / f"{name}.jpg"
        synth.write_image(img, str(tmp))
        raw = tmp.read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        if fuji:
            r = call("POST", "/pin", "seller" if not name.startswith("buyer") else "buyer",
                     files={"file": (tmp.name, raw, "image/jpeg")})
            if r.status_code != 200:
                raise RuntimeError(f"/pin {name} -> {r.status_code} {r.text[:200]}")
            body = r.json()
            uri = body.get("uri") or f"ipfs://{body.get('cid') or body.get('IpfsHash')}"
        else:
            (served / tmp.name).write_bytes(raw)
            uri = f"ipfs://{tmp.name}"
        return uri, sha

    def photo(item, seed, short, nonce_hex, **kw):
        for k in range(8):
            img = synth.photograph(item, seed + 1000 * k, short, **kw)
            with tempfile.TemporaryDirectory() as d:
                probe = synth.write_image(img, os.path.join(d, "probe.jpg"))
                if ec.check_nonce(ec.load_bgr(probe), nonce_hex).found:
                    return img
        raise RuntimeError("nonce not readable on generated evidence after 8 tries")

    # ---------- 1. Listing với ảnh IPFS ----------
    seed = secrets.randbelow(10_000_000)
    item = synth.make_item(seed)
    listing_uri, listing_sha = publish(f"listing_{seed}", item)
    R.data["listing_image"] = {"uri": listing_uri, "sha256": listing_sha, "synthetic_seed": seed}
    r = call("POST", "/listings", "seller", json={
        "sku": f"E2E-CLEAN-{seed}", "category": "MODEL_KIT", "title": f"Auto E2E ResolvedClean #{seed}",
        "description": "Auto E2E happy path (synthetic demo item).", "price_wei": str(item_value),
        "condition": "LIKE_NEW", "quantity_total": 1, "images": [{"uri": listing_uri, "is_primary": True}]})
    ok = r.status_code == 201
    lid = r.json().get("id") if ok else None
    R.data["listing_id"] = lid
    R.step("E1", "Seller tạo listing (ảnh IPFS)", "PASS" if ok else "FAIL", f"listing={lid} image={listing_uri}" if ok else r.text[:300])
    if not ok:
        return 1

    # ---------- 2. Purchase request ----------
    r = call("POST", f"/listings/{lid}/requests", "buyer", json={"quantity": 1, "buyer_note": "auto e2e"})
    ok = r.status_code == 201
    req_id = r.json().get("id") if ok else None
    R.data["request_id"] = req_id
    R.step("E2", "Buyer gửi yêu cầu mua", "PASS" if ok else "FAIL", f"request={req_id}" if ok else r.text[:300])
    if not ok:
        return 1

    # ---------- 3. Accept + createTrade + bind ----------
    r = call("POST", f"/requests/{req_id}/decision", "seller", json={"action": "accept"})
    if r.status_code != 200 or r.json().get("status") != "ACCEPTED":
        R.step("E3", "Seller accept", "FAIL", r.text[:300])
        return 1
    rc = tx("seller", escrow.functions.createTrade(B, item_value), "createTrade")
    tid = escrow.functions.nextTradeId().call() - 1
    ev = escrow.events.TradeCreated().process_receipt(rc)
    tid = ev[0]["args"]["tradeId"] if ev else tid
    r = call("POST", f"/requests/{req_id}/bind-trade", "seller", json={"tx_hash": Web3.to_hex(rc["transactionHash"]), "trade_id": tid})
    ok = r.status_code == 200 and r.json().get("status") == "ESCROW_CREATED"
    R.data["trade_id"] = tid
    R.step("E3", "Seller accept + createTrade + bind-trade", "PASS" if ok else "FAIL", f"trade_id={tid}" + ("" if ok else " " + r.text[:300]))
    if not ok:
        return 1

    # ---------- 4. Deposit 30% x2 ----------
    t = escrow.functions.getTrade(tid).call()
    dep_req = t[3]
    tx("seller", escrow.functions.deposit(tid), "deposit (seller)", dep_req)
    tx("buyer", escrow.functions.deposit(tid), "deposit (buyer)", dep_req)
    t = escrow.functions.getTrade(tid).call()
    cdu = (token.functions.balanceOf(S).call(), token.functions.balanceOf(B).call())
    ok = t[15] == 1 and t[4] == dep_req and t[5] == dep_req and dep_req == item_value * 3000 // 10000
    R.data["deposit_required_wei"] = str(dep_req)
    R.step("E4", "Deposit 30% ×2", "PASS" if ok else "FAIL",
           f"each={Web3.from_wei(dep_req, 'ether')} AVAX state={STATES[t[15]]} CDU seller/buyer={cdu}")
    if not ok:
        return 1

    # ---------- 5. Evidence + IPFS ----------
    nonce_hex = Web3.to_hex(t[6])
    short = ec.short_nonce(nonce_hex)
    seller_uri, s_sha = publish(f"seller_{tid}_{seed}", photo(item, seed + 1, short, nonce_hex))
    buyer_uri, b_sha = publish(f"buyer_{tid}_{seed}", photo(item, seed + 50, short, nonce_hex, brightness=0.9))
    R.data["evidence"] = {"nonce_short": short, "seller_uri": seller_uri, "seller_sha256": s_sha, "buyer_uri": buyer_uri, "buyer_sha256": b_sha}
    R.step("E5", "Evidence (synthetic, nonce in frame) uploaded IPFS", "PASS", f"seller={seller_uri} buyer={buyer_uri}")

    # ---------- 6. submitEvidence + register URIs ----------
    sh, bh = evidence_hash_of(seller_uri), evidence_hash_of(buyer_uri)
    tx("seller", escrow.functions.submitEvidence(tid, sh), "submitEvidence (seller)")
    tx("buyer", escrow.functions.submitEvidence(tid, bh), "submitEvidence (buyer)")
    sig = Account.sign_message(encode_defunct(text=listing_message(cid, escrow.address, tid, listing_uri)),
                               private_key=keys["seller"]).signature.hex()
    regs = [call("POST", f"/trade/{tid}/uris", "seller", json={"role": "seller", "uri": seller_uri}),
            call("POST", f"/trade/{tid}/uris", "buyer", json={"role": "buyer", "uri": buyer_uri}),
            call("POST", f"/trade/{tid}/uris", "seller", json={"role": "listing", "uri": listing_uri, "signature": sig})]
    ok = all(x.status_code == 200 for x in regs)
    R.step("E6", "submitEvidence(keccak256(utf8(uri))) ×2 + đăng ký URI (listing có chữ ký seller)", "PASS" if ok else "FAIL",
           "" if ok else " | ".join(f"{x.status_code}:{x.text[:150]}" for x in regs))
    if not ok:
        return 1

    # ---------- 7. Đối chiếu hash ----------
    t = escrow.functions.getTrade(tid).call()
    on_s, on_b = Web3.to_hex(t[7]).lower(), Web3.to_hex(t[8]).lower()
    ok = on_s == sh and on_b == bh
    R.data["evidence"].update({"seller_hash_local": sh, "seller_hash_onchain": on_s, "buyer_hash_local": bh, "buyer_hash_onchain": on_b})
    R.step("E7", "Evidence hash on-chain == keccak256(utf8(uri))", "PASS" if ok else "FAIL", f"seller={on_s} buyer={on_b}")
    if not ok:
        return 1

    # ---------- 8. Agent attest ----------
    app.state.agent.tick()
    t = escrow.functions.getTrade(tid).call()
    rep = c.get(f"/report/{tid}").json()
    report_hash_ok = Web3.to_hex(t[9]).lower() == str(rep.get("report_hash", "")).lower()
    attest_tx = rep.get("tx_hash")
    if attest_tx:
        rr = w3.eth.get_transaction_receipt(attest_tx)
        txo = w3.eth.get_transaction(attest_tx)
        R.txs.append({"label": "attest (Agent)", "from_role": "agent", "hash": attest_tx, "block": rr["blockNumber"],
                      "status": rr["status"], "gas_used": rr["gasUsed"],
                      "fee_wei": str(rr["gasUsed"] * rr.get("effectiveGasPrice", 0)), "value_wei": "0",
                      "from": txo["from"], **({"snowtrace": SNOWTRACE + attest_tx} if fuji else {})})
    R.data["attest"] = {"state": STATES[t[15]], "flagged": t[11], "risk_score": t[10], "report_hash_onchain": Web3.to_hex(t[9]),
                        "report_hash_backend": rep.get("report_hash"), "notes": (rep.get("report") or {}).get("notes")}
    ok = t[15] == 2 and t[11] is False and report_hash_ok and attest_tx and R.txs[-1].get("from") == A
    R.step("E8", "Agent attest flagged=false (from = Agent)", "PASS" if ok else "FAIL",
           f"state={STATES[t[15]]} flagged={t[11]} risk={t[10]} reportHash_match={report_hash_ok}")
    if not ok:
        return 1

    # ---------- 9. Dispute window ----------
    dispute_deadline = t[14]
    if fuji:
        while w3.eth.get_block("latest")["timestamp"] <= dispute_deadline:
            time.sleep(10)
    else:
        w3.provider.make_request("evm_increaseTime", [R.data["windows"]["dispute"] + 1])
        w3.provider.make_request("evm_mine", [])
    disputed = escrow.events.Disputed().get_logs(from_block=R.txs[0]["block"], argument_filters={"tradeId": tid})
    ok = len(disputed) == 0 and escrow.functions.getTrade(tid).call()[15] == 2
    R.step("E9", "Hết dispute window, không có khiếu nại", "PASS" if ok else "FAIL",
           f"deadline={dispute_deadline} {'(Anvil: evm_increaseTime)' if not fuji else '(Fuji: chờ thời gian thật)'} disputes={len(disputed)}")
    if not ok:
        return 1

    # ---------- 10. resolveClean ----------
    pre = {"seller": w3.eth.get_balance(S), "buyer": w3.eth.get_balance(B)}
    rc = tx("seller", escrow.functions.resolveClean(tid), "resolveClean (seller)")
    post = {"seller": w3.eth.get_balance(S), "buyer": w3.eth.get_balance(B)}
    rc_fee = int(R.txs[-1]["fee_wei"])
    ev = escrow.events.ResolvedClean().process_receipt(rc)
    deferred = escrow.events.PayoutDeferred().process_receipt(rc)
    R.step("E10", "resolveClean", "PASS" if ev and ev[0]["args"]["tradeId"] == tid else "FAIL",
           f"event ResolvedClean(tradeId={ev[0]['args']['tradeId'] if ev else None}) PayoutDeferred={len(deferred)}")

    # ---------- 11. Xác minh hoàn cọc ----------
    t = escrow.functions.getTrade(tid).call()
    seller_refund = post["seller"] - pre["seller"] + rc_fee
    buyer_refund = post["buyer"] - pre["buyer"]
    cdu = (token.functions.balanceOf(S).call(), token.functions.balanceOf(B).call())
    rep_after = (escrow.functions.reputationOf(S).call(), escrow.functions.reputationOf(B).call())
    escrow_bal = w3.eth.get_balance(escrow.address)
    try:
        pend = (escrow.functions.pendingWithdrawals(S).call(), escrow.functions.pendingWithdrawals(B).call())
    except Exception:  # noqa: BLE001
        pend = None
    R.data["resolution"] = {"final_state": STATES[t[15]], "seller_refund_wei": str(seller_refund), "buyer_refund_wei": str(buyer_refund),
                            "deposit_each_wei": str(dep_req), "cdu_after": [str(x) for x in cdu], "reputation_after": list(rep_after),
                            "pending_withdrawals": [str(x) for x in pend] if pend else None, "escrow_balance_wei_after": str(escrow_bal),
                            "payout_deferred_events": len(deferred)}
    ok = (t[15] == 4 and seller_refund == dep_req and buyer_refund == dep_req and cdu == (0, 0) and len(deferred) == 0)
    R.step("E11", "Cọc hoàn đúng cho Seller & Buyer, CDU burn, state Resolved", "PASS" if ok else "FAIL",
           f"refund seller={Web3.from_wei(seller_refund, 'ether')} buyer={Web3.from_wei(buyer_refund, 'ether')} "
           f"(expected {Web3.from_wei(dep_req, 'ether')} each) CDU={cdu} reputation={rep_after}")

    # ---------- 12. Marketplace reconcile (read-only) ----------
    app.state.agent.tick()
    lst = c.get(f"/listings/{lid}").json()
    R.step("E12", "Listing reconcile → SOLD", "PASS" if lst.get("status") == "SOLD" else "FAIL", f"listing.status={lst.get('status')}")

    bal1 = {k: w3.eth.get_balance(v.address) for k, v in acct.items()}
    R.data["balances_after_wei"] = {k: str(v) for k, v in bal1.items()}
    R.data["gas_fee_total_wei_by_role"] = {r_: str(sum(int(x["fee_wei"]) for x in R.txs if x["from_role"] == r_)) for r_ in ("seller", "buyer", "agent")}
    passed = all(s["status"] == "PASS" for s in R.steps)
    R.data["verdict"] = ("E2E PASS" if passed else "E2E FAIL") + (" (Fuji)" if fuji else " (Anvil — harness rehearsal, không phải bằng chứng Fuji)")
    print(R.data["verdict"])
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
