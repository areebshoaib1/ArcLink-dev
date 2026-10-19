/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  SINGLE NETWORK SWITCH — change ONE line to go to        ║
 * ║  mainnet:   ARC_ACTIVE_CHAIN_ID = ARC_MAINNET_ID         ║
 * ║  testnet:   ARC_ACTIVE_CHAIN_ID = ARC_TESTNET_ID  ← now  ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * Every value the frontend and backend need (chain name, RPC URL, USDC
 * address, USDC decimals, explorer base) is derived from this one constant
 * via the onchain-facts registry. Nothing is hard-coded elsewhere.
 *
 * The backend imports ACTIVE_CHAIN_ID from this module via a relative path
 * so it shares the same value — server/chain-facts.ts re-exports it here.
 */

import { http, createConfig } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { arcTestnet } from 'viem/chains';
import { injected } from 'wagmi/connectors';
import { registerChain } from './tracing';
import { requireChain, getUsdc } from '@/onchain-facts';

// ── Chain IDs — imported from network.ts (no browser deps, shared with server) ─
export {
  ARC_ACTIVE_CHAIN_ID,
  ARC_TESTNET_CHAIN_ID,
  ARC_MAINNET_CHAIN_ID,
} from './network';

import { ARC_ACTIVE_CHAIN_ID, ARC_TESTNET_CHAIN_ID, ARC_MAINNET_CHAIN_ID } from './network';

const ARC_TESTNET_ID = ARC_TESTNET_CHAIN_ID;
const ARC_MAINNET_ID = ARC_MAINNET_CHAIN_ID;

// ── Derived facts (all from registry, none hard-coded) ────────────────────────
export const ACTIVE_CHAIN_FACT = requireChain(ARC_ACTIVE_CHAIN_ID);
export const ACTIVE_USDC_FACT = (() => {
  const u = getUsdc(ARC_ACTIVE_CHAIN_ID);
  if (!u) throw new Error(`No USDC for chain ${ARC_ACTIVE_CHAIN_ID}`);
  return u;
})();

/** Human-readable chain name, e.g. "Arc Testnet" or "Arc". Follows the active chain. */
export const ACTIVE_CHAIN_NAME = ACTIVE_CHAIN_FACT.name;
/** Block-explorer base URL for the active chain. */
export const ACTIVE_EXPLORER_BASE = ACTIVE_CHAIN_FACT.explorerBase;
/** ERC-20 USDC contract address on the active chain (checksummed). */
export const ACTIVE_USDC_ADDRESS = ACTIVE_USDC_FACT.address;
/** USDC ERC-20 decimal count (6 on all supported chains). */
export const ACTIVE_USDC_DECIMALS = ACTIVE_USDC_FACT.decimals;

// ── RPC facts (both chains always registered for tracing/wagmi) ───────────────
const arcTestnetFact = requireChain(ARC_TESTNET_ID);
const arcMainnetFact = requireChain(ARC_MAINNET_ID);

registerChain(ARC_TESTNET_ID, arcTestnetFact.rpcUrls[0]);
registerChain(ARC_MAINNET_ID, arcMainnetFact.rpcUrls[0]);

// Minimal viem-compatible chain object for Arc Mainnet (viem ships arcTestnet built-in)
const arcMainnetChain = {
  id: ARC_MAINNET_ID,
  name: arcMainnetFact.name,
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: arcMainnetFact.rpcUrls as [string, ...string[]] } },
  blockExplorers: { default: { name: 'ArcScan', url: arcMainnetFact.explorerBase } },
} as const;

// ── wagmi config ──────────────────────────────────────────────────────────────
export const config = createConfig({
  chains: [arcTestnet, arcMainnetChain, mainnet],
  connectors: [
  injected({ target: 'metaMask', shimDisconnect: true }),
  injected({ target: 'okxWallet', shimDisconnect: true }),
],
  transports: {
    [ARC_TESTNET_ID]: http(arcTestnetFact.rpcUrls[0]),
    [ARC_MAINNET_ID]: http(arcMainnetFact.rpcUrls[0]),
    [mainnet.id]: http(),
  },
});
