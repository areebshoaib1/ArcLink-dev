// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ArcLinkPay
/// @notice Non-custodial single-use USDC payment links.
/// @dev This contract never custody-holds USDC: funds move directly from payer to recipient.
contract ArcLinkPay {
    using SafeERC20 for IERC20;

    /// @notice Emitted when a link payment is successfully executed.
    /// @param ref Deterministic payment reference derived from linkId, recipient, and amount.
    /// @param payer Address that paid USDC.
    /// @param recipient Address that received USDC.
    /// @param amount Amount of USDC transferred.
    /// @param linkId Human-readable link identifier used in the payment reference.
    event LinkPaid(
        bytes32 indexed ref,
        address indexed payer,
        address indexed recipient,
        uint256 amount,
        string linkId
    );

    /// @notice Reverts when the token address provided to the constructor is zero.
    error ZeroToken();

    /// @notice Reverts when a linkId is empty or exceeds the maximum allowed length.
    error InvalidLinkId();

    /// @notice Reverts when the payment amount is zero.
    error ZeroAmount();

    /// @notice Reverts when recipient is zero address or this contract address.
    error InvalidRecipient();

    /// @notice Reverts when a payment reference has already been used.
    /// @param ref The duplicate payment reference.
    error AlreadyPaid(bytes32 ref);

    /// @notice Maximum allowed byte length for a link identifier.
    uint256 public constant MAX_LINK_ID_LENGTH = 64;

    /// @notice USDC token used for all payments.
    IERC20 public immutable usdc;

    /// @notice Tracks whether a deterministic payment reference has already been consumed.
    mapping(bytes32 => bool) public paid;

    /// @notice Initializes the contract with the USDC token address.
    /// @param usdc_ Address of the USDC ERC20 token contract.
    constructor(IERC20 usdc_) {
        if (address(usdc_) == address(0)) revert ZeroToken();
        usdc = usdc_;
    }

    /// @notice Computes the deterministic payment reference for a link payment.
    /// @param linkId Link identifier.
    /// @param recipient Recipient address.
    /// @param amount Payment amount.
    /// @return Deterministic reference hash: keccak256(abi.encode(linkId, recipient, amount)).
    function refFor(
        string calldata linkId,
        address recipient,
        uint256 amount
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(linkId, recipient, amount));
    }

    /// @notice Executes a single-use USDC payment link from caller to recipient.
    /// @dev Uses checks-effects-interactions by marking `paid[ref] = true` before token transfer.
    /// @param linkId Link identifier for this payment.
    /// @param recipient Recipient that receives the USDC directly from the payer.
    /// @param amount Amount of USDC to transfer.
    /// @return ref Deterministic payment reference.
    function pay(
        string calldata linkId,
        address recipient,
        uint256 amount
    ) external returns (bytes32 ref) {
        uint256 linkLength = bytes(linkId).length;
        if (linkLength == 0 || linkLength > MAX_LINK_ID_LENGTH) revert InvalidLinkId();
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();

        ref = refFor(linkId, recipient, amount);
        if (paid[ref]) revert AlreadyPaid(ref);

        paid[ref] = true;
        usdc.safeTransferFrom(msg.sender, recipient, amount);

        emit LinkPaid(ref, msg.sender, recipient, amount, linkId);
    }
}
