// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CollectibleToken.sol";
import "../src/Escrow.sol";

/// @dev Ví contract từ chối nhận AVAX khi `accept = false` — dùng để kiểm tra
///      một bên không thể khoá giao dịch bằng cách revert lúc nhận tiền.
contract Party {
    Escrow public escrow;
    bool public accept = true;

    constructor(Escrow _escrow) {
        escrow = _escrow;
    }

    function setAccept(bool a) external {
        accept = a;
    }

    function create(address buyer, uint256 value) external returns (uint256) {
        return escrow.createTrade(buyer, value);
    }

    function doDeposit(uint256 id) external payable {
        escrow.deposit{value: msg.value}(id);
    }

    function evidence(uint256 id, bytes32 h) external {
        escrow.submitEvidence(id, h);
    }

    function withdraw() external {
        escrow.withdraw();
    }

    receive() external payable virtual {
        require(accept, "no thanks");
    }
}

/// @dev Ví contract cố gắng gọi lại resolveClean/withdraw khi nhận tiền.
contract Reentrant is Party {
    uint256 public targetTrade;
    bool public reentered;
    bool public reentrySucceeded;

    constructor(Escrow _escrow) Party(_escrow) {}

    function setTarget(uint256 id) external {
        targetTrade = id;
    }

    receive() external payable override {
        if (!reentered) {
            reentered = true;
            try escrow.resolveClean(targetTrade) {
                reentrySucceeded = true;
            } catch {}
            try escrow.cancelOnEvidenceTimeout(targetTrade) {
                reentrySucceeded = true;
            } catch {}
        }
    }
}

contract EscrowTestBase is Test {
    CollectibleToken token;
    Escrow escrow;

    address owner = address(this);
    address agent = makeAddr("agent");
    address seller = makeAddr("seller");
    address buyer = makeAddr("buyer");
    address stranger = makeAddr("stranger");

    uint256 constant EVIDENCE_WINDOW = 3 days;
    uint256 constant ATTEST_WINDOW = 1 days;
    uint256 constant DISPUTE_WINDOW = 2 days;

    uint256 constant ITEM_VALUE = 10 ether;
    uint256 constant DEPOSIT = 3 ether; // 30%

    bytes32 constant SELLER_EVIDENCE = keccak256("seller-packing-photo-cid");
    bytes32 constant BUYER_EVIDENCE = keccak256("buyer-unbox-video-cid");
    bytes32 constant REPORT = keccak256("evidence-report-json");

    function setUp() public virtual {
        token = new CollectibleToken();
        escrow = new Escrow(address(token), agent, EVIDENCE_WINDOW, ATTEST_WINDOW, DISPUTE_WINDOW);
        token.setEscrow(address(escrow));
        vm.deal(seller, 100 ether);
        vm.deal(buyer, 100 ether);
        vm.deal(stranger, 100 ether);
    }

    // ----- helpers -----

    function _create() internal returns (uint256 id) {
        vm.prank(seller);
        id = escrow.createTrade(buyer, ITEM_VALUE);
    }

    function _funded() internal returns (uint256 id) {
        id = _create();
        vm.prank(seller);
        escrow.deposit{value: DEPOSIT}(id);
        vm.prank(buyer);
        escrow.deposit{value: DEPOSIT}(id);
    }

    function _evidenced() internal returns (uint256 id) {
        id = _funded();
        vm.prank(seller);
        escrow.submitEvidence(id, SELLER_EVIDENCE);
        vm.prank(buyer);
        escrow.submitEvidence(id, BUYER_EVIDENCE);
    }

    function _attested(bool flagged) internal returns (uint256 id) {
        id = _evidenced();
        vm.prank(agent);
        escrow.attest(id, flagged ? 85 : 12, flagged, REPORT);
    }

    function _disputed() internal returns (uint256 id) {
        id = _attested(false);
        vm.prank(buyer);
        escrow.fileComplaint(id);
    }

    function _state(uint256 id) internal view returns (Escrow.State) {
        return escrow.getTrade(id).state;
    }
}

contract EscrowDeployTest is EscrowTestBase {
    function test_ConstructorState() public view {
        assertEq(address(escrow.token()), address(token));
        assertEq(escrow.owner(), owner);
        assertEq(escrow.agent(), agent);
        assertEq(escrow.EVIDENCE_WINDOW(), EVIDENCE_WINDOW);
        assertEq(escrow.ATTEST_WINDOW(), ATTEST_WINDOW);
        assertEq(escrow.DISPUTE_WINDOW(), DISPUTE_WINDOW);
        assertEq(escrow.nextTradeId(), 1);
        assertEq(escrow.MAX_DEPOSIT_BPS(), 3000);
        assertEq(escrow.PENALTY_BPS(), 500);
    }

    function test_Constructor_RevertZeroAddress() public {
        vm.expectRevert("zero address");
        new Escrow(address(0), agent, 1, 1, 1);
        vm.expectRevert("zero address");
        new Escrow(address(token), address(0), 1, 1, 1);
    }

    function test_Constructor_RevertBadWindows() public {
        vm.expectRevert("zero window");
        new Escrow(address(token), agent, 0, 1, 1);
        vm.expectRevert("window too long");
        new Escrow(address(token), agent, 366 days, 1, 1);
    }

    function test_SetAgent() public {
        address newAgent = makeAddr("newAgent");
        vm.expectEmit(true, false, false, false);
        emit Escrow.AgentUpdated(newAgent);
        escrow.setAgent(newAgent);
        assertEq(escrow.agent(), newAgent);
    }

    function test_SetAgent_RevertNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert("caller is not owner");
        escrow.setAgent(stranger);
    }

    function test_SetAgent_RevertZero() public {
        vm.expectRevert("zero address");
        escrow.setAgent(address(0));
    }
}

contract EscrowCreateDepositTest is EscrowTestBase {
    function test_CreateTrade() public {
        vm.expectEmit(true, true, true, false);
        emit Escrow.TradeCreated(1, seller, buyer, ITEM_VALUE, bytes32(0));
        uint256 id = _create();

        assertEq(id, 1);
        assertEq(escrow.nextTradeId(), 2);
        Escrow.Trade memory t = escrow.getTrade(id);
        assertEq(t.seller, seller);
        assertEq(t.buyer, buyer);
        assertEq(t.itemValue, ITEM_VALUE);
        assertEq(t.depositRequired, DEPOSIT);
        assertTrue(t.nonce != bytes32(0));
        assertEq(t.createdAt, block.timestamp);
        assertEq(uint8(t.state), uint8(Escrow.State.Created));
        assertEq(escrow.reputationOf(seller), 50);
        assertEq(escrow.reputationOf(buyer), 50);
        assertTrue(escrow.reputationInitialized(seller));
    }

    function test_CreateTrade_UniqueNonces() public {
        uint256 a = _create();
        uint256 b = _create();
        assertTrue(escrow.getTrade(a).nonce != escrow.getTrade(b).nonce);
    }

    function test_CreateTrade_RevertInvalidBuyer() public {
        vm.startPrank(seller);
        vm.expectRevert("invalid buyer");
        escrow.createTrade(address(0), ITEM_VALUE);
        vm.expectRevert("invalid buyer");
        escrow.createTrade(seller, ITEM_VALUE);
        vm.stopPrank();
    }

    function test_CreateTrade_RevertTooSmall() public {
        // 3 wei * 3000 / 10000 = 0 → cọc bằng 0 sẽ phá logic "đã nạp"
        vm.prank(seller);
        vm.expectRevert("itemValue too small");
        escrow.createTrade(buyer, 3);
        vm.prank(seller);
        vm.expectRevert("itemValue too small");
        escrow.createTrade(buyer, 0);
    }

    function test_ReputationOf_DefaultsTo50() public view {
        assertEq(escrow.reputationOf(stranger), 50);
        assertEq(escrow.reputation(stranger), 0);
    }

    function test_Deposit_BothParties() public {
        uint256 id = _create();

        vm.prank(seller);
        vm.expectEmit(true, true, false, true);
        emit Escrow.Deposited(id, seller, DEPOSIT);
        escrow.deposit{value: DEPOSIT}(id);
        assertEq(uint8(_state(id)), uint8(Escrow.State.Created));
        assertEq(token.balanceOf(seller), DEPOSIT);

        vm.prank(buyer);
        vm.expectEmit(true, false, false, true);
        emit Escrow.FullyFunded(id, uint64(block.timestamp + EVIDENCE_WINDOW));
        escrow.deposit{value: DEPOSIT}(id);

        Escrow.Trade memory t = escrow.getTrade(id);
        assertEq(uint8(t.state), uint8(Escrow.State.AwaitingEvidence));
        assertEq(t.sellerDeposit, DEPOSIT);
        assertEq(t.buyerDeposit, DEPOSIT);
        assertEq(t.evidenceDeadline, block.timestamp + EVIDENCE_WINDOW);
        assertEq(token.balanceOf(buyer), DEPOSIT);
        assertEq(token.totalSupply(), 2 * DEPOSIT);
        assertEq(address(escrow).balance, 2 * DEPOSIT);
    }

    function test_Deposit_BuyerFirst() public {
        uint256 id = _create();
        vm.prank(buyer);
        escrow.deposit{value: DEPOSIT}(id);
        vm.prank(seller);
        escrow.deposit{value: DEPOSIT}(id);
        assertEq(uint8(_state(id)), uint8(Escrow.State.AwaitingEvidence));
    }

    function test_Deposit_RevertWrongAmount() public {
        uint256 id = _create();
        vm.prank(seller);
        vm.expectRevert("wrong deposit amount");
        escrow.deposit{value: DEPOSIT - 1}(id);
        vm.prank(seller);
        vm.expectRevert("wrong deposit amount");
        escrow.deposit{value: DEPOSIT + 1}(id);
    }

    function test_Deposit_RevertNotParty() public {
        uint256 id = _create();
        vm.prank(stranger);
        vm.expectRevert("not a party");
        escrow.deposit{value: DEPOSIT}(id);
    }

    function test_Deposit_RevertNonexistentTrade() public {
        vm.prank(seller);
        vm.expectRevert("not a party");
        escrow.deposit{value: DEPOSIT}(999);
    }

    function test_Deposit_RevertDoubleDepositSeller() public {
        uint256 id = _create();
        vm.startPrank(seller);
        escrow.deposit{value: DEPOSIT}(id);
        vm.expectRevert("already deposited");
        escrow.deposit{value: DEPOSIT}(id);
        vm.stopPrank();
    }

    function test_Deposit_RevertDoubleDepositBuyer() public {
        uint256 id = _create();
        vm.startPrank(buyer);
        escrow.deposit{value: DEPOSIT}(id);
        vm.expectRevert("already deposited");
        escrow.deposit{value: DEPOSIT}(id);
        vm.stopPrank();
    }

    function test_Deposit_RevertAfterFunded() public {
        uint256 id = _funded();
        vm.prank(seller);
        vm.expectRevert("wrong state");
        escrow.deposit{value: DEPOSIT}(id);
    }

    function test_CancelUnfunded_RefundsSeller() public {
        uint256 id = _create();
        vm.prank(seller);
        escrow.deposit{value: DEPOSIT}(id);
        uint256 before = seller.balance;

        vm.prank(buyer);
        escrow.cancelUnfunded(id);

        assertEq(uint8(_state(id)), uint8(Escrow.State.Cancelled));
        assertEq(seller.balance, before + DEPOSIT);
        assertEq(token.balanceOf(seller), 0);
        assertEq(token.totalSupply(), 0);
        assertEq(address(escrow).balance, 0);
        // huỷ không cộng/trừ uy tín
        assertEq(escrow.reputationOf(seller), 50);
    }

    function test_CancelUnfunded_NoDeposits() public {
        uint256 id = _create();
        vm.prank(seller);
        escrow.cancelUnfunded(id);
        assertEq(uint8(_state(id)), uint8(Escrow.State.Cancelled));
    }

    function test_CancelUnfunded_RevertNotParty() public {
        uint256 id = _create();
        vm.prank(stranger);
        vm.expectRevert("not a party");
        escrow.cancelUnfunded(id);
    }

    function test_CancelUnfunded_RevertAfterFunded() public {
        uint256 id = _funded();
        vm.prank(seller);
        vm.expectRevert("wrong state");
        escrow.cancelUnfunded(id);
    }

    function testFuzz_DepositRequiredIs30Percent(uint256 value) public {
        value = bound(value, 4, 1e30);
        vm.prank(seller);
        uint256 id = escrow.createTrade(buyer, value);
        assertEq(escrow.getTrade(id).depositRequired, (value * 3000) / 10000);
        assertLe(escrow.getTrade(id).depositRequired * 10000, value * 3000);
    }
}

contract EscrowEvidenceAttestTest is EscrowTestBase {
    function test_SubmitEvidence() public {
        uint256 id = _funded();
        vm.prank(seller);
        vm.expectEmit(true, true, false, true);
        emit Escrow.EvidenceSubmitted(id, seller, SELLER_EVIDENCE);
        escrow.submitEvidence(id, SELLER_EVIDENCE);
        vm.prank(buyer);
        escrow.submitEvidence(id, BUYER_EVIDENCE);

        Escrow.Trade memory t = escrow.getTrade(id);
        assertEq(t.sellerEvidenceHash, SELLER_EVIDENCE);
        assertEq(t.buyerEvidenceHash, BUYER_EVIDENCE);
        assertEq(uint8(t.state), uint8(Escrow.State.AwaitingEvidence));
    }

    function test_SubmitEvidence_RevertBeforeFunded() public {
        uint256 id = _create();
        vm.prank(seller);
        vm.expectRevert("wrong state");
        escrow.submitEvidence(id, SELLER_EVIDENCE);
    }

    function test_SubmitEvidence_RevertNotParty() public {
        uint256 id = _funded();
        vm.prank(stranger);
        vm.expectRevert("not a party");
        escrow.submitEvidence(id, SELLER_EVIDENCE);
    }

    function test_SubmitEvidence_RevertEmpty() public {
        uint256 id = _funded();
        vm.prank(seller);
        vm.expectRevert("empty evidence");
        escrow.submitEvidence(id, bytes32(0));
    }

    function test_SubmitEvidence_RevertTwice() public {
        uint256 id = _funded();
        vm.startPrank(seller);
        escrow.submitEvidence(id, SELLER_EVIDENCE);
        vm.expectRevert("evidence already submitted");
        escrow.submitEvidence(id, keccak256("swapped"));
        vm.stopPrank();
    }

    function test_SubmitEvidence_RevertAfterDeadline() public {
        uint256 id = _funded();
        vm.warp(block.timestamp + EVIDENCE_WINDOW + 1);
        vm.prank(seller);
        vm.expectRevert("evidence window closed");
        escrow.submitEvidence(id, SELLER_EVIDENCE);
    }

    function test_SubmitEvidence_AtDeadlineOk() public {
        uint256 id = _funded();
        vm.warp(block.timestamp + EVIDENCE_WINDOW);
        vm.prank(seller);
        escrow.submitEvidence(id, SELLER_EVIDENCE);
    }

    function test_Attest() public {
        uint256 id = _evidenced();
        vm.prank(agent);
        vm.expectEmit(true, false, false, true);
        emit Escrow.Attested(id, 12, false, REPORT);
        escrow.attest(id, 12, false, REPORT);

        Escrow.Trade memory t = escrow.getTrade(id);
        assertEq(uint8(t.state), uint8(Escrow.State.Attested));
        assertEq(t.riskScore, 12);
        assertFalse(t.flagged);
        assertEq(t.reportHash, REPORT);
        assertEq(t.disputeDeadline, block.timestamp + DISPUTE_WINDOW);
    }

    function test_Attest_RevertNotAgent() public {
        uint256 id = _evidenced();
        vm.prank(seller);
        vm.expectRevert("caller is not agent");
        escrow.attest(id, 10, false, REPORT);
        vm.expectRevert("caller is not agent"); // kể cả owner
        escrow.attest(id, 10, false, REPORT);
    }

    function test_Attest_RevertEvidenceMissing() public {
        uint256 id = _funded();
        vm.prank(seller);
        escrow.submitEvidence(id, SELLER_EVIDENCE);
        vm.prank(agent);
        vm.expectRevert("evidence missing");
        escrow.attest(id, 10, false, REPORT);
    }

    function test_Attest_RevertRiskOver100() public {
        uint256 id = _evidenced();
        vm.prank(agent);
        vm.expectRevert("riskScore > 100");
        escrow.attest(id, 101, false, REPORT);
    }

    function test_Attest_RevertEmptyReport() public {
        uint256 id = _evidenced();
        vm.prank(agent);
        vm.expectRevert("empty report");
        escrow.attest(id, 10, false, bytes32(0));
    }

    function test_Attest_RevertTwice() public {
        uint256 id = _attested(false);
        vm.prank(agent);
        vm.expectRevert("wrong state");
        escrow.attest(id, 10, false, REPORT);
    }

    function test_Attest_AfterEvidenceDeadlineWithinGrace() public {
        uint256 id = _evidenced();
        vm.warp(block.timestamp + EVIDENCE_WINDOW + ATTEST_WINDOW);
        vm.prank(agent);
        escrow.attest(id, 10, false, REPORT);
        assertEq(uint8(_state(id)), uint8(Escrow.State.Attested));
    }

    function test_Attest_RevertAfterGrace() public {
        uint256 id = _evidenced();
        vm.warp(block.timestamp + EVIDENCE_WINDOW + ATTEST_WINDOW + 1);
        vm.prank(agent);
        vm.expectRevert("attest window closed");
        escrow.attest(id, 10, false, REPORT);
    }

    function test_SetAgent_RotatesPermission() public {
        uint256 id = _evidenced();
        address newAgent = makeAddr("newAgent");
        escrow.setAgent(newAgent);
        vm.prank(agent);
        vm.expectRevert("caller is not agent");
        escrow.attest(id, 10, false, REPORT);
        vm.prank(newAgent);
        escrow.attest(id, 10, false, REPORT);
    }
}

contract EscrowResolveTest is EscrowTestBase {
    // ----- happy path -----

    function test_HappyPath_ResolveClean() public {
        uint256 sellerStart = seller.balance;
        uint256 buyerStart = buyer.balance;

        uint256 id = _attested(false);
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        vm.prank(stranger); // ai cũng gọi được
        vm.expectEmit(true, false, false, false);
        emit Escrow.ResolvedClean(id);
        escrow.resolveClean(id);

        assertEq(uint8(_state(id)), uint8(Escrow.State.Resolved));
        assertEq(seller.balance, sellerStart);
        assertEq(buyer.balance, buyerStart);
        assertEq(token.totalSupply(), 0);
        assertEq(address(escrow).balance, 0);
        assertEq(escrow.reputationOf(seller), 51);
        assertEq(escrow.reputationOf(buyer), 51);
    }

    function test_ResolveClean_RevertWindowOpen() public {
        uint256 id = _attested(false);
        vm.warp(block.timestamp + DISPUTE_WINDOW);
        vm.expectRevert("dispute window still open");
        escrow.resolveClean(id);
    }

    function test_ResolveClean_RevertFlagged() public {
        uint256 id = _attested(true);
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        vm.expectRevert("trade flagged, cannot auto-resolve");
        escrow.resolveClean(id);
    }

    function test_ResolveClean_RevertWrongState() public {
        uint256 id = _evidenced();
        vm.expectRevert("wrong state");
        escrow.resolveClean(id);
    }

    function test_ResolveClean_RevertTwice() public {
        uint256 id = _attested(false);
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        escrow.resolveClean(id);
        vm.expectRevert("wrong state");
        escrow.resolveClean(id);
    }

    // ----- complaint -----

    function test_FileComplaint_ByParty() public {
        uint256 id = _attested(false);
        vm.prank(buyer);
        vm.expectEmit(true, true, false, false);
        emit Escrow.Disputed(id, buyer);
        escrow.fileComplaint(id);
        assertEq(uint8(_state(id)), uint8(Escrow.State.Disputed));
    }

    function test_FileComplaint_RevertStrangerWhenNotFlagged() public {
        uint256 id = _attested(false);
        vm.prank(stranger);
        vm.expectRevert("not a party");
        escrow.fileComplaint(id);
    }

    function test_FileComplaint_RevertAfterWindow() public {
        uint256 id = _attested(false);
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        vm.prank(seller);
        vm.expectRevert("dispute window closed");
        escrow.fileComplaint(id);
    }

    function test_FileComplaint_FlaggedAnyoneAnytime() public {
        uint256 id = _attested(true);
        vm.warp(block.timestamp + DISPUTE_WINDOW + 10 days);
        vm.prank(stranger);
        escrow.fileComplaint(id);
        assertEq(uint8(_state(id)), uint8(Escrow.State.Disputed));
    }

    function test_FileComplaint_RevertWrongState() public {
        uint256 id = _evidenced();
        vm.prank(seller);
        vm.expectRevert("wrong state");
        escrow.fileComplaint(id);
    }

    // ----- dispute resolution + slashing -----

    function test_ResolveDispute_BuyerViolator() public {
        uint256 sellerStart = seller.balance;
        uint256 buyerStart = buyer.balance;
        uint256 id = _disputed();

        uint256 penalty = (DEPOSIT * 500) / 10000; // 0.15 ether
        vm.expectEmit(true, true, false, true);
        emit Escrow.ResolvedDispute(id, buyer, penalty);
        escrow.resolveDispute(id, buyer);

        assertEq(uint8(_state(id)), uint8(Escrow.State.Resolved));
        assertEq(buyer.balance, buyerStart - penalty);
        assertEq(seller.balance, sellerStart + penalty);
        assertEq(token.totalSupply(), 0);
        assertEq(address(escrow).balance, 0);
        assertEq(escrow.reputationOf(buyer), 40);
        assertEq(escrow.reputationOf(seller), 55);
    }

    function test_ResolveDispute_SellerViolator() public {
        uint256 sellerStart = seller.balance;
        uint256 buyerStart = buyer.balance;
        uint256 id = _disputed();

        uint256 penalty = (DEPOSIT * 500) / 10000;
        escrow.resolveDispute(id, seller);

        assertEq(seller.balance, sellerStart - penalty);
        assertEq(buyer.balance, buyerStart + penalty);
        assertEq(escrow.reputationOf(seller), 40);
        assertEq(escrow.reputationOf(buyer), 55);
        assertEq(address(escrow).balance, 0);
    }

    function test_ResolveDispute_NoFault() public {
        uint256 sellerStart = seller.balance;
        uint256 buyerStart = buyer.balance;
        uint256 id = _attested(true);
        escrow.fileComplaint(id);

        escrow.resolveDispute(id, address(0));

        assertEq(seller.balance, sellerStart);
        assertEq(buyer.balance, buyerStart);
        assertEq(escrow.reputationOf(seller), 50);
        assertEq(escrow.reputationOf(buyer), 50);
        assertEq(token.totalSupply(), 0);
    }

    function test_ResolveDispute_RevertNotOwner() public {
        uint256 id = _disputed();
        vm.prank(seller);
        vm.expectRevert("caller is not owner");
        escrow.resolveDispute(id, buyer);
        vm.prank(agent);
        vm.expectRevert("caller is not owner");
        escrow.resolveDispute(id, buyer);
    }

    function test_ResolveDispute_RevertNotParty() public {
        uint256 id = _disputed();
        vm.expectRevert("violator not a party");
        escrow.resolveDispute(id, stranger);
    }

    function test_ResolveDispute_RevertWrongState() public {
        uint256 id = _attested(false);
        vm.expectRevert("wrong state");
        escrow.resolveDispute(id, buyer);
    }

    function test_Reputation_FloorAtZero_AndNoReset() public {
        // Trước đây: reputation về 0 sẽ bị _ensureReputationInitialized reset lên 50
        // ở giao dịch kế tiếp → kẻ gian "rửa" điểm. Giờ phải giữ nguyên 0.
        for (uint256 i = 0; i < 6; i++) {
            uint256 id = _disputed();
            escrow.resolveDispute(id, buyer);
        }
        assertEq(escrow.reputationOf(buyer), 0);
        _create();
        assertEq(escrow.reputationOf(buyer), 0);
    }

    function test_Reputation_CappedAt100() public {
        for (uint256 i = 0; i < 11; i++) {
            uint256 id = _disputed();
            escrow.resolveDispute(id, buyer);
        }
        assertEq(escrow.reputationOf(seller), 100);
    }

    // ----- timeouts -----

    function test_CancelOnEvidenceTimeout_MissingBuyerEvidence() public {
        uint256 sellerStart = seller.balance;
        uint256 buyerStart = buyer.balance;
        uint256 id = _funded();
        vm.prank(seller);
        escrow.submitEvidence(id, SELLER_EVIDENCE);

        vm.warp(block.timestamp + EVIDENCE_WINDOW + 1);
        vm.prank(stranger);
        vm.expectEmit(true, false, false, true);
        emit Escrow.Cancelled(id, "evidence timeout");
        escrow.cancelOnEvidenceTimeout(id);

        assertEq(uint8(_state(id)), uint8(Escrow.State.Cancelled));
        assertEq(seller.balance, sellerStart);
        assertEq(buyer.balance, buyerStart);
        assertEq(token.totalSupply(), 0);
        // không cộng reputation khi huỷ
        assertEq(escrow.reputationOf(seller), 50);
        assertEq(escrow.reputationOf(buyer), 50);
    }

    function test_CancelOnEvidenceTimeout_RevertBeforeDeadline() public {
        uint256 id = _funded();
        vm.warp(block.timestamp + EVIDENCE_WINDOW);
        vm.expectRevert("evidence window still open");
        escrow.cancelOnEvidenceTimeout(id);
    }

    function test_CancelOnEvidenceTimeout_RevertWhileAwaitingAgent() public {
        uint256 id = _evidenced();
        vm.warp(block.timestamp + EVIDENCE_WINDOW + ATTEST_WINDOW);
        vm.expectRevert("awaiting agent attestation");
        escrow.cancelOnEvidenceTimeout(id);
    }

    function test_CancelOnEvidenceTimeout_AgentNeverAttests() public {
        uint256 id = _evidenced();
        vm.warp(block.timestamp + EVIDENCE_WINDOW + ATTEST_WINDOW + 1);
        vm.expectEmit(true, false, false, true);
        emit Escrow.Cancelled(id, "attest timeout");
        escrow.cancelOnEvidenceTimeout(id);
        assertEq(uint8(_state(id)), uint8(Escrow.State.Cancelled));
        assertEq(address(escrow).balance, 0);
    }

    function test_CancelOnEvidenceTimeout_RevertWrongState() public {
        uint256 id = _attested(false);
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert("wrong state");
        escrow.cancelOnEvidenceTimeout(id);
    }

    // ----- fuzz: bảo toàn tiền khi xử lý tranh chấp -----

    function testFuzz_DisputeConservesFunds(uint96 value, bool sellerIsViolator) public {
        uint256 v = bound(uint256(value), 4, 100 ether);
        vm.prank(seller);
        uint256 id = escrow.createTrade(buyer, v);
        uint256 dep = escrow.getTrade(id).depositRequired;

        uint256 sellerStart = seller.balance;
        uint256 buyerStart = buyer.balance;

        vm.prank(seller);
        escrow.deposit{value: dep}(id);
        vm.prank(buyer);
        escrow.deposit{value: dep}(id);
        vm.prank(seller);
        escrow.submitEvidence(id, SELLER_EVIDENCE);
        vm.prank(buyer);
        escrow.submitEvidence(id, BUYER_EVIDENCE);
        vm.prank(agent);
        escrow.attest(id, 90, true, REPORT);
        escrow.fileComplaint(id);
        escrow.resolveDispute(id, sellerIsViolator ? seller : buyer);

        uint256 penalty = (dep * 500) / 10000;
        assertEq(seller.balance + buyer.balance, sellerStart + buyerStart);
        if (sellerIsViolator) {
            assertEq(seller.balance, sellerStart - penalty);
        } else {
            assertEq(buyer.balance, buyerStart - penalty);
        }
        assertEq(address(escrow).balance, 0);
        assertEq(token.totalSupply(), 0);
    }
}

contract EscrowAdversarialTest is EscrowTestBase {
    function test_TokenTransferCannotBlockResolution() public {
        // Lỗi cũ: bên vi phạm chuyển CDU đi → burn() revert → kẹt tiền vĩnh viễn.
        uint256 id = _disputed();
        vm.prank(buyer);
        vm.expectRevert("CDU is non-transferable");
        token.transfer(stranger, DEPOSIT);
        escrow.resolveDispute(id, buyer);
        assertEq(uint8(_state(id)), uint8(Escrow.State.Resolved));
    }

    function test_RejectingReceiverCannotBlockDispute() public {
        Party evil = new Party(escrow);
        vm.deal(address(evil), 10 ether);

        vm.prank(seller);
        uint256 id = escrow.createTrade(address(evil), ITEM_VALUE);
        vm.prank(seller);
        escrow.deposit{value: DEPOSIT}(id);
        evil.doDeposit{value: DEPOSIT}(id);
        vm.prank(seller);
        escrow.submitEvidence(id, SELLER_EVIDENCE);
        evil.evidence(id, BUYER_EVIDENCE);
        vm.prank(agent);
        escrow.attest(id, 95, true, REPORT);
        escrow.fileComplaint(id);

        evil.setAccept(false);
        uint256 sellerBefore = seller.balance;
        uint256 penalty = (DEPOSIT * 500) / 10000;

        vm.expectEmit(true, false, false, true);
        emit Escrow.PayoutDeferred(address(evil), DEPOSIT - penalty);
        escrow.resolveDispute(id, address(evil));

        // Bên trung thực vẫn nhận tiền ngay; phần của bên từ chối được giữ lại để tự rút.
        assertEq(seller.balance, sellerBefore + DEPOSIT + penalty);
        assertEq(escrow.pendingWithdrawals(address(evil)), DEPOSIT - penalty);
        assertEq(address(escrow).balance, DEPOSIT - penalty);

        vm.expectRevert("withdraw failed");
        evil.withdraw();

        evil.setAccept(true);
        uint256 evilBefore = address(evil).balance;
        evil.withdraw();
        assertEq(address(evil).balance, evilBefore + DEPOSIT - penalty);
        assertEq(escrow.pendingWithdrawals(address(evil)), 0);
        assertEq(address(escrow).balance, 0);
    }

    function test_Withdraw_RevertNothing() public {
        vm.prank(stranger);
        vm.expectRevert("nothing to withdraw");
        escrow.withdraw();
    }

    function test_ReentrancyOnResolveClean() public {
        Reentrant evil = new Reentrant(escrow);
        vm.deal(address(evil), 20 ether);

        // Trade phụ: evil có cọc khác đang nằm trong escrow (để burn lần 2 không tự revert vì thiếu CDU)
        vm.prank(seller);
        uint256 other = escrow.createTrade(address(evil), ITEM_VALUE);
        evil.doDeposit{value: DEPOSIT}(other);

        // Trade chính: evil là seller
        uint256 id = evil.create(buyer, ITEM_VALUE);
        evil.doDeposit{value: DEPOSIT}(id);
        vm.prank(buyer);
        escrow.deposit{value: DEPOSIT}(id);
        evil.evidence(id, SELLER_EVIDENCE);
        vm.prank(buyer);
        escrow.submitEvidence(id, BUYER_EVIDENCE);
        vm.prank(agent);
        escrow.attest(id, 10, false, REPORT);
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        evil.setTarget(id);
        uint256 evilBefore = address(evil).balance;
        escrow.resolveClean(id);

        assertTrue(evil.reentered());
        assertFalse(evil.reentrySucceeded());
        assertEq(address(evil).balance, evilBefore + DEPOSIT); // nhận đúng 1 lần
        // Cọc của trade phụ vẫn nguyên trong escrow
        assertEq(address(escrow).balance, DEPOSIT);
        assertEq(token.balanceOf(address(evil)), DEPOSIT);
    }
}
