/**
 * Chain constants for the ArcLink backend.
 *
 * The active chain ID is imported from src/config.ts — that is the ONLY place
 * the number lives. The server shares the identical value; there is no separate
 * hardcoded copy here.
 *
 * All other values (RPC URL, USDC address, USDC decimals, chain name) are
 * derived from the onchain-facts registry via relative import.
 *
 * The RPC URL prefers the Arc Studio proxy env vars so the backend and frontend
 * hit the same endpoint; it falls back to the public registry URL only when the
 * proxy is not configured or does not cover the requested chain.
 */

import { requireChain, getUsdc } from '../src/onchain-facts';

// Re-export the active chain ID from network.ts — the browser-dep-free module
// shared by both the frontend and this backend server.
export { ARC_ACTIVE_CHAIN_ID as ACTIVE_CHAIN_ID } from '../src/network';

// ── Per-chain facts (used by verify.ts for dynamic client creation) ───────────

export interface ChainFacts {
  chainId:      number;
  name:         string;
  rpcUrl:       string;   // proxy-preferred URL
  usdcAddress:  string;   // lowercase
  usdcDecimals: number;
  explorerBase: string;
  viemChain: {
    id:             number;
    name:           string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls:        { default: { http: [string] } };
  };
}

/** Chain IDs covered by the Arc Studio RPC proxy (comma-separated env var). */
function proxyCoveredChains(): Set<number> {
  const raw = process.env['RPC_PROXY_CHAINS'] ?? '';
  const ids = raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
  return new Set(ids);
}

/**
 * Build the RPC URL for a given chain ID.
 * Prefers the Arc Studio proxy when configured; falls back to the registry URL.
 */
function buildRpcUrl(chainId: number): string {
  const base  = process.env['RPC_PROXY_BASE_URL'];
  const token = process.env['RPC_PROXY_TOKEN'];
  if (base && token && proxyCoveredChains().has(chainId)) {
    return `${base}/api/rpc/${chainId}?_rpc_token=${token}`;
  }
  return requireChain(chainId).rpcUrls[0];
}

/**
 * Resolve all facts for a chain ID from the onchain-facts registry.
 * Throws if the chain is unknown or has no USDC deployment.
 */
export function resolveChainFacts(chainId: number): ChainFacts {
  const chain = requireChain(chainId);
  const usdc  = getUsdc(chainId);
  if (!usdc) throw new Error(`No USDC deployment found for chain ${chainId}.`);

  return {
    chainId,
    name:         chain.name,
    rpcUrl:       buildRpcUrl(chainId),
    usdcAddress:  usdc.address.toLowerCase(),
    usdcDecimals: usdc.decimals,
    explorerBase: chain.explorerBase,
    viemChain: {
      id:             chainId,
      name:           chain.name,
      nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
      rpcUrls:        { default: { http: [chain.rpcUrls[0]] } },
    },
  };
}
