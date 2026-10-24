import { useAccount } from 'wagmi';
import { isAddress } from 'viem';
import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Pencil } from 'lucide-react';
import { apiCreateLink, apiGetCreator, apiSetCreator } from '../api';
import { useSession } from '../auth';
import { ArcLogoSmall } from './ArcLogo';
import { upsertLink } from '../storage';
import { generateId, buildPayUrl } from '../utils';
import { ARC_ACTIVE_CHAIN_ID } from '../config';
import type { PaymentLink, LinkParams, AppView } from '../types';
import LinkReady from './LinkReady';

interface Props {
  onNavigate: (view: AppView) => void;
}

// ── Display-name modal ────────────────────────────────────────────────────────
function DisplayNameModal({
  initial,
  error,
  onSave,
  onSkip,
}: {
  initial: string;
  error: string | null;
  onSave: (name: string) => void;
  onSkip: () => void;
}) {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
    >
      <div
        className="w-full rounded-t-3xl p-6"
        style={{ background: '#fff', maxWidth: 480, paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <h2 className="text-xl font-bold" style={{ color: 'var(--navy)' }}>
          Set your display name
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Clients will see this as the requester on the payment page. You can change it later.
        </p>
        <input
          className="input-field mt-5"
          maxLength={60}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g., Areeb Shoaib"
          autoFocus
        />
        {error && (
          <p className="mt-3 text-xs" style={{ color: '#c2410c' }}>{error}</p>
        )}
        <div className="mt-4 space-y-2.5">
          <button
            className="btn-primary"
            onClick={() => { if (trimmed) onSave(trimmed); }}
            disabled={trimmed.length === 0}
          >
            Save and continue
          </button>
          <button className="btn-outline" onClick={onSkip}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CreateLink({ onNavigate }: Props) {
  const { address, isConnected } = useAccount();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [clientName, setClientName] = useState(''); // optional, private to the creator

  const [created, setCreated] = useState<{ link: PaymentLink; url: string; params: LinkParams } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Creator display name (shown to payers)
  const { signedIn, signIn } = useSession();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [nameLoaded, setNameLoaded] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Load the saved display name (public lookup — no sign-in needed)
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    apiGetCreator(address)
      .then((c) => { if (!cancelled) { setDisplayName(c.displayName); setNameLoaded(true); } })
      .catch(() => { if (!cancelled) setNameLoaded(true); }); // backend unreachable — don't block
    return () => { cancelled = true; };
  }, [address]);

  const amountNum = parseFloat(amount);
  const amountValid = !isNaN(amountNum) && amountNum > 0;
  const recipientValid = isConnected && isAddress(address ?? '');
  const canCreate = amountValid && recipientValid;

  async function doCreate() {
    // Hard guard: address must be a real non-empty string before we build the URL
    if (!canCreate || !address || address.length < 10) return;
    setSaveError(null);
    setSaving(true);
    const id = generateId();
    const recipientAddress = address as string;
    const link: PaymentLink = {
      id,
      to: recipientAddress,
      amount: amountNum.toFixed(2),
      description: description.trim(),
      clientName: clientName.trim(),
      createdAt: Date.now(),
    };
    const params: LinkParams = {
      amount: link.amount,
      description: link.description,
      to: recipientAddress,
      clientName: '', // never travels in the pay URL; the server keeps it for your dashboard
      linkId: id,
    };
    try {
      // Persist to shared backend so any device can look up this link
      await apiCreateLink({
        id: link.id,
        to: link.to,
        amount: link.amount,
        description: link.description,
        clientName: link.clientName,
        chainId: ARC_ACTIVE_CHAIN_ID,
      });
    } catch {
      // Backend unavailable — fall back to localStorage only (single-device mode)
      setSaveError('Could not reach server. Link saved locally only — status updates require the same device.');
    }
    // Always save locally too (fast local reads on the creator's device)
    upsertLink(link, recipientAddress);

    const url = buildPayUrl(params);
    setSaving(false);
    setCreated({ link, url, params });
  }

  async function handleCreate() {
    if (!canCreate || !nameLoaded) return;
    // First link: ask for a display name once
    if (!displayName) {
      setNameError(null);
      setPendingCreate(true);
      setShowNameModal(true);
      return;
    }
    await doCreate();
  }

  async function handleNameSave(name: string) {
    if (!address) return;
    setNameError(null);
    // Changing the name changes the public payer page, so it needs a verified sign-in
    if (!signedIn && !(await signIn())) {
      setNameError('Please sign the free message to save your name.');
      return;
    }
    try {
      const result = await apiSetCreator(address, name);
      setDisplayName(result.displayName);
    } catch {
      setNameError('Could not save your name. Try again, or skip for now.');
      return;
    }
    setShowNameModal(false);
    if (pendingCreate) {
      setPendingCreate(false);
      await doCreate();
    }
  }

  function handleNameSkip() {
    setShowNameModal(false);
    if (pendingCreate) {
      setPendingCreate(false);
      void doCreate();
    }
  }

  if (created) {
    return (
      <LinkReady
        link={created.link}
        url={created.url}
        onCreateAnother={() => {
          setCreated(null);
          setAmount('');
          setDescription('');
          setClientName('');
        }}
        onDashboard={() => onNavigate({ name: 'dashboard' })}
      />
    );
  }

  const showPreview = amountValid || description.trim().length > 0;

  return (
    <div className="mobile-frame flex flex-col">
      {showNameModal && (
        <DisplayNameModal
          initial={displayName ?? ''}
          error={nameError}
          onSave={(n) => { void handleNameSave(n); }}
          onSkip={handleNameSkip}
        />
      )}
      {/* Header */}
      <div
        className="relative flex items-center justify-center pt-12 pb-5"
        style={{ paddingLeft: 'var(--px)', paddingRight: 'var(--px)' }}
      >
        <button
          onClick={() => onNavigate({ name: 'landing' })}
          className="absolute left-6 flex size-9 items-center justify-center rounded-full transition-colors hover:bg-gray-100"
          aria-label="Back"
        >
          <ArrowLeft size={20} style={{ color: 'var(--text-primary)' }} />
        </button>
        <ArcLogoSmall size={40} />
      </div>

      {/* Scrollable content */}
      <div
        className="flex-1 overflow-y-auto pb-4"
        style={{ paddingLeft: 'var(--px)', paddingRight: 'var(--px)' }}
      >
        <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)', letterSpacing: '-0.015em' }}>
          Create Payment Link
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Complete the details to generate your unique USDC payment link for your client.
        </p>

        <div className="mt-6 space-y-5">
          <Field label="Amount (USDC)">
            <input
              className="input-field"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, '');
                if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setAmount(v);
              }}
              placeholder="e.g., 250.00"
            />
          </Field>

          <Field label="Description">
            <input
              className="input-field"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 100))}
              placeholder="What is this payment for? e.g., Video editing"
            />
          </Field>

          <Field label="Client name (optional)">
            <input
              className="input-field"
              value={clientName}
              onChange={(e) => setClientName(e.target.value.slice(0, 60))}
              placeholder="e.g., Areeb Shoaib"
            />
            <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              Only you see this, on your dashboard. The person paying never sees it.
            </p>
          </Field>



          {/* Live preview */}
          {showPreview && (
            <div className="card-blue">
              <div className="flex items-baseline gap-2">
                <span className="amount text-4xl font-bold tabular-nums" style={{ color: 'var(--navy)' }}>
                  ${amountValid ? amountNum.toFixed(2) : '0.00'}
                </span>
                <span className="text-lg font-semibold" style={{ color: 'var(--text-secondary)' }}>USDC</span>
              </div>
              {description && (
                <p className="mt-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{description}</p>
              )}
              <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                Powered by ArcLink · Settled on Arc
              </p>
            </div>
          )}

          {isConnected && address && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Funds go directly to your wallet:{' '}
              <span className="mono font-medium" style={{ color: 'var(--navy)' }}>
                {address.slice(0, 6)}...{address.slice(-4)}
              </span>
            </p>
          )}

          {/* Display name shown to payers */}
          {nameLoaded && (
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ background: '#eef3fc', border: '1.5px solid #d0dff7' }}
            >
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Your display name</p>
                <p className="mt-0.5 text-sm font-bold" style={{ color: 'var(--navy)' }}>
                  {displayName ?? (
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                      Not set — clients will see "Payment request"
                    </span>
                  )}
                </p>
              </div>
              <button
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white"
                style={{ color: 'var(--navy)', border: '1px solid #d0dff7' }}
                onClick={() => { setPendingCreate(false); setNameError(null); setShowNameModal(true); }}
              >
                <Pencil size={12} />
                {displayName ? 'Edit' : 'Set name'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sticky CTA */}
      <div className="pb-10 pt-4" style={{ paddingLeft: 'var(--px)', paddingRight: 'var(--px)' }}>
        {saveError && (
          <p className="mb-3 rounded-xl p-3 text-xs" style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c' }}>
            {saveError}
          </p>
        )}
        <button
          className="btn-primary flex items-center justify-center gap-2"
          onClick={() => { void handleCreate(); }}
          disabled={!canCreate || saving}
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? 'Saving…' : 'Generate payment link'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}
