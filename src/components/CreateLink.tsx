import { useState } from 'react';
import { useAccount } from 'wagmi';
import { isAddress } from 'viem';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ArcLogoSmall } from './ArcLogo';
import { upsertLink } from '../storage';
import { apiCreateLink } from '../api';
import { generateId, buildPayUrl } from '../utils';
import { ARC_ACTIVE_CHAIN_ID } from '../config';
import type { PaymentLink, LinkParams, AppView } from '../types';
import LinkReady from './LinkReady';

interface Props {
  onNavigate: (view: AppView) => void;
}

export default function CreateLink({ onNavigate }: Props) {
  const { address, isConnected } = useAccount();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [clientName, setClientName] = useState('');
  const [created, setCreated] = useState<{ link: PaymentLink; url: string; params: LinkParams } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const amountNum = parseFloat(amount);
  const amountValid = !isNaN(amountNum) && amountNum > 0;
  const recipientValid = isConnected && isAddress(address ?? '');
  const canCreate = amountValid && clientName.trim().length > 0 && recipientValid;

  async function handleCreate() {
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
      clientName: link.clientName,
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
    upsertLink(link);
    const url = buildPayUrl(params);
    setSaving(false);
    setCreated({ link, url, params });
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
              placeholder="e.g., Final payment for logo design"
            />
          </Field>

          <Field label="Client name">
            <input
              className="input-field"
              value={clientName}
              onChange={(e) => setClientName(e.target.value.slice(0, 60))}
              placeholder="e.g., Sarah Johnson"
            />
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
