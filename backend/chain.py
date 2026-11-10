"""
chain.py
--------
Lớp mỏng bọc web3.py cho contract Escrow: đọc trạng thái giao dịch, reputation,
và ký + gửi attest() bằng ví agent. Tách riêng khỏi FastAPI để test được độc lập.
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass
from enum import IntEnum
from pathlib import Path
from typing import Optional

from web3 import Web3
from web3.exceptions import ContractLogicError

log = logging.getLogger("attest.chain")


class TradeState(IntEnum):
    Created = 0
    AwaitingEvidence = 1
    Attested = 2
    Disputed = 3
    Resolved = 4
    Cancelled = 5


@dataclass
class Trade:
    trade_id: int
    seller: str
    buyer: str
    item_value: int
    deposit_required: int
    seller_deposit: int
    buyer_deposit: int
    nonce: str                 # 0x + 64 hex
    seller_evidence_hash: str
    buyer_evidence_hash: str
    report_hash: str
    risk_score: int
    flagged: bool
    created_at: int
    evidence_deadline: int
    dispute_deadline: int
    state: TradeState

    @property
    def exists(self) -> bool:
        return int(self.seller, 16) != 0

    def to_json(self) -> dict:
        d = self.__dict__.copy()
        d["state"] = self.state.name
        for k in ("item_value", "deposit_required", "seller_deposit", "buyer_deposit"):
            d[k] = str(d[k])  # wei vượt quá giới hạn số nguyên an toàn của JS
        return d


class ChainError(Exception):
    """Lỗi khi gọi RPC / transaction revert — map thành HTTP 502."""


def _hex32(b: bytes) -> str:
    return Web3.to_hex(b).lower() if b else "0x" + "00" * 32


def load_abi(path: str | Path) -> list:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return data["abi"] if isinstance(data, dict) else data


class EscrowClient:
    def __init__(self, rpc_url: str, escrow_address: str, abi: list, agent_private_key: str,
                 tx_timeout: int = 120):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 30}))
        self.escrow = self.w3.eth.contract(address=Web3.to_checksum_address(escrow_address), abi=abi)
        self.account = self.w3.eth.account.from_key(agent_private_key)
        self.tx_timeout = tx_timeout
        # Nonce giao dịch của ví agent: tuần tự hoá để 2 request song song không đụng nonce.
        self._tx_lock = threading.Lock()

    @property
    def agent_address(self) -> str:
        return self.account.address

    def chain_id(self) -> int:
        return int(self.w3.eth.chain_id)

    def agent_balance(self) -> int:
        return int(self.w3.eth.get_balance(self.account.address))

    def onchain_agent(self) -> str:
        return self.escrow.functions.agent().call()

    def get_trade(self, trade_id: int) -> Trade:
        try:
            t = self.escrow.functions.getTrade(trade_id).call()
        except Exception as e:  # RPC lỗi / sai ABI
            raise ChainError(f"getTrade({trade_id}) failed: {e}") from e
        return Trade(
            trade_id=trade_id,
            seller=t[0], buyer=t[1], item_value=t[2], deposit_required=t[3],
            seller_deposit=t[4], buyer_deposit=t[5],
            nonce=_hex32(t[6]), seller_evidence_hash=_hex32(t[7]), buyer_evidence_hash=_hex32(t[8]),
            report_hash=_hex32(t[9]), risk_score=t[10], flagged=t[11],
            created_at=t[12], evidence_deadline=t[13], dispute_deadline=t[14],
            state=TradeState(t[15]),
        )

    def reputation_of(self, who: str) -> int:
        return int(self.escrow.functions.reputationOf(Web3.to_checksum_address(who)).call())

    def next_trade_id(self) -> int:
        try:
            return int(self.escrow.functions.nextTradeId().call())
        except Exception as e:
            raise ChainError(f"nextTradeId() failed: {e}") from e

    def latest_timestamp(self) -> int:
        return int(self.w3.eth.get_block("latest")["timestamp"])

    def send_attest(self, trade_id: int, risk_score: int, flagged: bool, report_hash: bytes) -> str:
        fn = self.escrow.functions.attest(trade_id, risk_score, flagged, report_hash)
        with self._tx_lock:
            # Mô phỏng trước để lấy lý do revert rõ ràng thay vì mất gas.
            try:
                fn.call({"from": self.account.address})
            except ContractLogicError as e:
                raise ChainError(f"attest() would revert: {e}") from e
            try:
                tx = fn.build_transaction({
                    "from": self.account.address,
                    "nonce": self.w3.eth.get_transaction_count(self.account.address, "pending"),
                    "chainId": self.chain_id(),
                })
                signed = self.account.sign_transaction(tx)
                tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
                log.info("attest(trade=%s, risk=%s, flagged=%s) sent: %s",
                         trade_id, risk_score, flagged, Web3.to_hex(tx_hash))
                receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=self.tx_timeout)
            except ChainError:
                raise
            except Exception as e:
                raise ChainError(f"attest() tx failed: {e}") from e
        if receipt["status"] != 1:
            raise ChainError(f"attest() reverted on-chain, tx {Web3.to_hex(tx_hash)}")
        return Web3.to_hex(tx_hash)


def evidence_hash_of(uri: str) -> str:
    """Quy ước neo bằng chứng: evidenceHash = keccak256(utf8(evidenceUri)).
    Frontend dùng đúng công thức này khi gọi submitEvidence()."""
    return Web3.to_hex(Web3.keccak(text=uri)).lower()


def find_escrow_address(deployments_dir: Path, chain_id: int) -> Optional[str]:
    f = deployments_dir / f"{chain_id}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8")).get("escrow")
    return None
