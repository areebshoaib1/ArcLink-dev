/**
 * Which side of the payment is the person looking at the receipt?
 * The blockchain only knows wallet addresses, so the role is decided by
 * comparing the CONNECTED wallet with the recipient and the sender of the tx.
 */
export type ReceiptRole = 'recipient' | 'payer' | 'both' | 'other';

export function receiptRole(
  connected: string | undefined,
  recipient: string,
  payer: string,
): ReceiptRole {
  const me = connected?.toLowerCase();
  if (!me) return 'other';
  const isRecipient = me === recipient.toLowerCase();
  const isPayer = payer !== '' && me === payer.toLowerCase();
  if (isRecipient && isPayer) return 'both';
  if (isRecipient) return 'recipient';
  if (isPayer) return 'payer';
  return 'other';
}
