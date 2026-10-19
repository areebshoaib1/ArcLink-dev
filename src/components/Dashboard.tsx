import { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { erc20Abi } from 'viem';
import { Plus, ExternalLink, RefreshCw } from 'lucide-react';
import { loadSentPayments } from '../storage';
import { buildPayUrl, formatAddress, formatDate } from '../utils';
import { buildTxExplorerUrl, getUsdc } from '@/onchain-facts';
import { Amount, usdcDecimalsFor } from '@/onchain-money';
import { apiGetLinksByAddress, type ApiLink } from '../api';
import { ARC_ACTIVE_CHAIN_ID, ACTIVE_CHAIN_NAME } from '../config';
import type { AppView, SentPayment, LinkParams } from '../types';

type Tab = 'received' | 'paid';

interface Props {
  onNavigate: (view: AppView) => void;
}

const usdcFact = getUsdc(ARC_ACTIVE_CHAIN_ID)!;
const USDC_ADDRESS = usdcFact.address as `0x${string}`;

export default function Dashboard({ onNavigate }: Props) {
  const { address, isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>('received');
  const [links, setLinks] = useState<ApiLink[]>([]);
  const [sent, setSent] = useState<SentPayment[]>(() => loadSentPayments());
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Live on-chain USDC balance — the ground truth regardless of localStorage
  const { data: rawBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_ACTIVE_CHAIN_ID,
    query: { enabled: !!address && isConnected },
  });

  const formattedBalance =
    rawBalance != null
      ? Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC_ACTIVE_CHAIN_ID)).toFixed(2)
      : null;

  // Core fetch — takes the address explicitly so the callback has no stale-closure risk
  const doFetch = useCallback((addr: string) => {
    setLoading(true);
    setFetchError(null);
    apiGetLinksByAddress(addr)
      .then((data) => { setLinks(data); })
      .catch(() => { setFetchError('Could not load links from server. Showing local data.'); })
      .finally(() => { setLoading(false); });
  }, []);

  // Wrap for use in focus/interval handlers that read address from closure
  const fetchLinks = useCallback(() => {
    if (address) doFetch(address);
  }, [address, doFetch]);

  // Fetch when address becomes available or changes
  useEffect(() => {
    if (address) doFetch(address);
  // doFetch is stable; address change is the intended trigger
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // Refresh on tab focus (catches payments made on another device/browser)
  useEffect(() => {
    const onFocus = () => {
      fetchLinks();
      void refetchBalance();
      setSent(loadSentPayments());
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchLinks, refetchBalance]);

  // Poll every 15 s while the dashboard is open — catches cross-device payments quickly
  useEffect(() => {
    const id = setInterval(fetchLinks, 15_000);
    return () => clearInterval(id);
  }, [fetchLinks]);

  // Verified-only totals
  const totalReceived = links
    .filter((l) => l.verified)
    .reduce((s, l) => s + parseFloat(l.amount), 0);

  const totalPending = links
    .filter((l) => !l.verified)
    .reduce((s, l) => s + parseFloat(l.amount), 0);

  function handleCopyLink(link: ApiLink) {
    const params: LinkParams = {
      amount: link.amount,
      description: link.description,
      to: link.to,
      clientName: link.clientName,
      linkId: link.id,
    };
    void navigator.clipboard.writeText(buildPayUrl(params));
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleRefresh() {
    void fetchLinks();
    void refetchBalance();
    setSent(loadSentPayments());
  }

  return (
    <div className="mobile-frame flex flex-col" style={{ paddingLeft: 'var(--px)', paddingRight: 'var(--px)' }}>
      {/* Header */}
      <div className="flex items-start justify-between pt-12 pb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Your payments
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Track every link you've created
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="flex size-11 items-center justify-center rounded-2xl transition-opacity hover:opacity-80"
            style={{ background: '#f1f5f9', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }}
            aria-label="Refresh"
            title="Refresh payment status"
          >
            <RefreshCw size={18} style={{ color: 'var(--navy)' }} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => onNavigate({ name: 'create' })}
            className="flex size-11 items-center justify-center rounded-2xl transition-opacity hover:opacity-80"
            style={{ background: 'var(--navy)', color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0 }}
            aria-label="Create payment link"
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Live USDC balance — ground truth across devices */}
      {isConnected && (
        <div
          className="mb-4 rounded-2xl p-3 flex items-center justify-between"
          style={{ background: 'var(--blue-card)', border: '1px solid var(--blue-card-border)' }}
        >
          <div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Your USDC balance (on-chain)</p>
            <p className="amount mt-0.5 text-xl font-bold tabular-nums" style={{ color: 'var(--navy)' }}>
              {formattedBalance != null ? `$${formattedBalance}` : '—'}
            </p>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ background: '#fef9c3', color: '#854d0e' }}
          >
            {ACTIVE_CHAIN_NAME}
          </span>
        </div>
      )}

      {!isConnected && (
        <div
          className="mb-4 rounded-2xl p-3 text-sm text-center"
          style={{ background: '#fef9c3', border: '1px solid #fde68a', color: '#854d0e' }}
        >
          Connect your wallet to see your payment links
        </div>
      )}

      {fetchError && (
        <div
          className="mb-3 rounded-xl p-3 text-xs"
          style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c' }}
        >
          {fetchError}
        </div>
      )}

     
{/* Stats row — only count verified payments */}
<div className="grid grid-cols-3 gap-2.5 mb-5">
  <StatCard
    label="Total received"
    value={`$${totalReceived.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`}
  />
  <StatCard
    label="Pending"
    value={`$${totalPending.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`}
  />
  <StatCard label="Links created" value={String(links.length)} />
</div>


      {/* Tabs */}
      <div className="mb-4 flex rounded-xl p-1" style={{ background: '#f1f5f9' }}>
        {(['received', 'paid'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition-colors"
            style={{
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? 'var(--navy)' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {t === 'received' ? `Received (${links.filter((l) => l.verified).length})` : `Paid (${sent.length})`}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 space-y-3 pb-10 overflow-y-auto">
        {tab === 'received' && (
          loading && links.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--navy)' }} />
              <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading links…</p>
            </div>
          ) : links.length === 0 ? (
            <EmptyState onNavigate={onNavigate} />
          ) : (
            links.map((link) => (
              <ReceivedRow
                key={link.id}
                link={link}
                copied={copiedId === link.id}
                onCopy={() => handleCopyLink(link)}
                onReceipt={() => {
                  if (link.txHash) {
                    const params: LinkParams = {
                      amount: link.amount,
                      description: link.description,
                      to: link.to,
                      clientName: link.clientName,
                      linkId: link.id,
                    };
                    onNavigate({
                      name: 'receipt',
                      params,
                      txHash: link.txHash,
                      paidBy: link.paidBy ?? '',
                    });
                  }
                }}
              />
            ))
          )
        )}

        {tab === 'paid' && (
          sent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No payments sent yet</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Payments you make will appear here
              </p>
            </div>
          ) : (
            sent.map((s) => <SentRow key={s.txHash} payment={s} />)
          )
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl p-3"
      style={{ background: 'var(--blue-card)', border: '1px solid var(--blue-card-border)' }}
    >
     <p className="text-xs leading-snug whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="amount mt-1.5 text-xl font-bold tabular-nums leading-none" style={{ color: 'var(--navy)' }}>
        {value}
      </p>
    </div>
  );
}

function ReceivedRow({
  link,
  copied,
  onCopy,
  onReceipt,
}: {
  link: ApiLink;
  copied: boolean;
  onCopy: () => void;
  onReceipt: () => void;
}) {
  const isPaid = link.verified;
  return (
    <button
      onClick={isPaid ? onReceipt : onCopy}
      className="w-full rounded-2xl p-4 text-left transition-colors hover:bg-gray-50"
      style={{ background: '#fff', border: '1px solid var(--border)', cursor: 'pointer' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {link.description || 'Payment'}
          </p>
          <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
            {link.clientName || 'No client name'}
            {!isPaid && copied && (
              <span className="ml-2 font-semibold" style={{ color: 'var(--navy)' }}>Link copied!</span>
            )}
          </p>
          {isPaid && link.paidAt && (
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              {formatDate(link.paidAt)}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="amount text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            ${parseFloat(link.amount).toFixed(2)}
          </span>
          {isPaid ? <span className="badge-paid">Paid</span> : <span className="badge-pending">Pending</span>}
        </div>
      </div>
    </button>
  );
}

function SentRow({ payment }: { payment: SentPayment }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: '#fff', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {payment.description || 'Payment'}
          </p>
          <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
            To {payment.clientName || formatAddress(payment.to)}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            {formatDate(payment.paidAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="amount text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            ${parseFloat(payment.amount).toFixed(2)}
          </span>
          <a
            href={buildTxExplorerUrl(ARC_ACTIVE_CHAIN_ID, payment.txHash)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-0.5 text-xs underline"
            style={{ color: 'var(--navy)' }}
          >
            Tx <ExternalLink size={10} />
          </a>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onNavigate }: { onNavigate: (v: AppView) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="mb-4 flex size-14 items-center justify-center rounded-2xl"
        style={{ background: 'var(--blue-card)' }}
      >
        <Plus size={24} style={{ color: 'var(--navy)' }} />
      </div>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No payment links yet</p>
      <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Create your first link to get paid in USDC
      </p>
      <button
        className="btn-primary mt-6"
        style={{ maxWidth: 200 }}
        onClick={() => onNavigate({ name: 'create' })}
      >
        Create a link
      </button>
    </div>
  );
}
