/**
 * Server-side on-chain payment verifier.
 *
 * Checks performed before any DB write (all values come from the DB, not the browser):
 *   1. Transaction hash format.
 *   2. Fetch receipt with retries (up to 30 s) on the chain stored with the link.
 *   3. receipt.status === 'success'.
 *   4. Block timestamp > link.created_at — rejects pre-existing or replayed txs.
 *   5. Transfer log from canonical USDC contract: to === link.to_addr,
 *      value >= expectedAmountRaw (6-decimal bigint).
 *   6. Returns { ok: true, paidBy } — paidBy is the log's `from`, never the browser's claim.
 *
 * Chain constants come from resolveChainFacts(chainId) in chain-facts.ts,
 * which reads from the onchain-facts registry and the Arc Studio RPC proxy env vars.
 * No onchain literal appears in this file.
 */

import { createPublicClient, http, parseAbiItem, decodeEventLog } from 'viem';
import { resolveChainFacts } from './chain-facts';
import { arcLinkPayFor } from '../src/contract';
import { checkContractPayment } from './contract-check';

// Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

// ── Types ─────────────────────────────────────────────────────────────────────
export type VerifyResult =
  | { ok: true;  paidBy: string }
  | { ok: false; reason: string };

// ── Client cache (one client per chain ID, created on first use) ──────────────
const clientCache = new Map<number, ReturnType<typeof createPublicClient>>();

function getClient(chainId: number): ReturnType<typeof createPublicClient> {
  const cached = clientCache.get(chainId);
  if (cached) return cached;
  const facts = resolveChainFacts(chainId);
  const client = createPublicClient({
    chain: facts.viemChain as Parameters<typeof createPublicClient>[0]['chain'],
    transport: http(facts.rpcUrl, { timeout: 10_000 }),
  });
  clientCache.set(chainId, client);
  return client;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a decimal USDC string (e.g. "5.00") into raw bigint units.
 * Decimal count comes from the chain's USDC fact in the registry.
 */
function parseUsdcAmount(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid amount format: "${amount}"`);
  }
  const [whole = '0', frac = ''] = trimmed.split('.');
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fracPadded);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch transaction receipt with exponential back-off, up to 30 s total.
 */
async function fetchReceiptWithRetry(chainId: number, txHash: `0x${string}`) {
  const TIMEOUT_MS   = 30_000;
  const INITIAL_WAIT =  2_000;
  const MAX_WAIT     =  8_000;

  const deadline = Date.now() + TIMEOUT_MS;
  let waitMs = INITIAL_WAIT;

  while (Date.now() < deadline) {
    try {
      const receipt = await getClient(chainId).getTransactionReceipt({ hash: txHash });
      if (receipt) return receipt;
    } catch {
      // Not confirmed yet — retry
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(waitMs, remaining));
    waitMs = Math.min(waitMs * 1.5, MAX_WAIT);
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param txHash      Browser-submitted hash (validated before trusting).
 * @param chainId     The chain stored on the link in the DB (trusted).
 * @param toAddr      The link's to_addr from the DB (trusted).
 * @param amountStr   The link's amount from the DB e.g. "5.00" (trusted).
 * @param createdAtMs The link's created_at timestamp in milliseconds (trusted, from DB).
 *                    The block containing the tx must have a timestamp AFTER this.
 * @param linkId      The link's id from the DB (part of the ArcLinkPay record key).
 */
export async function verifyPayment(
  txHash:      string,
  chainId:     number,
  toAddr:      string,
  amountStr:   string,
  createdAtMs: number,
  linkId:      string,
): Promise<VerifyResult> {

  // 1. Hash format guard
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return { ok: false, reason: 'Invalid transaction hash format.' };
  }

  // Resolve chain facts once (throws if chain/USDC unknown — caller catches as 502)
  const facts = resolveChainFacts(chainId);

  // 2. Fetch receipt with retries
  const receipt = await fetchReceiptWithRetry(chainId, txHash as `0x${string}`);
  if (!receipt) {
    return {
      ok: false,
      reason: `Transaction not found on ${facts.name} (chain ${chainId}) after 30 seconds. ` +
              'It may not have been broadcast or may still be pending.',
    };
  }

  // 3. Require success status
  if (receipt.status !== 'success') {
    return {
      ok: false,
      reason: `Transaction was reverted on ${facts.name} (status: "${receipt.status}"). No funds were transferred.`,
    };
  }

  // 4. Block timestamp must be after the link's created_at
  //    Fetch the block to get its timestamp (bigint, in seconds).
  let blockTimestampSec: bigint;
  try {
    const block = await getClient(chainId).getBlock({ blockNumber: receipt.blockNumber });
    blockTimestampSec = block.timestamp;
  } catch {
    return {
      ok: false,
      reason: 'Could not fetch the block to verify its timestamp. Try again shortly.',
    };
  }

  const createdAtSec = BigInt(Math.floor(createdAtMs / 1000));
  if (blockTimestampSec <= createdAtSec) {
    return {
      ok: false,
      reason:
        `Transaction was mined at block timestamp ${blockTimestampSec}s, ` +
        `but this payment link was created at ${createdAtSec}s. ` +
        'Pre-existing or replayed transactions are not accepted.',
    };
  }

  // 5. Parse expected amount using chain-specific USDC decimals
  let expectedRaw: bigint;
  try {
    expectedRaw = parseUsdcAmount(amountStr, facts.usdcDecimals);
  } catch (e) {
    return {
      ok: false,
      reason: `Link has an unparseable amount in the database: ${String(e)}`,
    };
  }

  // 5b. If ArcLinkPay is deployed on this chain, the payment MUST have gone
  //     through it: a LinkPaid event for exactly this link, recipient and amount.
  const payContract = arcLinkPayFor(chainId);
  if (payContract) {
    const r = checkContractPayment({
      logs:      receipt.logs,
      contract:  payContract,
      usdc:      facts.usdcAddress,
      linkId,
      recipient: toAddr,
      amountRaw: expectedRaw,
    });
    return r.ok ? { ok: true, paidBy: r.paidBy } : { ok: false, reason: r.reason };
  }

  const recipientLower = toAddr.toLowerCase();

  // 6. Scan logs for a Transfer from the canonical USDC contract
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== facts.usdcAddress) continue;

    let decoded: { eventName: string; args: { from: string; to: string; value: bigint } };
    try {
      decoded = decodeEventLog({
        abi:    [TRANSFER_EVENT],
        data:   log.data,
        topics: log.topics,
      }) as typeof decoded;
    } catch {
      continue; // not a Transfer event
    }

    if (decoded.eventName !== 'Transfer') continue;

    const { from, to, value } = decoded.args;

    if (to.toLowerCase() !== recipientLower) continue;

    if (value < expectedRaw) {
      return {
        ok: false,
        reason:
          `Transfer amount insufficient: received ${value} raw units, ` +
          `expected at least ${expectedRaw} (${amountStr} USDC, ${facts.usdcDecimals} decimals, on ${facts.name}).`,
      };
    }

    // All checks passed
    return { ok: true, paidBy: from.toLowerCase() };
  }

  return {
    ok: false,
    reason:
      `No USDC Transfer to ${toAddr} found in transaction ${txHash} on ${facts.name}. ` +
      'The payment may have gone to a different address or the USDC contract may differ.',
  };
}
