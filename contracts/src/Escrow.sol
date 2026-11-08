// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./CollectibleToken.sol";

/// @title Escrow
/// @notice Escrow 2 bên (không broker) cho giao dịch đồ sưu tầm. Mỗi bên nạp cọc
///         <=30% giá trị món hàng. Agent AI xác thực bằng chứng ngoài chuỗi và
///         gọi attest() để báo điểm rủi ro + cờ gian lận. Giải ngân tự động nếu
///         sạch, hoặc chuyển sang khiếu nại (phạt 5%) nếu có tranh chấp.
/// @dev    Giữ Solidity gọn theo nguyên tắc dự án: một contract, không dùng
///         proxy/upgradeable, không ECDSA signature riêng cho agent — quyền
///         agent được gán bằng địa chỉ (onlyAgent), vì agent service tự ký
///         transaction bằng ví riêng của nó.
///         Mọi hàm chuyển AVAX ra ngoài: cập nhật state TRƯỚC (checks-effects-
///         interactions) + nonReentrant. Nếu chuyển AVAX thất bại (ví nhận là
///         contract từ chối nhận), tiền được ghi vào pendingWithdrawals để người
///         nhận tự rút sau — một bên không thể chặn cả giao dịch bằng cách revert.
contract Escrow is ReentrancyGuard {
    CollectibleToken public immutable token;
    address public owner;      // arbiter mặc định cho dispute
    address public agent;      // địa chỉ ví của AI agent service (Cách B: backend)

    uint16 public constant MAX_DEPOSIT_BPS = 3000;   // 30.00% giá trị món hàng
    uint16 public constant PENALTY_BPS = 500;        // 5.00% phạt bên vi phạm
    uint256 public constant INITIAL_REPUTATION = 50;
    uint256 public constant MAX_REPUTATION = 100;

    // Các cửa sổ thời gian set lúc deploy: production dùng 3 ngày / 1 ngày / 2 ngày,
    // bản demo có thể deploy với vài phút để quay video được trọn luồng.
    uint256 public immutable EVIDENCE_WINDOW; // hạn nộp bằng chứng sau khi đủ cọc
    uint256 public immutable ATTEST_WINDOW;   // agent phải attest trong khoảng này sau evidenceDeadline, quá hạn thì ai cũng huỷ được
    uint256 public immutable DISPUTE_WINDOW;  // hạn khiếu nại sau khi attest sạch

    enum State {
        Created,            // giao dịch được tạo, chờ đủ 2 cọc
        AwaitingEvidence,   // đã đủ cọc, chờ seller+buyer nộp bằng chứng
        Attested,           // agent đã chạy xong, chờ hết DISPUTE_WINDOW hoặc có khiếu nại
        Disputed,           // có khiếu nại, chờ owner/arbiter xử lý
        Resolved,           // đã giải ngân xong (sạch hoặc sau khiếu nại)
        Cancelled           // timeout / huỷ trước khi đủ cọc, hoàn cọc
    }

    struct Trade {
        address seller;
        address buyer;
        uint256 itemValue;      // định giá món hàng, đơn vị wei, do 2 bên thống nhất off-chain rồi nhập khi tạo
        uint256 depositRequired; // = itemValue * depositBps / 10000, áp dụng cho MỖI bên
        uint256 sellerDeposit;
        uint256 buyerDeposit;
        bytes32 nonce;           // chống tái sử dụng ảnh cũ — in lên bằng chứng (ý tưởng A)
        bytes32 sellerEvidenceHash; // keccak256(CID ảnh đóng gói + report off-chain)
        bytes32 buyerEvidenceHash;  // keccak256(CID video unbox + report off-chain)
        bytes32 reportHash;      // keccak256 của Evidence Report do agent neo lên
        uint8 riskScore;         // 0-100, do agent attest, càng cao càng rủi ro
        bool flagged;            // agent phát hiện bất thường (nonce sai / ảnh tái sử dụng / không khớp)
        uint64 createdAt;
        uint64 evidenceDeadline;
        uint64 disputeDeadline;
        State state;
    }

    uint256 public nextTradeId = 1;
    // internal: getter tự sinh cho struct 16 trường bị "stack too deep" — đọc qua getTrade().
    mapping(uint256 => Trade) internal trades;
    // Giá trị thô; dùng reputationOf() để đọc (trả 50 cho ví chưa từng giao dịch).
    mapping(address => uint256) public reputation;
    mapping(address => bool) public reputationInitialized;
    mapping(address => uint256) public pendingWithdrawals;

    event TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, uint256 itemValue, bytes32 nonce);
    event Deposited(uint256 indexed tradeId, address indexed who, uint256 amount);
    event FullyFunded(uint256 indexed tradeId, uint64 evidenceDeadline);
    event EvidenceSubmitted(uint256 indexed tradeId, address indexed who, bytes32 evidenceHash);
    event Attested(uint256 indexed tradeId, uint8 riskScore, bool flagged, bytes32 reportHash);
    event ResolvedClean(uint256 indexed tradeId);
    event Disputed(uint256 indexed tradeId, address indexed filer);
    event ResolvedDispute(uint256 indexed tradeId, address indexed violator, uint256 penaltyAmount);
    event Cancelled(uint256 indexed tradeId, string reason);
    event AgentUpdated(address indexed newAgent);
    event ReputationChanged(address indexed who, uint256 newScore);
    event PayoutDeferred(address indexed to, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    modifier onlyAgent() {
        require(msg.sender == agent, "caller is not agent");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "caller is not owner");
        _;
    }

    modifier onlyParty(uint256 tradeId) {
        Trade storage t = trades[tradeId];
        require(msg.sender == t.seller || msg.sender == t.buyer, "not a party");
        _;
    }

    constructor(
        address tokenAddress,
        address agentAddress,
        uint256 evidenceWindow,
        uint256 attestWindow,
        uint256 disputeWindow
    ) {
        require(tokenAddress != address(0) && agentAddress != address(0), "zero address");
        require(evidenceWindow > 0 && attestWindow > 0 && disputeWindow > 0, "zero window");
        // Giới hạn trên để các phép ép kiểu uint64 cho deadline luôn an toàn.
        require(evidenceWindow <= 365 days && attestWindow <= 365 days && disputeWindow <= 365 days, "window too long");
        token = CollectibleToken(tokenAddress);
        owner = msg.sender;
        agent = agentAddress;
        EVIDENCE_WINDOW = evidenceWindow;
        ATTEST_WINDOW = attestWindow;
        DISPUTE_WINDOW = disputeWindow;
    }

    function setAgent(address newAgent) external onlyOwner {
        require(newAgent != address(0), "zero address");
        agent = newAgent;
        emit AgentUpdated(newAgent);
    }

    // ------------------------------------------------------------------
    // Luồng chính
    // ------------------------------------------------------------------

    /// @notice Seller tạo giao dịch, nhập địa chỉ buyer và giá trị món hàng đã thống nhất.
    ///         Hợp đồng tự sinh nonce gắn với tradeId — nonce này PHẢI được viết lên
    ///         giấy đặt cạnh món hàng khi chụp/quay bằng chứng (chống ảnh tái sử dụng).
    function createTrade(address buyer, uint256 itemValue) external returns (uint256 tradeId) {
        require(buyer != address(0) && buyer != msg.sender, "invalid buyer");
        uint256 depositRequired = (itemValue * MAX_DEPOSIT_BPS) / 10000;
        require(depositRequired > 0, "itemValue too small");

        tradeId = nextTradeId++;
        bytes32 nonce = keccak256(abi.encodePacked(tradeId, msg.sender, buyer, block.timestamp, block.prevrandao));

        Trade storage t = trades[tradeId];
        t.seller = msg.sender;
        t.buyer = buyer;
        t.itemValue = itemValue;
        t.depositRequired = depositRequired;
        t.nonce = nonce;
        t.createdAt = uint64(block.timestamp);
        t.state = State.Created;

        _ensureReputationInitialized(msg.sender);
        _ensureReputationInitialized(buyer);

        emit TradeCreated(tradeId, msg.sender, buyer, itemValue, nonce);
    }

    /// @notice Seller hoặc buyer nạp đúng depositRequired bằng AVAX native.
    ///         Mint CollectibleToken 1:1 cho người nạp (Hướng B: đơn vị kế toán, không lợi tức).
    function deposit(uint256 tradeId) external payable onlyParty(tradeId) nonReentrant {
        Trade storage t = trades[tradeId];
        require(t.state == State.Created, "wrong state");
        require(msg.value == t.depositRequired, "wrong deposit amount");

        if (msg.sender == t.seller) {
            require(t.sellerDeposit == 0, "already deposited");
            t.sellerDeposit = msg.value;
        } else {
            require(t.buyerDeposit == 0, "already deposited");
            t.buyerDeposit = msg.value;
        }

        if (t.sellerDeposit > 0 && t.buyerDeposit > 0) {
            t.state = State.AwaitingEvidence;
            t.evidenceDeadline = uint64(block.timestamp + EVIDENCE_WINDOW);
            emit FullyFunded(tradeId, t.evidenceDeadline);
        }

        token.mint(msg.sender, msg.value);
        emit Deposited(tradeId, msg.sender, msg.value);
    }

    /// @notice Huỷ giao dịch khi chưa đủ 2 cọc (bên kia không nạp). Bên nào đã nạp được hoàn lại.
    function cancelUnfunded(uint256 tradeId) external onlyParty(tradeId) nonReentrant {
        Trade storage t = trades[tradeId];
        require(t.state == State.Created, "wrong state");
        t.state = State.Cancelled;
        _refundBoth(t);
        emit Cancelled(tradeId, "cancelled before funded");
    }

    /// @notice Nộp hash bằng chứng (ảnh đóng gói của seller / video unbox của buyer).
    ///         Nội dung thật (ảnh/video) lưu ngoài chuỗi (IPFS); chỉ neo hash lên chain
    ///         để chống sửa sau (ý tưởng "Evidence Anchoring") — mỗi bên chỉ nộp MỘT lần.
    function submitEvidence(uint256 tradeId, bytes32 evidenceHash) external onlyParty(tradeId) {
        Trade storage t = trades[tradeId];
        require(t.state == State.AwaitingEvidence, "wrong state");
        require(block.timestamp <= t.evidenceDeadline, "evidence window closed");
        require(evidenceHash != bytes32(0), "empty evidence");

        if (msg.sender == t.seller) {
            require(t.sellerEvidenceHash == bytes32(0), "evidence already submitted");
            t.sellerEvidenceHash = evidenceHash;
        } else {
            require(t.buyerEvidenceHash == bytes32(0), "evidence already submitted");
            t.buyerEvidenceHash = evidenceHash;
        }
        emit EvidenceSubmitted(tradeId, msg.sender, evidenceHash);
    }

    /// @notice Agent AI gọi sau khi chạy xong pipeline off-chain (pHash, ORB, OCR nonce...).
    ///         reportHash = keccak256 của Evidence Report đầy đủ, neo lên chain làm bằng chứng
    ///         không thể sửa sau. flagged = true nếu phát hiện bất thường nghiêm trọng
    ///         (sai nonce / ảnh trùng ảnh cũ / không khớp vật thể).
    function attest(uint256 tradeId, uint8 riskScore, bool flagged, bytes32 reportHash) external onlyAgent {
        Trade storage t = trades[tradeId];
        require(t.state == State.AwaitingEvidence, "wrong state");
        require(t.sellerEvidenceHash != bytes32(0) && t.buyerEvidenceHash != bytes32(0), "evidence missing");
        require(block.timestamp <= uint256(t.evidenceDeadline) + ATTEST_WINDOW, "attest window closed");
        require(riskScore <= 100, "riskScore > 100");
        require(reportHash != bytes32(0), "empty report");

        t.riskScore = riskScore;
        t.flagged = flagged;
        t.reportHash = reportHash;
        t.disputeDeadline = uint64(block.timestamp + DISPUTE_WINDOW);
        t.state = State.Attested;

        emit Attested(tradeId, riskScore, flagged, reportHash);
    }

    /// @notice Sau DISPUTE_WINDOW mà không ai khiếu nại và agent không flag: giải ngân sạch.
    ///         Ai cũng gọi được (để không phụ thuộc một bên phải chủ động bấm).
    function resolveClean(uint256 tradeId) external nonReentrant {
        Trade storage t = trades[tradeId];
        require(t.state == State.Attested, "wrong state");
        require(!t.flagged, "trade flagged, cannot auto-resolve");
        require(block.timestamp > t.disputeDeadline, "dispute window still open");

        t.state = State.Resolved;
        _bumpReputation(t.seller, 1);
        _bumpReputation(t.buyer, 1);
        _refundBoth(t);
        emit ResolvedClean(tradeId);
    }

    /// @notice Seller hoặc buyer khiếu nại trong DISPUTE_WINDOW, hoặc bất kỳ ai cũng có thể
    ///         kích hoạt nếu agent đã flagged (đưa thẳng sang xử lý tranh chấp).
    function fileComplaint(uint256 tradeId) external {
        Trade storage t = trades[tradeId];
        require(t.state == State.Attested, "wrong state");
        if (!t.flagged) {
            require(msg.sender == t.seller || msg.sender == t.buyer, "not a party");
            require(block.timestamp <= t.disputeDeadline, "dispute window closed");
        }
        t.state = State.Disputed;
        emit Disputed(tradeId, msg.sender);
    }

    /// @notice Owner/arbiter xử lý tranh chấp: phạt PENALTY_BPS của bên vi phạm, chuyển cho bên kia,
    ///         phần còn lại hoàn về chủ sở hữu, burn token tương ứng, cập nhật reputation.
    ///         violator = address(0) nghĩa là không ai sai (vd. AI flag nhầm) — hoàn cọc đủ cả hai.
    function resolveDispute(uint256 tradeId, address violator) external onlyOwner nonReentrant {
        Trade storage t = trades[tradeId];
        require(t.state == State.Disputed, "wrong state");
        require(violator == address(0) || violator == t.seller || violator == t.buyer, "violator not a party");

        t.state = State.Resolved;

        if (violator == address(0)) {
            _refundBoth(t);
            emit ResolvedDispute(tradeId, address(0), 0);
            return;
        }

        address victim = violator == t.seller ? t.buyer : t.seller;
        uint256 violatorDeposit = violator == t.seller ? t.sellerDeposit : t.buyerDeposit;
        uint256 victimDeposit = victim == t.seller ? t.sellerDeposit : t.buyerDeposit;

        uint256 penalty = (violatorDeposit * PENALTY_BPS) / 10000;
        uint256 violatorRefund = violatorDeposit - penalty;

        _dropReputation(violator, 10);
        _bumpReputation(victim, 5);

        token.burn(violator, violatorDeposit);
        token.burn(victim, victimDeposit);
        _payout(violator, violatorRefund);
        _payout(victim, victimDeposit + penalty);

        emit ResolvedDispute(tradeId, violator, penalty);
    }

    /// @notice Hoàn cọc khi quá hạn: (a) hết EVIDENCE_WINDOW mà một bên chưa nộp bằng chứng,
    ///         hoặc (b) đã đủ bằng chứng nhưng agent không attest trong ATTEST_WINDOW.
    ///         Ai cũng gọi được. Không cộng reputation (tránh farm điểm bằng giao dịch huỷ).
    function cancelOnEvidenceTimeout(uint256 tradeId) external nonReentrant {
        Trade storage t = trades[tradeId];
        require(t.state == State.AwaitingEvidence, "wrong state");
        require(block.timestamp > t.evidenceDeadline, "evidence window still open");

        bool evidenceMissing = t.sellerEvidenceHash == bytes32(0) || t.buyerEvidenceHash == bytes32(0);
        if (!evidenceMissing) {
            require(block.timestamp > uint256(t.evidenceDeadline) + ATTEST_WINDOW, "awaiting agent attestation");
        }

        t.state = State.Cancelled;
        _refundBoth(t);
        emit Cancelled(tradeId, evidenceMissing ? "evidence timeout" : "attest timeout");
    }

    /// @notice Rút khoản AVAX đã bị hoãn do chuyển thẳng thất bại.
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "withdraw failed");
        emit Withdrawn(msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // View tiện cho frontend / agent
    // ------------------------------------------------------------------

    function getTrade(uint256 tradeId) external view returns (Trade memory) {
        return trades[tradeId];
    }

    function reputationOf(address who) external view returns (uint256) {
        return reputationInitialized[who] ? reputation[who] : INITIAL_REPUTATION;
    }

    // ------------------------------------------------------------------
    // Nội bộ
    // ------------------------------------------------------------------

    /// @dev Gọi SAU khi đã chuyển state, burn token rồi trả cọc về đúng chủ.
    function _refundBoth(Trade storage t) internal {
        uint256 s = t.sellerDeposit;
        uint256 b = t.buyerDeposit;
        if (s > 0) token.burn(t.seller, s);
        if (b > 0) token.burn(t.buyer, b);
        _payout(t.seller, s);
        _payout(t.buyer, b);
    }

    function _payout(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) {
            pendingWithdrawals[to] += amount;
            emit PayoutDeferred(to, amount);
        }
    }

    function _ensureReputationInitialized(address who) internal {
        if (!reputationInitialized[who]) {
            reputationInitialized[who] = true;
            reputation[who] = INITIAL_REPUTATION;
        }
    }

    function _bumpReputation(address who, uint256 delta) internal {
        uint256 r = reputation[who] + delta;
        reputation[who] = r > MAX_REPUTATION ? MAX_REPUTATION : r;
        emit ReputationChanged(who, reputation[who]);
    }

    function _dropReputation(address who, uint256 delta) internal {
        reputation[who] = reputation[who] > delta ? reputation[who] - delta : 0;
        emit ReputationChanged(who, reputation[who]);
    }
}
