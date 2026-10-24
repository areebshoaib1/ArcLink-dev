// A payment link created by the receiver (stored in localStorage on their device)
export interface PaymentLink {
  id: string;
  to: string;           // receiver's wallet address
  amount: string;       // e.g. "250.00"
  description: string;
  clientName: string;
  createdAt: number;
  // Set ONLY after on-chain Transfer log verification passes
  txHash?: string;
  paidAt?: number;
  paidBy?: string;      // payer wallet address
  verified?: true;      // explicit flag: Transfer log confirmed amount + recipient
}

// A payment sent by this wallet (stored in localStorage only if payer opted in)
export interface SentPayment {
  txHash: string;
  to: string;           // recipient address
  amount: string;
  description: string;
  clientName: string;   // recipient name / label
  paidAt: number;
  linkId?: string;      // lets the receipt reload the saved link (missing on old entries)
}
// Data encoded directly in the pay link URL (no backend, works on any device)
export interface LinkParams {
  amount: string;
  description: string;
  to: string;           // recipient wallet address
  clientName: string;
  linkId: string;
}

export type AppView =
  | { name: 'landing' }
  | { name: 'dashboard' }
  | { name: 'create' }
  | { name: 'pay'; params: LinkParams }
  | { name: 'receipt'; params: LinkParams; txHash: string; paidBy: string };
