// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title CollectibleToken
/// @notice Token kế toán nội bộ cho khoản cọc. Mint 1:1 khi Escrow ghi nhận
///         một khoản AVAX được nạp làm cọc, burn 1:1 khi khoản cọc đó được
///         giải ngân hoặc hoàn trả. Không có lợi tức, không có thị trường —
///         chỉ là đơn vị kế toán cho "Ký Cược" (Điều 328 Bộ luật Dân sự 2015).
/// @dev    Chỉ địa chỉ Escrow (set một lần) mới được mint/burn. Giữ gọn: không
///         cần vai trò AccessControl phức tạp vì chỉ có một caller hợp lệ.
///         Token KHÔNG chuyển nhượng được (soulbound): nếu cho transfer, một bên
///         có thể chuyển CDU đi chỗ khác làm burn() trong Escrow revert, khoá cứng
///         việc giải ngân/xử lý tranh chấp của cả giao dịch.
contract CollectibleToken is ERC20, Ownable {
    address public escrow;

    event EscrowSet(address indexed escrow);

    constructor() ERC20("Collectible Deposit Unit", "CDU") Ownable(msg.sender) {}

    /// @notice Gắn địa chỉ contract Escrow được phép mint/burn. Chỉ gọi được một lần
    ///         để tránh owner tự ý đổi quyền phát hành sau khi đã có user tham gia.
    function setEscrow(address _escrow) external onlyOwner {
        require(escrow == address(0), "escrow already set");
        require(_escrow != address(0), "zero address");
        escrow = _escrow;
        emit EscrowSet(_escrow);
    }

    modifier onlyEscrow() {
        require(msg.sender == escrow, "caller is not escrow");
        _;
    }

    function mint(address to, uint256 amount) external onlyEscrow {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyEscrow {
        _burn(from, amount);
    }

    /// @dev Chặn mọi transfer/transferFrom giữa hai ví; chỉ cho mint (from = 0)
    ///      và burn (to = 0).
    function _update(address from, address to, uint256 value) internal override {
        require(from == address(0) || to == address(0), "CDU is non-transferable");
        super._update(from, to, value);
    }
}
