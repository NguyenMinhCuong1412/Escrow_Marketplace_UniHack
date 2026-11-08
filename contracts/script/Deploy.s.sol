// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/CollectibleToken.sol";
import "../src/Escrow.sol";

/// @notice Deploy CollectibleToken + Escrow, gắn token.setEscrow(), ghi địa chỉ ra
///         deployments/<chainId>.json để backend/frontend đọc.
///
/// Biến môi trường:
///   PRIVATE_KEY           ví deployer (owner/arbiter)                   — bắt buộc
///   AGENT_ADDRESS         địa chỉ ví agent backend                     — bắt buộc
///   EVIDENCE_WINDOW_SECS  mặc định 259200 (3 ngày)
///   ATTEST_WINDOW_SECS    mặc định 86400  (1 ngày)
///   DISPUTE_WINDOW_SECS   mặc định 172800 (2 ngày)
///
/// Chạy:
///   forge script script/Deploy.s.sol --rpc-url anvil --broadcast
///   forge script script/Deploy.s.sol --rpc-url fuji  --broadcast
contract Deploy is Script {
    function run() external returns (CollectibleToken token, Escrow escrow) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address agent = vm.envAddress("AGENT_ADDRESS");
        uint256 evidenceWindow = vm.envOr("EVIDENCE_WINDOW_SECS", uint256(3 days));
        uint256 attestWindow = vm.envOr("ATTEST_WINDOW_SECS", uint256(1 days));
        uint256 disputeWindow = vm.envOr("DISPUTE_WINDOW_SECS", uint256(2 days));

        vm.startBroadcast(pk);
        token = new CollectibleToken();
        escrow = new Escrow(address(token), agent, evidenceWindow, attestWindow, disputeWindow);
        token.setEscrow(address(escrow));
        vm.stopBroadcast();

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "owner", vm.addr(pk));
        vm.serializeAddress(key, "agent", agent);
        vm.serializeUint(key, "evidenceWindow", evidenceWindow);
        vm.serializeUint(key, "attestWindow", attestWindow);
        vm.serializeUint(key, "disputeWindow", disputeWindow);
        vm.serializeUint(key, "deployBlock", block.number);
        vm.serializeAddress(key, "token", address(token));
        string memory json = vm.serializeAddress(key, "escrow", address(escrow));
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);

        console.log("CollectibleToken:", address(token));
        console.log("Escrow:          ", address(escrow));
        console.log("Written to       ", path);
    }
}
