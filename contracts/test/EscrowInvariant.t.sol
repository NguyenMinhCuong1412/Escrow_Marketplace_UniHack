// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CollectibleToken.sol";
import "../src/Escrow.sol";

/// @dev Handler sinh chuỗi thao tác ngẫu nhiên (tạo, nạp, nộp bằng chứng, attest,
///      khiếu nại, xử lý, huỷ, tua thời gian) trên nhiều giao dịch cùng lúc.
contract EscrowHandler is Test {
    Escrow public escrow;
    CollectibleToken public token;
    address public agent;
    address public arbiter;
    address[] public actors;
    uint256[] public tradeIds;

    constructor(Escrow _escrow, CollectibleToken _token, address _agent, address _arbiter) {
        escrow = _escrow;
        token = _token;
        agent = _agent;
        arbiter = _arbiter;
        for (uint256 i = 0; i < 4; i++) {
            address a = makeAddr(string(abi.encodePacked("actor", vm.toString(i))));
            vm.deal(a, 1_000_000 ether);
            actors.push(a);
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _trade(uint256 seed) internal view returns (uint256) {
        return tradeIds[seed % tradeIds.length];
    }

    function create(uint256 s, uint256 b, uint256 value) external {
        address seller = actors[s % actors.length];
        address buyer = actors[((s % actors.length) + 1 + (b % (actors.length - 1))) % actors.length];
        value = bound(value, 4, 1000 ether);
        vm.prank(seller);
        tradeIds.push(escrow.createTrade(buyer, value));
    }

    function deposit(uint256 seed, bool asSeller) external {
        if (tradeIds.length == 0) return;
        uint256 id = _trade(seed);
        Escrow.Trade memory t = escrow.getTrade(id);
        if (t.state != Escrow.State.Created) return;
        address who = asSeller ? t.seller : t.buyer;
        if ((asSeller ? t.sellerDeposit : t.buyerDeposit) != 0) return;
        vm.prank(who);
        escrow.deposit{value: t.depositRequired}(id);
    }

    function cancelUnfunded(uint256 seed) external {
        if (tradeIds.length == 0) return;
        uint256 id = _trade(seed);
        Escrow.Trade memory t = escrow.getTrade(id);
        if (t.state != Escrow.State.Created) return;
        vm.prank(t.seller);
        escrow.cancelUnfunded(id);
    }

    function evidence(uint256 seed, bool asSeller) external {
        if (tradeIds.length == 0) return;
        uint256 id = _trade(seed);
        Escrow.Trade memory t = escrow.getTrade(id);
        if (t.state != Escrow.State.AwaitingEvidence || block.timestamp > t.evidenceDeadline) return;
        if ((asSeller ? t.sellerEvidenceHash : t.buyerEvidenceHash) != bytes32(0)) return;
        vm.prank(asSeller ? t.seller : t.buyer);
        escrow.submitEvidence(id, keccak256(abi.encode(id, asSeller)));
    }

    function attest(uint256 seed, uint8 risk, bool flagged) external {
        if (tradeIds.length == 0) return;
        uint256 id = _trade(seed);
        Escrow.Trade memory t = escrow.getTrade(id);
        if (t.state != Escrow.State.AwaitingEvidence) return;
        if (t.sellerEvidenceHash == bytes32(0) || t.buyerEvidenceHash == bytes32(0)) return;
        if (block.timestamp > uint256(t.evidenceDeadline) + escrow.ATTEST_WINDOW()) return;
        vm.prank(agent);
        escrow.attest(id, uint8(bound(risk, 0, 100)), flagged, keccak256(abi.encode("report", id)));
    }

    function complain(uint256 seed) external {
        if (tradeIds.length == 0) return;
        uint256 id = _trade(seed);
        Escrow.Trade memory t = escrow.getTrade(id);
        if (t.state != Escrow.State.Attested) return;
        if (!t.flagged && block.timestamp > t.disputeDeadline) return;
        vm.prank(t.buyer);
        escrow.fileComplaint(id);
    }

    function resolveDispute(uint256 seed, uint8 who) external {
        if (tradeIds.length == 0) return;
        uint256 id = _trade(seed);
        Escrow.Trade memory t = escrow.getTrade(id);
        if (t.state != Escrow.State.Disputed) return;
        address violator = who % 3 == 0 ? t.seller : (who % 3 == 1 ? t.buyer : address(0));
        vm.prank(arbiter);
        escrow.resolveDispute(id, violator);
    }

    function resolveClean(uint256 seed) external {
        if (tradeIds.length == 0) return;
        uint256 id = _trade(seed);
        Escrow.Trade memory t = escrow.getTrade(id);
        if (t.state != Escrow.State.Attested || t.flagged || block.timestamp <= t.disputeDeadline) return;
        escrow.resolveClean(id);
    }

    function cancelTimeout(uint256 seed) external {
        if (tradeIds.length == 0) return;
        uint256 id = _trade(seed);
        Escrow.Trade memory t = escrow.getTrade(id);
        if (t.state != Escrow.State.AwaitingEvidence || block.timestamp <= t.evidenceDeadline) return;
        bool missing = t.sellerEvidenceHash == bytes32(0) || t.buyerEvidenceHash == bytes32(0);
        if (!missing && block.timestamp <= uint256(t.evidenceDeadline) + escrow.ATTEST_WINDOW()) return;
        escrow.cancelOnEvidenceTimeout(id);
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 2 days));
    }
}

contract EscrowInvariantTest is Test {
    Escrow escrow;
    CollectibleToken token;
    EscrowHandler handler;

    function setUp() public {
        token = new CollectibleToken();
        address agent = makeAddr("agent");
        escrow = new Escrow(address(token), agent, 3 days, 1 days, 2 days);
        token.setEscrow(address(escrow));
        handler = new EscrowHandler(escrow, token, agent, address(this));
        targetContract(address(handler));
    }

    /// AVAX nằm trong escrow luôn đúng bằng tổng CDU đang lưu hành (cọc chưa trả)
    /// cộng các khoản bị hoãn chờ rút. Không có tiền "biến mất" hay bị rút thừa.
    function invariant_BalanceMatchesOutstanding() public view {
        uint256 pending;
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            pending += escrow.pendingWithdrawals(handler.actors(i));
        }
        assertEq(address(escrow).balance, token.totalSupply() + pending);
    }

    /// Reputation không bao giờ vượt trần.
    function invariant_ReputationBounded() public view {
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            assertLe(escrow.reputationOf(handler.actors(i)), escrow.MAX_REPUTATION());
        }
    }
}
