// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CollectibleToken.sol";

contract CollectibleTokenTest is Test {
    CollectibleToken token;
    address escrow = makeAddr("escrow");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        token = new CollectibleToken();
    }

    function test_Metadata() public view {
        assertEq(token.name(), "Collectible Deposit Unit");
        assertEq(token.symbol(), "CDU");
        assertEq(token.decimals(), 18);
        assertEq(token.owner(), address(this));
    }

    function test_SetEscrow_OnlyOnce() public {
        token.setEscrow(escrow);
        assertEq(token.escrow(), escrow);
        vm.expectRevert("escrow already set");
        token.setEscrow(alice);
    }

    function test_SetEscrow_RevertZero() public {
        vm.expectRevert("zero address");
        token.setEscrow(address(0));
    }

    function test_SetEscrow_RevertNotOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice));
        token.setEscrow(escrow);
    }

    function test_SetEscrow_EmitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit CollectibleToken.EscrowSet(escrow);
        token.setEscrow(escrow);
    }

    function test_MintBurn_OnlyEscrow() public {
        token.setEscrow(escrow);

        vm.expectRevert("caller is not escrow");
        token.mint(alice, 1 ether);

        vm.prank(escrow);
        token.mint(alice, 1 ether);
        assertEq(token.balanceOf(alice), 1 ether);
        assertEq(token.totalSupply(), 1 ether);

        vm.prank(alice);
        vm.expectRevert("caller is not escrow");
        token.burn(alice, 1 ether);

        vm.prank(escrow);
        token.burn(alice, 0.4 ether);
        assertEq(token.balanceOf(alice), 0.6 ether);
        assertEq(token.totalSupply(), 0.6 ether);
    }

    function test_MintBeforeEscrowSet_Reverts() public {
        // escrow == address(0) nên không ai mint được trước khi gắn Escrow.
        vm.expectRevert("caller is not escrow");
        token.mint(alice, 1);
    }

    function test_Transfer_Reverts() public {
        token.setEscrow(escrow);
        vm.prank(escrow);
        token.mint(alice, 1 ether);

        vm.prank(alice);
        vm.expectRevert("CDU is non-transferable");
        token.transfer(bob, 1);
    }

    function test_TransferFrom_Reverts() public {
        token.setEscrow(escrow);
        vm.prank(escrow);
        token.mint(alice, 1 ether);

        vm.prank(alice);
        token.approve(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert("CDU is non-transferable");
        token.transferFrom(alice, bob, 1);
    }

    function test_BurnMoreThanBalance_Reverts() public {
        token.setEscrow(escrow);
        vm.prank(escrow);
        token.mint(alice, 1);
        vm.prank(escrow);
        vm.expectRevert();
        token.burn(alice, 2);
    }

    function testFuzz_MintBurnRoundTrip(uint128 amount) public {
        token.setEscrow(escrow);
        vm.startPrank(escrow);
        token.mint(alice, amount);
        token.burn(alice, amount);
        vm.stopPrank();
        assertEq(token.totalSupply(), 0);
        assertEq(token.balanceOf(alice), 0);
    }
}
