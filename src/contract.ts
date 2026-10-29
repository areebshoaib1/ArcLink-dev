/**
 * ArcLinkPay — the payment contract this app pays through.
 *
 * Shared by the browser and the Bun server, so it must not import anything
 * that touches browser globals.
 *
 * pay(linkId, recipient, amount) moves USDC straight from the payer to the
 * recipient and emits LinkPaid. Each (linkId, recipient, amount) can be paid
 * once. The record key is:
 *     ref = keccak256(abi.encode(linkId, recipient, amount))
 *
 * To use a different deployment, change the address for that chain below.
 * A chain with no address here falls back to a plain USDC transfer.
 */

import { encodeAbiParameters, getAddress, keccak256 } from 'viem';
import { ARC_MAINNET_CHAIN_ID, ARC_TESTNET_CHAIN_ID } from './network';

/** Deployed ArcLinkPay contracts, by chain id. */
const ADDRESSES: Record<number, string | undefined> = {
  // Arc Testnet — deployed from Arc Studio on Oct 29, 2026
  [ARC_TESTNET_CHAIN_ID]: '0x79c35c69390454155b5e6127c17839433f5c267a',
  // Arc mainnet — deployed Oct 30, 2026 (deploy tx 0xdca1f06ae3b8d5d2d8304dca229ce47a742a936217cb60e7fa276ae68221bf91)
  [ARC_MAINNET_CHAIN_ID]: '0x4e576747FE8846D6F49600c41d5aA2f5aFd5E6EE',
};

/** The ArcLinkPay address on a chain, or undefined when none is deployed there. */
export function arcLinkPayFor(chainId: number): `0x${string}` | undefined {
  const a = ADDRESSES[chainId];
  return a ? getAddress(a) : undefined;
}

export const ARCLINKPAY_ABI = [
  {
    type: 'function',
    name: 'pay',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'linkId', type: 'string' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'ref', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'refFor',
    stateMutability: 'pure',
    inputs: [
      { name: 'linkId', type: 'string' },
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'paid',
    stateMutability: 'view',
    inputs: [{ name: 'ref', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'usdc',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'MAX_LINK_ID_LENGTH',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'LinkPaid',
    inputs: [
      { name: 'ref', type: 'bytes32', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'linkId', type: 'string', indexed: false },
    ],
  },
  { type: 'error', name: 'AlreadyPaid', inputs: [{ name: 'ref', type: 'bytes32' }] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
  { type: 'error', name: 'InvalidRecipient', inputs: [] },
  { type: 'error', name: 'InvalidLinkId', inputs: [] },
  { type: 'error', name: 'ZeroToken', inputs: [] },
] as const;

/** The key the contract records a payment under (same as the contract's refFor). */
export function linkRef(linkId: string, recipient: string, amountRaw: bigint): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'string' }, { type: 'address' }, { type: 'uint256' }],
      [linkId, recipient as `0x${string}`, amountRaw],
    ),
  );
}
