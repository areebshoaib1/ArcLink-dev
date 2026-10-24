import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useAccount, useTransaction } from 'wagmi';
import { formatAddress, formatDate } from '../utils';
import { buildTxExplorerUrl, requireChain } from '@/onchain-facts';
import { ARC_ACTIVE_CHAIN_ID } from '../config';
import { apiGetLink, apiGetCreator } from '../api';
import { receiptRole } from '../receipt-role';
import { renderReceiptPng } from '../receipt-image';
import type { AppView, LinkParams } from '../types';

interface Props {
  params: LinkParams;
  txHash: string;
  paidBy: string;
  onNavigate: (view: AppView) => void;
}

export default function Receipt({ params, txHash, paidBy, onNavigate }: Props) {
  const { address } = useAccount();
  const arcChain = requireChain(ARC_ACTIVE_CHAIN_ID);
  const txUrl = buildTxExplorerUrl(ARC_ACTIVE_CHAIN_ID, txHash);

  // Rebuild receipt from blockchain — accurate on any device
  const { data: txData } = useTransaction({
    hash: txHash as `0x${string}`,
    chainId: ARC_ACTIVE_CHAIN_ID,
    query: { enabled: !!txHash },
  });

  // Capture mount time once so it doesn't change across re-renders
  const [mountTime] = useState(() => Date.now());
  const fromAddr = txData?.from ?? paidBy;

  // The server record is the source of truth for the description (a web address
  // can lose it); the recipient's display name comes from their profile.
  const [serverDescription, setServerDescription] = useState<string | null>(null);
  const [serverPaidAt, setServerPaidAt] = useState<number | null>(null);
  // Show the real payment time once the saved record loads (not the moment this page was opened)
  const timeMs = serverPaidAt ?? mountTime;
  const [recipientName, setRecipientName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (params.linkId) {
      apiGetLink(params.linkId)
        .then((l) => {
          if (cancelled || !l) return;
          if (l.description) setServerDescription(l.description);
          if (l.paidAt) setServerPaidAt(l.paidAt);
        })
        .catch(() => { /* server unreachable — use the link's own copy */ });
    }
    apiGetCreator(params.to)
      .then((c) => { if (!cancelled && c.displayName) setRecipientName(c.displayName); })
      .catch(() => { /* no name available — show the address */ });
    return () => { cancelled = true; };
  }, [params.linkId, params.to]);

  const description = serverDescription ?? params.description;
  const role = receiptRole(address, params.to, fromAddr);
  const shortTo = formatAddress(params.to);
  const toLabel = recipientName ? `${recipientName} (${shortTo})` : shortTo;
  const payerLabel = fromAddr ? formatAddress(fromAddr) : 'another wallet';

  const amountEl = (
    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
      ${params.amount} USDC
    </span>
  );

  // Say only what the chain can prove: which wallet sent, and which wallet received.
  const headline =
    role === 'recipient' ? <>You received {amountEl} from {payerLabel}</> :
    role === 'payer' ? <>You paid {amountEl} to {recipientName ?? shortTo}</> :
    role === 'both' ? <>You sent {amountEl} to your own wallet</> :
    <>{amountEl} sent from {payerLabel} to {recipientName ?? shortTo}</>;

  // Plain-text version of the headline, used inside the downloaded image
  const headlineText =
    role === 'recipient' ? `You received $${params.amount} USDC from ${payerLabel}` :
    role === 'payer' ? `You paid $${params.amount} USDC to ${recipientName ?? shortTo}` :
    role === 'both' ? `You sent $${params.amount} USDC to your own wallet` :
    `$${params.amount} USDC sent from ${payerLabel} to ${recipientName ?? shortTo}`;

  async function handleDownload() {
    const blob = await renderReceiptPng({
      headline: headlineText,
      amount: params.amount,
      description: description || '',
      from: fromAddr || '',
      to: params.to,
      toName: recipientName,
      network: arcChain.name,
      txHash,
      time: formatDate(timeMs),
    });
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arclink-receipt-${txHash.slice(2, 10)}.png`;
    document.body.appendChild(a);   // some browsers ignore clicks on detached links
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); // don't cancel the download early
  }

  return (
    <div className="mobile-frame flex flex-col" style={{ paddingLeft: 'var(--px)', paddingRight: 'var(--px)' }}>
      {/* Success icon */}
      <div className="flex flex-col items-center pt-14">
        <div
          className="flex size-16 items-center justify-center rounded-full"
          style={{ background: '#22c55e' }}
        >
          <Check size={32} strokeWidth={3} color="white" />
        </div>
        <h1 className="mt-5 text-2xl font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.015em' }}>
          Payment Complete
        </h1>
        <p className="mt-1.5 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          {headline}
        </p>
      </div>

      {/* Detail card — rebuilt from tx data + the saved link record */}
      <div className="card-blue mt-7 space-y-3">
        <DetailRow label="Amount" value={`$${params.amount} USDC`} valueClass="amount font-bold" />
        <div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Description</p>
          <p className="mt-0.5 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {description || '—'}
          </p>
        </div>
        <DetailRow label="From" value={formatAddress(fromAddr || paidBy)} mono />
        <DetailRow label="To" value={toLabel} mono={!recipientName} />
        <DetailRow label="Network" value={arcChain.name} />
        <DetailRow label="Transaction hash" value={`${txHash.slice(0, 6)}...${txHash.slice(-4)}`} mono />
        <DetailRow label="Time" value={formatDate(timeMs)} />
      </div>

      {/* Action buttons */}
      <div className="mt-6 space-y-3 pb-10">
        <a
          href={txUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-primary block text-center"
          style={{ textDecoration: 'none' }}
        >
          View on Arc Explorer
        </a>
        <button className="btn-outline" onClick={() => void handleDownload()}>
          Download Receipt
        </button>
        <button className="btn-outline" onClick={() => onNavigate({ name: 'dashboard' })}>
          Back to Dashboard
        </button>
      </div>

      {/* Footer */}
      <p className="pb-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        This payment settled instantly on{' '}
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Arc</span>
        . No intermediaries, no delays.
      </p>
    </div>
  );
}

function DetailRow({ label, value, mono, valueClass = '' }: {
  label: string; value: string; mono?: boolean; valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span
        className={`text-sm font-semibold text-right ${mono ? 'mono' : ''} ${valueClass}`}
        style={{ color: 'var(--text-primary)' }}
      >
        {value}
      </span>
    </div>
  );
}
