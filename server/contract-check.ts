/**
 * Checks that a transaction's logs prove a payment through ArcLinkPay.
 *
 * Pure function (no network) so it can be tested directly. All "expected"
 * values come from the server's own link record, never from the browser.
 *
 * A payment counts only if ALL of these hold:
 *   1. the ArcLinkPay contract itself emitted LinkPaid (only it can emit it),
 *   2. the event's ref equals keccak256(abi.encode(linkId, recipient, amount))
 *      computed here from the link record,
 *   3. the event's recipient and amount equal the link's recipient and amount,
 *   4. the canonical USDC contract emitted Transfer(payer -> recipient, amount)
 *      in the same transaction.
 */

import { decodeEventLog, parseAbiItem } from 'viem';
import { ARCLINKPAY_ABI, linkRef } from '../src/contract';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

export interface RawLog {
  address: string;
  data: `0x${string}`;
  topics: readonly `0x${string}`[];
}

export type ContractCheck =
  | { ok: true; paidBy: string }
  | { ok: false; reason: string };

export interface ContractCheckInput {
  logs: readonly RawLog[];
  contract: string;     // ArcLinkPay address for this chain
  usdc: string;         // canonical USDC address for this chain
  linkId: string;       // from the DB
  recipient: string;    // link.to_addr from the DB
  amountRaw: bigint;    // link.amount in raw USDC units
}

export function checkContractPayment(i: ContractCheckInput): ContractCheck {
  const contract = i.contract.toLowerCase();
  const usdc = i.usdc.toLowerCase();
  const recipient = i.recipient.toLowerCase();
  const expectedRef = linkRef(i.linkId, i.recipient, i.amountRaw);

  let payer: string | null = null;

  for (const log of i.logs) {
    if (log.address.toLowerCase() !== contract) continue;
    let ev;
    try {
      ev = decodeEventLog({ abi: ARCLINKPAY_ABI, data: log.data, topics: [...log.topics] as [`0x${string}`, ...`0x${string}`[]] });
    } catch {
      continue; // not a LinkPaid event of the expected layout
    }
    if (ev.eventName !== 'LinkPaid') continue;
    const a = ev.args;
    if (a.ref.toLowerCase() !== expectedRef.toLowerCase()) continue;
    if (a.recipient.toLowerCase() !== recipient) continue;
    if (a.amount !== i.amountRaw) continue;
    payer = a.payer.toLowerCase();
    break;
  }

  if (!payer) {
    return {
      ok: false,
      reason:
        'No matching ArcLinkPay payment was found in this transaction. ' +
        'The link id, recipient or amount may differ, or the transaction did not go through the ArcLink contract.',
    };
  }

  for (const log of i.logs) {
    if (log.address.toLowerCase() !== usdc) continue;
    try {
      const d = decodeEventLog({ abi: [TRANSFER_EVENT], data: log.data, topics: [...log.topics] as [`0x${string}`, ...`0x${string}`[]] });
      if (d.eventName !== 'Transfer') continue;
      const { from, to, value } = d.args;
      if (from.toLowerCase() === payer && to.toLowerCase() === recipient && value === i.amountRaw) {
        return { ok: true, paidBy: payer };
      }
    } catch { /* not a Transfer */ }
  }

  return {
    ok: false,
    reason: 'The USDC transfer for this payment was not found in the transaction.',
  };
}
