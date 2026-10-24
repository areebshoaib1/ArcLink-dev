import type { PaymentLink, SentPayment } from './types';

// ── Key helpers — all keys are scoped by lowercase wallet address ─────────────
// This prevents cross-account bleed when multiple wallets share the same browser.

function linksKey(address: string): string {
  return `arclink_links_v3_${address.toLowerCase()}`;
}

function sentKey(address: string): string {
  return `arclink_sent_v1_${address.toLowerCase()}`;
}

// ── Received links (creator's device, scoped by recipient address) ─────────────

export function loadLinks(address?: string): PaymentLink[] {
  if (!address) return [];
  try {
    const raw = localStorage.getItem(linksKey(address));
    return raw ? (JSON.parse(raw) as PaymentLink[]) : [];
  } catch {
    return [];
  }
}

function saveLinks(address: string, links: PaymentLink[]): void {
  localStorage.setItem(linksKey(address), JSON.stringify(links));
}

export function upsertLink(link: PaymentLink, address: string): void {
  const links = loadLinks(address);
  const idx = links.findIndex((l) => l.id === link.id);
  if (idx >= 0) links[idx] = link;
  else links.unshift(link);
  saveLinks(address, links);
}

export function getLink(id: string, address: string): PaymentLink | undefined {
  return loadLinks(address).find((l) => l.id === id);
}

export function markLinkPaid(id: string, txHash: string, paidBy: string, recipientAddress: string): void {
  const links = loadLinks(recipientAddress);
  const link = links.find((l) => l.id === id);
  if (link) {
    link.txHash = txHash;
    link.paidAt = Date.now();
    link.paidBy = paidBy;
    link.verified = true;
    saveLinks(recipientAddress, links);
  }
}

// ── Sent payments (payer's device — opt-in only, scoped by payer address) ─────

export function loadSentPayments(address?: string): SentPayment[] {
  if (!address) return [];
  try {
    const raw = localStorage.getItem(sentKey(address));
    return raw ? (JSON.parse(raw) as SentPayment[]) : [];
  } catch {
    return [];
  }
}

function saveSentPayments(address: string, payments: SentPayment[]): void {
  localStorage.setItem(sentKey(address), JSON.stringify(payments));
}

export function addSentPayment(payment: SentPayment, address: string): void {
  const payments = loadSentPayments(address);
  payments.unshift(payment);
  saveSentPayments(address, payments);
}
