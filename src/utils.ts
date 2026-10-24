import type { LinkParams } from './types';

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Parse the hash query string from the current URL.
 * Supports both:
 *   #?a=...   (hash-based params, used for shareable pay links)
 *   ?a=...    (search params, used for receipt navigation within the app)
 */
function getHashParams(): URLSearchParams {
  const hash = window.location.hash; // e.g. "#?a=250&r=0x..."
  if (hash.startsWith('#?')) {
    return new URLSearchParams(hash.slice(2));
  }
  return new URLSearchParams('');
}

function getSearchParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

/**
 * Build a shareable pay URL using the hash fragment so it works without a
 * server (static hosting, Arc Studio preview, downloaded zip).
 * Format: https://host/path#?a=amount&d=description&r=recipient&n=clientName&id=linkId
 */
export function buildPayUrl(params: LinkParams): string {
  if (!params.amount || !params.to || !params.linkId) {
    throw new Error('buildPayUrl: missing required params');
  }
  const base = `${window.location.origin}${window.location.pathname}`;
  const p = new URLSearchParams({
    a: params.amount,
    d: params.description ?? '',
    r: params.to,
    n: '', // client name is private to the creator — never put it in a shareable URL
    id: params.linkId,
  });
  return `${base}#?${p.toString()}`;
}

/**
 * Parse link params from the URL hash fragment.
 * Returns null if the URL is not a pay link.
 */
export function parseLinkParamsFromUrl(): LinkParams | null {
  const p = getHashParams();
  const a = p.get('a');
  const r = p.get('r');
  const id = p.get('id');
  // All three are required for a valid pay link
  if (!a || !r || !id) return null;
  // Must not also have a tx= (that's a receipt, not a pay page)
  if (p.get('tx')) return null;
  return {
    amount: a,
    description: p.get('d') ?? '',
    to: r,
    clientName: p.get('n') ?? '',
    linkId: id,
  };
}

/**
 * Parse receipt params from the URL.
 * Receipts are stored in search params (not hash) because they're
 * internal navigations within the same app session.
 */
export function parseReceiptFromUrl(): {
  params: LinkParams;
  txHash: string;
  paidBy: string;
} | null {
  const p = getSearchParams();
  const tx = p.get('tx');
  const a = p.get('a');
  const r = p.get('r');
  if (!tx || !a || !r) return null;
  return {
    txHash: tx,
    paidBy: p.get('from') ?? '',
    params: {
      amount: a,
      description: p.get('d') ?? '',
      to: r,
      clientName: p.get('n') ?? '',
      linkId: p.get('id') ?? '',
    },
  };
}

export function parseOnchainError(error: unknown): string {
  const message = (error as { message?: string })?.message?.toLowerCase() ?? '';
  if (message.includes('user rejected') || (error as { code?: number })?.code === 4001) {
    return 'Transaction cancelled.';
  }
  if (message.includes('insufficient funds') || message.includes('exceeds balance')) {
    return 'Insufficient USDC balance. Add funds and try again.';
  }
  if (message.includes('reverted')) {
    const m = message.match(/reason="([^"]+)"/);
    return m ? `Transaction failed: ${m[1]}` : 'Transaction failed. Please try again.';
  }
  if (message.includes('network') || message.includes('timeout')) {
    return 'Network error. Check your connection and retry.';
  }
  return 'Something went wrong. Please try again.';
}
