/**
 * Network constants shared between the frontend and the backend server.
 *
 * This file MUST NOT import anything that references browser globals
 * (window, document, navigator) — it runs in both Bun (server) and the browser.
 *
 * THE ONLY LINE TO CHANGE WHEN SWITCHING NETWORKS:
 *   Set ARC_ACTIVE_CHAIN_ID to ARC_MAINNET_CHAIN_ID for production.
 */

export const ARC_TESTNET_CHAIN_ID = 5042002;
export const ARC_MAINNET_CHAIN_ID = 5042;

// ▼▼▼  Switch here to go to mainnet  ▼▼▼
export const ARC_ACTIVE_CHAIN_ID: number = ARC_TESTNET_CHAIN_ID;
// ▲▲▲  Change to ARC_MAINNET_CHAIN_ID for production  ▲▲▲
