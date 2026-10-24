/**
 * ArcLink wallet sign-in (client side).
 *
 * The user signs a free, gas-less message once. The signature is sent with
 * private API requests in the `X-ArcLink-Auth` header and the SERVER verifies
 * it (see server/auth.ts). The session is kept in sessionStorage, so it ends
 * when the tab is closed, and it expires after 12 hours.
 *
 * IMPORTANT: buildSignInMessage() must stay identical to the copy in
 * server/auth.ts, otherwise every signature will be rejected.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';

const STORAGE_KEY = 'arclink.session.v1';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface Session {
  address: string;   // lowercase wallet address
  issuedAt: number;  // ms since epoch
  signature: string; // 0x…
}

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

/** Returns the saved session only if it belongs to `address` and has not expired. */
export function loadSession(address: string | undefined): Session | null {
  if (!address) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (s.address !== address.toLowerCase()) return null;
    if (Date.now() - s.issuedAt > SESSION_TTL_MS) return null;
    return s;
  } catch {
    return null; // storage blocked or corrupted — treat as signed out
  }
}

function saveSession(s: Session): void {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  catch { /* storage blocked — the session then only lives in memory */ }
}

export function clearSession(): void {
  try { sessionStorage.removeItem(STORAGE_KEY); }
  catch { /* ignore */ }
}

/** Headers to attach to a private API request (empty object when signed out). */
export function authHeader(address: string): Record<string, string> {
  const s = loadSession(address);
  return s ? { 'X-ArcLink-Auth': `${s.address}.${s.issuedAt}.${s.signature}` } : {};
}

/** React hook: current sign-in state for the connected wallet + a signIn() action. */
export function useSession() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [session, setSession] = useState<Session | null>(() => loadSession(address));
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-check whenever the connected wallet changes (switching wallets = signed out)
  useEffect(() => {
    setSession(loadSession(address));
    setError(null);
  }, [address]);

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!address) return false;
    setError(null);
    setSigning(true);
    try {
      const issuedAt = Date.now();
      const signature = await signMessageAsync({
        message: buildSignInMessage(address, issuedAt),
      });
      const s: Session = { address: address.toLowerCase(), issuedAt, signature };
      saveSession(s);
      setSession(s);
      return true;
    } catch {
      setError('Sign-in was cancelled. Please try again.');
      return false;
    } finally {
      setSigning(false);
    }
  }, [address, signMessageAsync]);

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  return { session, signedIn: session !== null, signIn, signOut, signing, error };
}