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
from web3.exceptions import ContractLogicError, TransactionNotFound
from web3.logs import DISCARD

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


class ChainTxNotFound(ChainError):
    """Không tìm thấy transaction receipt trên RPC — map thành HTTP 404."""


class ChainValidationError(Exception):
    """Receipt/event không khớp hợp đồng Escrow — map thành HTTP 422."""

    def __init__(self, error_code: str, message: str):
        self.error_code = error_code
        super().__init__(message)


@dataclass
class CreatedTradeReceipt:
    chain_id: int
    escrow_address: str
    tx_hash: str
    tx_to: str
    status: int
    trade_id: int
    seller: str
    buyer: str
    item_value: int
    nonce: str
    block_number: int
    trade: Trade


def _hex32(b: bytes) -> str:
    return Web3.to_hex(b).lower() if b else "0x" + "00" * 32


def load_abi(path: str | Path) -> list:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return data["abi"] if isinstance(data, dict) else data


class EscrowClient:
    def __init__(self, rpc_url: str, escrow_address: str, abi: list, agent_private_key: Optional[str] = None,
                 tx_timeout: int = 120):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 30}))
        self.escrow = self.w3.eth.contract(address=Web3.to_checksum_address(escrow_address), abi=abi)
        self.account = self.w3.eth.account.from_key(agent_private_key) if agent_private_key else None
        self.tx_timeout = tx_timeout
        # Nonce giao dịch của ví agent: tuần tự hoá để 2 request song song không đụng nonce.
        self._tx_lock = threading.Lock()

    @property
    def agent_address(self) -> str:
        return self.account.address if self.account else ""

    def chain_id(self) -> int:
        return int(self.w3.eth.chain_id)

    def agent_balance(self) -> int:
        if not self.account:
            raise ChainError("AGENT_PRIVATE_KEY is required for agent_balance()")
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

    def verify_create_trade_tx(self, tx_hash: str, expected_trade_id: Optional[int] = None) -> CreatedTradeReceipt:
        """Đọc receipt + TradeCreated + getTrade() để xác thực giao dịch createTrade on-chain."""
        try:
            receipt = self.w3.eth.get_transaction_receipt(tx_hash)
        except TransactionNotFound as e:
            raise ChainTxNotFound(f"Transaction receipt not found: {tx_hash}") from e
        except Exception as e:
            raise ChainError(f"get_transaction_receipt failed: {e}") from e

        if not receipt:
            raise ChainTxNotFound(f"Transaction receipt not found: {tx_hash}")

        if int(receipt.get("status", 0)) != 1:
            raise ChainValidationError("TRANSACTION_REVERTED", "Giao dịch createTrade đã bị revert trên blockchain.")

        expected_escrow = self.escrow.address.lower()
        tx_to = (receipt.get("to") or "").lower()
        if not tx_to or tx_to != expected_escrow:
            raise ChainValidationError(
                "WRONG_CONTRACT_ADDRESS",
                "Giao dịch không gửi tới hợp đồng Escrow đang hoạt động.",
            )

        decoded = self.escrow.events.TradeCreated().process_receipt(receipt, errors=DISCARD)
        matching = [
            ev for ev in decoded
            if str(ev.get("address", "")).lower() == expected_escrow
        ]
        if len(matching) != 1:
            raise ChainValidationError(
                "MISSING_TRADE_CREATED_EVENT",
                "Receipt không chứa đúng một sự kiện TradeCreated từ hợp đồng Escrow.",
            )

        args = matching[0]["args"]
        ev_trade_id = int(args["tradeId"])
        ev_seller = str(args["seller"]).lower()
        ev_buyer = str(args["buyer"]).lower()
        ev_item_value = int(args["itemValue"])
        ev_nonce = _hex32(args["nonce"])

        if expected_trade_id is not None and ev_trade_id != expected_trade_id:
            raise ChainValidationError(
                "TRADE_ID_MISMATCH",
                "trade_id trong yêu cầu không khớp với sự kiện TradeCreated trên chain.",
            )

        trade = self.get_trade(ev_trade_id)
        if not trade.exists:
            raise ChainValidationError("TRADE_NOT_FOUND_ONCHAIN", "Không tìm thấy Trade tương ứng trên hợp đồng.")
        if (
            trade.seller.lower() != ev_seller
            or trade.buyer.lower() != ev_buyer
            or trade.item_value != ev_item_value
        ):
            raise ChainValidationError("TRADE_EVENT_STATE_MISMATCH", "Dữ liệu getTrade() không khớp sự kiện TradeCreated.")

        return CreatedTradeReceipt(
            chain_id=self.chain_id(),
            escrow_address=expected_escrow,
            tx_hash=Web3.to_hex(receipt.get("transactionHash") or tx_hash).lower(),
            tx_to=tx_to,
            status=int(receipt["status"]),
            trade_id=ev_trade_id,
            seller=ev_seller,
            buyer=ev_buyer,
            item_value=ev_item_value,
            nonce=ev_nonce,
            block_number=int(receipt.get("blockNumber") or 0),
            trade=trade,
        )

    def send_attest(self, trade_id: int, risk_score: int, flagged: bool, report_hash: bytes) -> str:
        if not self.account:
            raise ChainError("AGENT_PRIVATE_KEY is required for send_attest()")
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
