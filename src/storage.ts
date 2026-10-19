import type { PaymentLink, SentPayment } from './types';

const LINKS_KEY = 'arclink_links_v3';
const SENT_KEY = 'arclink_sent_v1';

// ── Received links (creator's device) ─────────────────────────────────────

export function loadLinks(): PaymentLink[] {
  try {
    const raw = localStorage.getItem(LINKS_KEY);
    return raw ? (JSON.parse(raw) as PaymentLink[]) : [];
  } catch {
    return [];
  }
}

function saveLinks(links: PaymentLink[]): void {
  localStorage.setItem(LINKS_KEY, JSON.stringify(links));
}

export function upsertLink(link: PaymentLink): void {
  const links = loadLinks();
  const idx = links.findIndex((l) => l.id === link.id);
  if (idx >= 0) links[idx] = link;
  else links.unshift(link);
  saveLinks(links);
}

export function getLink(id: string): PaymentLink | undefined {
  return loadLinks().find((l) => l.id === id);
}

/**
 * Mark a link as paid. Only call this AFTER on-chain Transfer log verification
 * has confirmed the correct amount reached the correct recipient.
 */
export function markLinkPaid(id: string, txHash: string, paidBy: string): void {
  const links = loadLinks();
  const link = links.find((l) => l.id === id);
  if (link) {
    link.txHash = txHash;
    link.paidAt = Date.now();
    link.paidBy = paidBy;
    link.verified = true;
    saveLinks(links);
  }
}

// ── Sent payments (payer's device — opt-in only) ───────────────────────────

export function loadSentPayments(): SentPayment[] {
  try {
    const raw = localStorage.getItem(SENT_KEY);
    return raw ? (JSON.parse(raw) as SentPayment[]) : [];
  } catch {
    return [];
  }
}

function saveSentPayments(payments: SentPayment[]): void {
  localStorage.setItem(SENT_KEY, JSON.stringify(payments));
}

export function addSentPayment(payment: SentPayment): void {
  const payments = loadSentPayments();
  payments.unshift(payment);
  saveSentPayments(payments);
}
