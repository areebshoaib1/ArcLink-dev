import { useState, useEffect } from 'react';
import { Zap, Globe, DollarSign, Info } from 'lucide-react';
import { ConnectKitButton } from 'connectkit';
import { useAccount } from 'wagmi';
import { ArcLogoMark } from './ArcLogo';
import { useSession } from '../auth';
import type { AppView } from '../types';

const FULL_TEXT = 'Get paid in USDC instantly';
const TYPING_SPEED_MS = 48;

interface Props {
  onNavigate: (view: AppView) => void;
}

export default function Landing({ onNavigate }: Props) {
  const { address, isConnected } = useAccount();
  const { signedIn, signIn, signing, error: signError } = useSession();
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  const walletReady = isConnected && Boolean(address);

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setDisplayed(FULL_TEXT.slice(0, i));

      if (i >= FULL_TEXT.length) {
        clearInterval(id);
        setDone(true);
      }
    }, TYPING_SPEED_MS);

    return () => clearInterval(id);
  }, []);

  // A connected wallet is not enough: the user must also sign the free
  // sign-in message. The server checks that signature on private requests.
  async function ensureSignedIn(): Promise<boolean> {
    if (!walletReady) return false;
    return signedIn || (await signIn());
  }

  async function handleCreateLink() {
    if (await ensureSignedIn()) onNavigate({ name: 'create' });
  }

  async function handleDashboard() {
    if (await ensureSignedIn()) onNavigate({ name: 'dashboard' });
  }

  return (
    <div
      className="mobile-frame flex flex-col"
      style={{
        paddingLeft: 'var(--px)',
        paddingRight: 'var(--px)',
      }}
    >
      {/* Logo + wordmark */}
      <div className="flex flex-col items-center pt-14">
        <ArcLogoMark size={72} />
        <h1
          className="mt-4 text-3xl font-bold"
          style={{ color: 'var(--navy)', letterSpacing: '-0.02em' }}
        >
          ArcLink
        </h1>
        <div
          className="mt-3 rounded-full px-4 py-1.5 text-sm"
          style={{ background: '#eef3fc', color: 'var(--text-secondary)' }}
        >
          USDC payment links on the{' '}
          <span style={{ color: 'var(--navy)', fontWeight: 600 }}>Arc</span>
          {' '}network
        </div>
      </div>

      {/* Hero */}
      <div className="mt-12">
        <h2
          className="text-4xl font-extrabold leading-tight"
          style={{
            color: 'var(--text-primary)',
            minHeight: '5rem',
            letterSpacing: '-0.025em',
          }}
          aria-label={FULL_TEXT}
        >
          {displayed}
          {!done && <span className="cursor-blink" aria-hidden="true" />}
        </h2>
        <p
          className="mt-4 text-base leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          Get paid in seconds, not days. No banks, no wires, no 8% fees eating your income.
        </p>
      </div>

      <div className="flex-1" />

      {/* Wallet connection and actions */}
      <div className="pb-8 space-y-3">
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button
              type="button"
              className="btn-primary"
              onClick={show}
            >
              {walletReady ? 'Wallet Connected' : 'Connect Wallet'}
            </button>
          )}
        </ConnectKitButton.Custom>

        {signing && (
          <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            Confirm in your wallet…
          </p>
        )}

        <button
          type="button"
          className="btn-primary flex items-center justify-center gap-2"
          onClick={() => { void handleCreateLink(); }}
          disabled={!walletReady || signing}
          style={!walletReady || signing ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
        >
          Create payment link
        </button>

        <button
          type="button"
          className="btn-outline"
          onClick={() => { void handleDashboard(); }}
          disabled={!walletReady || signing}
          style={!walletReady || signing ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
        >
          View my dashboard
        </button>

        <p
          className="text-center text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          {signError ??
            (walletReady
              ? signedIn
                ? 'Wallet connected and signed in.'
                : 'Wallet connected. You will be asked to sign a free message to continue.'
              : 'Connect your wallet to create payment links and access your dashboard.')}
        </p>
      </div>

            {/* Independence notice — highlighted and centred, just under the buttons */}
      <div
        className="mx-auto mb-6 mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-center"
        style={{ background: '#f0fdfa', border: '1px solid #99f6e4', color: '#0f766e' }}
        role="note"
      >
        <Info className="size-4 shrink-0" aria-hidden="true" />
        <p className="text-sm font-semibold leading-snug">
          ArcLink is an independent project. It is not affiliated with or endorsed by Circle or Arc.
        </p>
      </div>

      {/* Feature bar */}
      <div
        className="border-t pb-8 pt-6"
        style={{
          borderColor: 'var(--border)',
          marginLeft: 'calc(-1 * var(--px))',
          marginRight: 'calc(-1 * var(--px))',
          paddingLeft: 'var(--px)',
          paddingRight: 'var(--px)',
        }}
      >
        <div className="grid grid-cols-3 gap-2 text-center">
          <FeatureItem icon={<Zap className="size-5" />} label="Instant Settlement" />
          <FeatureItem icon={<Globe className="size-5" />} label="Global Reach" />
          <FeatureItem icon={<DollarSign className="size-5" />} label="Minimal Fees" />
        </div>
      </div>
    </div>
  );
}

function FeatureItem({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex size-10 items-center justify-center rounded-full"
        style={{ background: 'var(--navy)', color: '#fff' }}
      >
        {icon}
      </div>
      <span
        className="text-xs font-bold leading-tight"
        style={{ color: 'var(--navy)' }}
      >
        {label}
      </span>
    </div>
  );
}
