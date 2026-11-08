"""
demo_local.py — chạy trọn luồng trên anvil local với backend ĐANG CHẠY qua HTTP.

Chuẩn bị (3 terminal):
  1) anvil
  2) cd contracts && bash script/e2e_anvil.sh          # hoặc forge script Deploy (ghi deployments/31337.json)
  3) cd backend && uvicorn attest_service:app --port 8000   (.env: RPC_URL anvil, AGENT_PRIVATE_KEY = anvil #1)
Rồi:
  python backend/scripts/demo_local.py [--fraud] [--api http://127.0.0.1:8000]

--fraud: buyer quay unbox KHÔNG có giấy nonce → agent flag → dispute → phạt 5%.
Ảnh tổng hợp được phục vụ qua một HTTP server tạm (giả lập IPFS gateway).
Key dưới đây là key MẶC ĐỊNH CÔNG KHAI của anvil, không dùng cho Fuji.
"""

import argparse
import functools
import json
import sys
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import requests
from web3 import Web3

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "ai-pipeline"), str(ROOT / "ai-pipeline" / "tests")]
import synth  # noqa: E402

KEYS = {
    "deployer": "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "seller": "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    "buyer": "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rpc", default="http://127.0.0.1:8545")
    ap.add_argument("--api", default="http://127.0.0.1:8000")
    ap.add_argument("--fraud", action="store_true")
    args = ap.parse_args()

    w3 = Web3(Web3.HTTPProvider(args.rpc))
    dep = json.loads((ROOT / "contracts" / "deployments" / f"{w3.eth.chain_id}.json").read_text())
    abi = json.loads((ROOT / "backend" / "abi" / "Escrow.json").read_text())["abi"]
    escrow = w3.eth.contract(address=dep["escrow"], abi=abi)
    acct = {k: w3.eth.account.from_key(v) for k, v in KEYS.items()}

    def tx(who, fn, value=0):
        a = acct[who]
        t = fn.build_transaction({"from": a.address, "value": value,
                                  "nonce": w3.eth.get_transaction_count(a.address, "pending")})
        r = w3.eth.wait_for_transaction_receipt(w3.eth.send_raw_transaction(a.sign_transaction(t).raw_transaction))
        assert r["status"] == 1, f"{fn.fn_name} reverted"
        return r

    print("health:", requests.get(f"{args.api}/health", timeout=10).json())

    item_value = Web3.to_wei(1, "ether")
    tx("seller", escrow.functions.createTrade(acct["buyer"].address, item_value))
    tid = escrow.functions.nextTradeId().call() - 1
    t = escrow.functions.getTrade(tid).call()
    tx("seller", escrow.functions.deposit(tid), t[3])
    tx("buyer", escrow.functions.deposit(tid), t[3])
    short = Web3.to_hex(t[6])[2:10]
    print(f"trade #{tid} funded; nonce viết lên giấy: {short}")

    served = Path(tempfile.mkdtemp(prefix="demo_ipfs_"))
    srv = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(SimpleHTTPRequestHandler, directory=str(served)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"

    item = synth.make_item(tid)
    synth.write_image(item, str(served / "listing.jpg"))
    synth.write_image(synth.photograph(item, tid, short), str(served / "seller.jpg"))
    synth.write_image(synth.photograph(item, tid + 1, None if args.fraud else short, brightness=0.9), str(served / "buyer.jpg"))
    urls = {k: f"{base}/{k}.jpg" for k in ("listing", "seller", "buyer")}

    tx("seller", escrow.functions.submitEvidence(tid, Web3.keccak(text=urls["seller"])))
    tx("buyer", escrow.functions.submitEvidence(tid, Web3.keccak(text=urls["buyer"])))
    print("evidence anchored on-chain")

    r = requests.post(f"{args.api}/verify-evidence", timeout=300, json={
        "trade_id": tid, "listing_image_url": urls["listing"],
        "seller_evidence_url": urls["seller"], "buyer_evidence_url": urls["buyer"], "include_visual": False,
    })
    r.raise_for_status()
    body = r.json()
    rep = body["report"]
    print(f"agent attested: tx={body['tx_hash']} risk={rep['risk_score']} flagged={rep['flagged']} ({body['duration_ms']} ms)")
    print("notes:", rep["notes"])
    onchain = escrow.functions.getTrade(tid).call()
    assert Web3.to_hex(onchain[9]) == body["report_hash"], "reportHash mismatch"
    print("reportHash on-chain khớp keccak256(report_json) ✓")

    window = escrow.functions.DISPUTE_WINDOW().call()
    w3.provider.make_request("evm_increaseTime", [window + 1])
    w3.provider.make_request("evm_mine", [])
    if rep["flagged"]:
        tx("buyer", escrow.functions.fileComplaint(tid))
        violator = acct["buyer"].address if args.fraud else acct["seller"].address
        tx("deployer", escrow.functions.resolveDispute(tid, violator))
        print(f"dispute resolved, violator={violator}, reputation buyer={escrow.functions.reputationOf(acct['buyer'].address).call()}")
    else:
        tx("seller", escrow.functions.resolveClean(tid))
        print("resolveClean ✓ — cọc đã hoàn cho cả hai bên")
    print("final state:", ["Created", "AwaitingEvidence", "Attested", "Disputed", "Resolved", "Cancelled"][escrow.functions.getTrade(tid).call()[15]])
    srv.shutdown()


if __name__ == "__main__":
    main()
