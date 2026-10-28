// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ArcLinkPay} from "../ArcLinkPay.sol";

// ---------------------------------------------------------------------------
// Minimal ERC-20 mock with 6 decimals and a public mint — defined inline so
// the test file is entirely self-contained.
// ---------------------------------------------------------------------------
contract MockUSDC is IERC20 {
    string  public name     = "Mock USDC";
    string  public symbol   = "mUSDC";
    uint8   public decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    function mint(address to, uint256 amount) external {
        _balances[to] += amount;
        totalSupply    += amount;
        emit Transfer(address(0), to, amount);
    }

    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        require(_balances[msg.sender] >= amount, "ERC20: insufficient balance");
        _balances[msg.sender] -= amount;
        _balances[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(address owner, address spender) external view override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        require(_balances[from] >= amount, "ERC20: insufficient balance");
        uint256 allowed = _allowances[from][msg.sender];
        require(allowed >= amount, "ERC20: insufficient allowance");
        _allowances[from][msg.sender] = allowed - amount;
        _balances[from] -= amount;
        _balances[to]   += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

// ---------------------------------------------------------------------------
// Test contract
// ---------------------------------------------------------------------------
contract ArcLinkPayTest is Test {
    MockUSDC    internal usdc;
    ArcLinkPay  internal pay;

    address internal payer     = makeAddr("payer");
    address internal recipient = makeAddr("recipient");

    // Convenient defaults
    string  internal constant LINK_ID = "link-abc-123";
    uint256 internal constant AMOUNT  = 100e6; // 100 USDC

    function setUp() public {
        usdc = new MockUSDC();
        pay  = new ArcLinkPay(IERC20(address(usdc)));
    }

    // -----------------------------------------------------------------------
    // Helper
    // -----------------------------------------------------------------------

    /// Mint `amount` to `payer` and grant the contract exactly `amount` approval.
    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(pay), amount);
    }

    // -----------------------------------------------------------------------
    // Case 7 — Constructor revert on zero token address (tested first because
    //           it doesn't need any state from setUp)
    // -----------------------------------------------------------------------

    function test_Constructor_RevertsOnZeroToken() public {
        vm.expectRevert(ArcLinkPay.ZeroToken.selector);
        new ArcLinkPay(IERC20(address(0)));
    }

    function test_Constructor_StoresUsdcAddress() public view {
        assertEq(address(pay.usdc()), address(usdc));
    }

    // -----------------------------------------------------------------------
    // Case 1 — pay() moves exactly `amount` to recipient, payer debited,
    //          contract balance stays 0.
    // -----------------------------------------------------------------------

    function test_Pay_MovesExactAmountToRecipient() public {
        _fund(payer, AMOUNT);

        vm.prank(payer);
        pay.pay(LINK_ID, recipient, AMOUNT);

        assertEq(usdc.balanceOf(recipient),     AMOUNT, "recipient balance");
        assertEq(usdc.balanceOf(payer),         0,      "payer balance");
        assertEq(usdc.balanceOf(address(pay)),  0,      "contract balance");
    }

    // -----------------------------------------------------------------------
    // Case 2 — pay() emits LinkPaid, returns ref, sets paid[ref] = true.
    // -----------------------------------------------------------------------

    function test_Pay_EmitsLinkPaid() public {
        _fund(payer, AMOUNT);

        bytes32 expectedRef = pay.refFor(LINK_ID, recipient, AMOUNT);

        // LinkPaid(bytes32 indexed ref, address indexed payer,
        //          address indexed recipient, uint256 amount, string linkId)
        // All three indexed topics must match; check data too.
        vm.expectEmit(true, true, true, true, address(pay));
        emit ArcLinkPay.LinkPaid(expectedRef, payer, recipient, AMOUNT, LINK_ID);

        vm.prank(payer);
        pay.pay(LINK_ID, recipient, AMOUNT);
    }

    function test_Pay_ReturnsCorrectRef() public {
        _fund(payer, AMOUNT);

        bytes32 expectedRef = pay.refFor(LINK_ID, recipient, AMOUNT);

        vm.prank(payer);
        bytes32 returnedRef = pay.pay(LINK_ID, recipient, AMOUNT);

        assertEq(returnedRef, expectedRef, "returned ref");
    }

    function test_Pay_SetsPaidTrue() public {
        _fund(payer, AMOUNT);

        bytes32 ref = pay.refFor(LINK_ID, recipient, AMOUNT);
        assertFalse(pay.paid(ref), "paid should be false before");

        vm.prank(payer);
        pay.pay(LINK_ID, recipient, AMOUNT);

        assertTrue(pay.paid(ref), "paid should be true after");
    }

    // -----------------------------------------------------------------------
    // Case 3 — Paying same link twice reverts with AlreadyPaid(ref).
    // -----------------------------------------------------------------------

    function test_Pay_SecondPaymentRevertsAlreadyPaid() public {
        _fund(payer, AMOUNT * 2);
        // Give enough approval for two potential payments
        vm.prank(payer);
        usdc.approve(address(pay), AMOUNT * 2);

        vm.prank(payer);
        pay.pay(LINK_ID, recipient, AMOUNT);

        bytes32 ref = pay.refFor(LINK_ID, recipient, AMOUNT);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ArcLinkPay.AlreadyPaid.selector, ref));
        pay.pay(LINK_ID, recipient, AMOUNT);
    }

    // -----------------------------------------------------------------------
    // Case 4 — A different party using the same linkId with a different
    //          recipient/amount produces a distinct ref and does NOT block the
    //          original link.
    // -----------------------------------------------------------------------

    function test_Pay_DifferentParamsDifferentRef_BothSucceed() public {
        address otherRecipient = makeAddr("otherRecipient");
        address otherPayer     = makeAddr("otherPayer");
        uint256 otherAmount    = 50e6;

        _fund(payer,      AMOUNT);
        _fund(otherPayer, otherAmount);

        bytes32 ref1 = pay.refFor(LINK_ID, recipient,      AMOUNT);
        bytes32 ref2 = pay.refFor(LINK_ID, otherRecipient, otherAmount);

        // Refs must differ
        assertTrue(ref1 != ref2, "refs should differ");

        // First pay — original link
        vm.prank(payer);
        pay.pay(LINK_ID, recipient, AMOUNT);

        // Second pay — different params on the same linkId, must not revert
        vm.prank(otherPayer);
        pay.pay(LINK_ID, otherRecipient, otherAmount);

        assertTrue(pay.paid(ref1), "ref1 paid");
        assertTrue(pay.paid(ref2), "ref2 paid");
    }

    // -----------------------------------------------------------------------
    // Case 5a — Revert: zero amount
    // -----------------------------------------------------------------------

    function test_Pay_RevertsOnZeroAmount() public {
        _fund(payer, AMOUNT);

        vm.prank(payer);
        vm.expectRevert(ArcLinkPay.ZeroAmount.selector);
        pay.pay(LINK_ID, recipient, 0);
    }

    // -----------------------------------------------------------------------
    // Case 5b — Revert: zero recipient
    // -----------------------------------------------------------------------

    function test_Pay_RevertsOnZeroRecipient() public {
        _fund(payer, AMOUNT);

        vm.prank(payer);
        vm.expectRevert(ArcLinkPay.InvalidRecipient.selector);
        pay.pay(LINK_ID, address(0), AMOUNT);
    }

    // -----------------------------------------------------------------------
    // Case 5c — Revert: recipient == contract address
    // -----------------------------------------------------------------------

    function test_Pay_RevertsWhenRecipientIsContract() public {
        _fund(payer, AMOUNT);

        vm.prank(payer);
        vm.expectRevert(ArcLinkPay.InvalidRecipient.selector);
        pay.pay(LINK_ID, address(pay), AMOUNT);
    }

    // -----------------------------------------------------------------------
    // Case 5d — Revert: empty linkId
    // -----------------------------------------------------------------------

    function test_Pay_RevertsOnEmptyLinkId() public {
        _fund(payer, AMOUNT);

        vm.prank(payer);
        vm.expectRevert(ArcLinkPay.InvalidLinkId.selector);
        pay.pay("", recipient, AMOUNT);
    }

    // -----------------------------------------------------------------------
    // Case 5e — Revert: 65-byte linkId exceeds MAX_LINK_ID_LENGTH (64).
    // -----------------------------------------------------------------------

    function test_Pay_RevertsOn65ByteLinkId() public {
        _fund(payer, AMOUNT);

        // Build a 65-character string
        string memory tooLong = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1";
        assertEq(bytes(tooLong).length, 65, "sanity: string is 65 bytes");

        vm.prank(payer);
        vm.expectRevert(ArcLinkPay.InvalidLinkId.selector);
        pay.pay(tooLong, recipient, AMOUNT);
    }

    // -----------------------------------------------------------------------
    // Case 5f — Confirm: 64-byte linkId succeeds.
    // -----------------------------------------------------------------------

    function test_Pay_SucceedsWith64ByteLinkId() public {
        _fund(payer, AMOUNT);

        // Exactly 64 characters
        string memory maxLen = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        assertEq(bytes(maxLen).length, 64, "sanity: string is 64 bytes");

        vm.prank(payer);
        bytes32 ref = pay.pay(maxLen, recipient, AMOUNT);

        bytes32 expected = pay.refFor(maxLen, recipient, AMOUNT);
        assertEq(ref, expected, "ref matches");
        assertTrue(pay.paid(ref), "paid set");
        assertEq(usdc.balanceOf(recipient), AMOUNT, "recipient received funds");
    }

    // -----------------------------------------------------------------------
    // Case 6a — Revert: no approval — no funds move, paid[ref] stays false.
    // -----------------------------------------------------------------------

    function test_Pay_RevertsWithNoApproval() public {
        // Mint but no approve
        usdc.mint(payer, AMOUNT);

        bytes32 ref = pay.refFor(LINK_ID, recipient, AMOUNT);

        vm.prank(payer);
        vm.expectRevert(); // SafeERC20 wraps the allowance revert
        pay.pay(LINK_ID, recipient, AMOUNT);

        // No funds moved
        assertEq(usdc.balanceOf(payer),     AMOUNT, "payer balance unchanged");
        assertEq(usdc.balanceOf(recipient), 0,      "recipient balance unchanged");
        // paid flag NOT set
        assertFalse(pay.paid(ref), "paid should remain false");
    }

    // -----------------------------------------------------------------------
    // Case 6b — Revert: insufficient balance — no funds move, paid[ref] stays false.
    // -----------------------------------------------------------------------

    function test_Pay_RevertsWithInsufficientBalance() public {
        // Approve more than balance
        uint256 smallBalance = AMOUNT / 2;
        usdc.mint(payer, smallBalance);
        vm.prank(payer);
        usdc.approve(address(pay), AMOUNT); // approval exceeds balance

        bytes32 ref = pay.refFor(LINK_ID, recipient, AMOUNT);

        vm.prank(payer);
        vm.expectRevert(); // SafeERC20 wraps the balance revert
        pay.pay(LINK_ID, recipient, AMOUNT);

        // No funds moved
        assertEq(usdc.balanceOf(payer),     smallBalance, "payer balance unchanged");
        assertEq(usdc.balanceOf(recipient), 0,            "recipient balance unchanged");
        // paid flag NOT set (CEI: paid is set BEFORE transfer, but transfer reverts the whole tx)
        assertFalse(pay.paid(ref), "paid should remain false");
    }

    // -----------------------------------------------------------------------
    // Case 8 — Fuzz: (uint256 amount, address recipient_)
    // -----------------------------------------------------------------------

    function testFuzz_Pay_SucceedsAndBalancesCorrect(uint256 amount, address recipient_) public {
        // --- bound inputs ---
        amount     = bound(amount, 1, type(uint128).max); // reasonable upper cap
        vm.assume(recipient_ != address(0));
        vm.assume(recipient_ != address(pay));

        _fund(payer, amount);

        vm.prank(payer);
        bytes32 ref = pay.pay(LINK_ID, recipient_, amount);

        // Balance checks
        assertEq(usdc.balanceOf(recipient_),    amount, "recipient received amount");
        assertEq(usdc.balanceOf(payer),         0,      "payer fully debited");
        assertEq(usdc.balanceOf(address(pay)),  0,      "contract holds nothing");

        // State check
        assertTrue(pay.paid(ref), "paid flag set");

        // Returned ref matches independently computed ref
        bytes32 expected = pay.refFor(LINK_ID, recipient_, amount);
        assertEq(ref, expected, "ref matches refFor");
    }
}
