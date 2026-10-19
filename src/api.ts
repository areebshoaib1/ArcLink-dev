/**
 * ArcLink API client.
 * All requests go to /api/* which Vite proxies to the backend on port 3001.
 * This is the single cross-device data source — localStorage is only used
 * for the payer's optional sent-payment history.
 */

export interface ApiLink {
  id: string;
  chainId: number;
  to: string;
  amount: string;
  description: string;
  clientName: string;
  createdAt: number;
  txHash?: string;
  paidBy?: string;
  paidAt?: number;
  verified: boolean;
}

/**
 * Thrown by apiMarkPaid when the server returns 409 (already paid).
 * `original` is the first verified payment record.
 */
export class DuplicatePaymentError extends Error {
  constructor(public readonly original: ApiLink) {
    super('This link has already been paid.');
    this.name = 'DuplicatePaymentError';
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  return res;
}

/** Create a payment link record in the shared database. */
export async function apiCreateLink(link: {
  id: string;
  to: string;
  amount: string;
  description: string;
  clientName: string;
  chainId: number;
}): Promise<void> {
  const res = await apiFetch('/links', { method: 'POST', body: JSON.stringify(link) });
  if (!res.ok) throw new Error(`Failed to create link: ${res.status}`);
}

/**
 * Fetch a single link by ID.
 * Returns null when the link is not found (404).
 * Throws on network error or other server error — caller should treat as "status unknown".
 */
export async function apiGetLink(id: string): Promise<ApiLink | null> {
  const res = await apiFetch(`/links/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch link: ${res.status}`);
  return res.json() as Promise<ApiLink>;
}

/** Fetch all links created by a recipient wallet address. */
export async function apiGetLinksByAddress(address: string): Promise<ApiLink[]> {
  const res = await apiFetch(`/links/by/${encodeURIComponent(address.toLowerCase())}`);
  if (!res.ok) throw new Error(`Failed to fetch links: ${res.status}`);
  return res.json() as Promise<ApiLink[]>;
}

/**
 * Mark a link as paid.
 * Only call this AFTER client-side on-chain Transfer log verification passes.
 *
 * - 200: first payment recorded — returns the updated link.
 * - 409: link was already paid by someone else — throws DuplicatePaymentError.
 * - Other errors: throws a plain Error.
 */
export async function apiMarkPaid(
  id: string,
  txHash: string,
): Promise<ApiLink> {
  // paidBy is intentionally omitted — the server derives it from the Transfer log.
  const res = await apiFetch(`/links/${encodeURIComponent(id)}/paid`, {
    method: 'POST',
    body: JSON.stringify({ txHash }),
  });

  if (res.status === 409) {
    const body = await res.json() as { original?: ApiLink };
    // original is the first verified payment record
    const original = body.original ?? ({ id, verified: true } as ApiLink);
    throw new DuplicatePaymentError(original);
  }

  if (!res.ok) throw new Error(`Failed to mark paid: ${res.status}`);
  return res.json() as Promise<ApiLink>;
}
