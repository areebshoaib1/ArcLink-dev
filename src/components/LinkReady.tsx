import { useState } from 'react';
import { Copy, Check, Share2 } from 'lucide-react';
import { ArcLogoSmall } from './ArcLogo';
import { ArcQrCode } from './ArcQrCode';
import type { PaymentLink } from '../types';

interface Props {
  link: PaymentLink;
  url: string;
  onCreateAnother: () => void;
  onDashboard: () => void;
}

export default function LinkReady({ link, url, onCreateAnother, onDashboard }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleShare() {
    if (navigator.share) {
      void navigator.share({ title: 'ArcLink Payment', url });
    } else {
      handleCopy();
    }
  }

  return (
    <div className="mobile-frame flex flex-col" style={{ paddingLeft: 'var(--px)', paddingRight: 'var(--px)' }}>
      <div className="flex justify-center pt-12 pb-5">
        <ArcLogoSmall size={40} />
      </div>

      <div className="flex-1">
        <div className="text-center">
          <div
            className="mx-auto mb-1 flex size-14 items-center justify-center rounded-full"
            style={{ background: '#dcfce7' }}
          >
            <Check size={28} strokeWidth={2.5} style={{ color: '#16a34a' }} />
          </div>
          <h1 className="mt-4 text-2xl font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.015em' }}>
            Link created!
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Share this with{' '}
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {link.clientName}
            </span>
          </p>
        </div>

        {/* QR code */}
        <div className="my-6 flex justify-center">
          <div
            className="rounded-2xl bg-white p-4 shadow-sm"
            style={{ border: '1px solid var(--border)' }}
          >
            <ArcQrCode value={url} size={192} />
          </div>
        </div>

        {/* Summary card */}
        <div className="card-blue mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Amount</span>
            <span className="amount text-base font-bold tabular-nums" style={{ color: 'var(--navy)' }}>
              ${link.amount} USDC
            </span>
          </div>
          {link.description && (
            <div className="mt-2 flex items-start justify-between gap-4">
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Description</span>
              <span className="text-sm font-medium text-right" style={{ color: 'var(--text-primary)', maxWidth: '60%' }}>
                {link.description}
              </span>
            </div>
          )}
        </div>

        {/* Link row */}
        <div
          className="flex items-center gap-2 rounded-2xl p-3"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
        >
          <p
            className="mono flex-1 truncate text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            {url}
          </p>
          <button
            onClick={handleCopy}
            className="flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white"
            aria-label="Copy link"
          >
            {copied
              ? <Check size={16} style={{ color: '#16a34a' }} />
              : <Copy size={16} style={{ color: 'var(--text-secondary)' }} />}
          </button>
          <button
            onClick={handleShare}
            className="flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white"
            aria-label="Share link"
          >
            <Share2 size={16} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="space-y-3 pb-10 pt-6">
        <button className="btn-outline" onClick={onCreateAnother}>
          Create another link
        </button>
        <button className="btn-primary" onClick={onDashboard}>
          View dashboard
        </button>
      </div>
    </div>
  );
}
