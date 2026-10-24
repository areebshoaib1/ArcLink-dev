/**
 * ArcLink server-side wallet authentication.
 *
 * The browser sends:  X-ArcLink-Auth: <address>.<issuedAtMs>.<signature>
 * where signature = personal_sign over buildSignInMessage(address, issuedAtMs).
 *
 * authenticate() recovers the signer from the signature and returns the
 * lowercase address ONLY if it matches the claimed address and the signature
 * is fresh. Routes then compare that address with the resource being asked for.
 *
 * IMPORTANT: buildSignInMessage() must stay identical to the copy in
 * src/auth.ts, otherwise every signature will be rejected.
 *
 * Limits: verifies normal wallets (MetaMask, OKX, Coinbase EOA). Smart-contract
 * wallets (Safe etc.) cannot be verified this way.
 */
import { verifyMessage } from 'viem';

const MAX_AGE_MS = 12 * 60 * 60 * 1000;      // sign-in valid for 12 hours
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;    // tolerate 5 min of clock drift

export function buildSignInMessage(address: string, issuedAt: number): string {
  return [
    'ArcLink sign-in',
    '',
    'Sign this message to prove you own this wallet.',
    'It is free and does not send a transaction.',
    '',
    `Address: ${address.toLowerCase()}`,
    `Issued: ${issuedAt}`,
  ].join('\n');
}

/** Returns the verified lowercase wallet address, or null if missing/invalid/expired. */
export async function authenticate(req: Request): Promise<string | null> {
  const header = req.headers.get('x-arclink-auth');
  if (!header) return null;

  const parts = header.split('.');
  if (parts.length !== 3) return null;
  const [addr, issuedStr, sig] = parts as [string, string, string];

  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return null;
  if (!/^\d{10,16}$/.test(issuedStr)) return null;
  if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) return null; // 65-byte wallet signature

  const issuedAt = Number(issuedStr);
  const now = Date.now();
  if (now - issuedAt > MAX_AGE_MS) return null;
  if (issuedAt - now > MAX_FUTURE_SKEW_MS) return null;

  try {
    const ok = await verifyMessage({
      address: addr as `0x${string}`,
      message: buildSignInMessage(addr, issuedAt),
      signature: sig as `0x${string}`,
    });
    return ok ? addr.toLowerCase() : null;
  } catch {
    return null;
  }
}