import { useState } from 'react';
import { Check } from 'lucide-react';
import { useTransaction } from 'wagmi';
import { formatAddress, formatDate } from '../utils';
import { buildTxExplorerUrl, requireChain } from '@/onchain-facts';
import { ARC_ACTIVE_CHAIN_ID } from '../config';
import type { AppView, LinkParams } from '../types';

interface Props {
  params: LinkParams;
  txHash: string;
  paidBy: string;
  onNavigate: (view: AppView) => void;
}

export default function Receipt({ params, txHash, paidBy, onNavigate }: Props) {
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
  const timeMs = mountTime;
  const fromAddr = txData?.from ?? paidBy;

  function handleDownloadPDF() {
    const content = [
      'ArcLink Payment Receipt',
      '=======================',
      `Amount:           $${params.amount} USDC`,
      `Description:      ${params.description || '—'}`,
      `Client:           ${params.clientName || '—'}`,
      `From:             ${fromAddr || '—'}`,
      `To:               ${params.to}`,
      `Network:          ${arcChain.name}`,
      `Transaction hash: ${txHash}`,
      `Time:             ${formatDate(timeMs)}`,
      '',
      'Settled instantly on Arc. No intermediaries, no delays.',
      'Powered by ArcLink · arclink.app',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arclink-receipt-${txHash.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
        <p className="mt-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {params.clientName ? `${params.clientName} just paid you ` : 'You received '}
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            ${params.amount} USDC
          </span>
        </p>
      </div>

      {/* Detail card — rebuilt from tx data + link params */}
      <div className="card-blue mt-7 space-y-3">
        <DetailRow label="Amount" value={`$${params.amount} USDC`} valueClass="amount font-bold" />
        <div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Description</p>
          <p className="mt-0.5 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {params.description || '—'}
          </p>
        </div>
        <DetailRow label="From" value={formatAddress(fromAddr || paidBy)} mono />
        <DetailRow label="To" value={formatAddress(params.to)} mono />
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
        <button className="btn-outline" onClick={handleDownloadPDF}>
          Download Receipt (PDF)
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
