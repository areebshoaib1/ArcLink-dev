import { useState, useEffect } from 'react';
import { ArcQrCode } from './ArcQrCode';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useReadContract,
  useConfig,
} from 'wagmi';
import { readContract, waitForTransactionReceipt } from 'wagmi/actions';
import { ConnectKitButton } from 'connectkit';
import { erc20Abi, decodeEventLog, parseAbiItem } from 'viem';
import { Loader2, X, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { markLinkPaid, addSentPayment } from '../storage';
import { apiGetLink, apiMarkPaid, apiGetCreator, DuplicatePaymentError } from '../api';
import type { ApiLink } from '../api';
import { parseOnchainError, formatAddress, buildPayUrl, formatDate } from '../utils';
import { getUsdc, requireChain, buildTxExplorerUrl } from '@/onchain-facts';
import { parseAmount, Amount, usdcDecimalsFor } from '@/onchain-money';
import type { LinkParams, AppView } from '../types';
import { ARC_ACTIVE_CHAIN_ID, ACTIVE_CHAIN_NAME } from '../config';
import { arcLinkPayFor, ARCLINKPAY_ABI, linkRef } from '../contract';

const usdcFact = getUsdc(ARC_ACTIVE_CHAIN_ID)!;
const USDC_ADDRESS = usdcFact.address as `0x${string}`;

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

interface Props {
  params: LinkParams;
  onNavigate: (view: AppView) => void;
}

// ── Status types ──────────────────────────────────────────────────────────────
type LinkStatus =
  | { kind: 'loading' }                  // fetching from backend on mount
  | { kind: 'unknown'; warn: string }    // backend unreachable — show warning
  | { kind: 'pending' }                  // not yet paid — normal pay flow
  | { kind: 'paid'; link: ApiLink };     // already paid — show read-only state

export default function PayLink({ params: urlParams, onNavigate }: Props) {
  // The address bar can be edited by anyone, so the amount, recipient and description
  // are replaced by the creator's saved values as soon as the server answers.
  // The pay button stays disabled until then.
  const [trustedParams, setTrustedParams] = useState<LinkParams | null>(null);
  const [urlWasChanged, setUrlWasChanged] = useState(false);
  const params: LinkParams = trustedParams ?? urlParams;

  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const isWrongChain = isConnected && chainId !== ARC_ACTIVE_CHAIN_ID;

  // ── Link status (loaded from backend on mount) ────────────────────────────
  const [linkStatus, setLinkStatus] = useState<LinkStatus>({ kind: 'loading' });

  // ── Creator display name (looked up by recipient address) ───────────────────
  // Never taken from the URL: the URL's clientName is the intended PAYER, not the creator.
  const [creatorName, setCreatorName] = useState<string | null>(null);

  useEffect(() => {
    apiGetCreator(params.to)
      .then((c) => { if (c.displayName) setCreatorName(c.displayName); })
      .catch(() => { /* backend unreachable — leave null */ });
  }, [params.to]);

  // Load status once on mount — and expose a re-check function for pre-send guard
  async function checkLinkStatus(): Promise<'pending' | 'paid'> {
    try {
      const link = await apiGetLink(urlParams.linkId);
      if (link !== null) {
        const changed =
          Math.abs(parseFloat(link.amount) - parseFloat(urlParams.amount)) > 1e-9 ||
          link.to.toLowerCase() !== urlParams.to.toLowerCase();
        setTrustedParams({
          amount: link.amount,
          description: link.description,
          to: link.to,
          clientName: '',
          linkId: urlParams.linkId,
        });
        setUrlWasChanged(changed);
      }
      if (link === null) {
        // Link not in backend (e.g. created before backend existed) — allow payment
        setLinkStatus({ kind: 'pending' });
        return 'pending';
      }
      if (link.verified) {
        setLinkStatus({ kind: 'paid', link });
        return 'paid';
      }
      setLinkStatus({ kind: 'pending' });
      return 'pending';
    } catch {
      setLinkStatus((prev) =>
        prev.kind === 'loading'
          ? { kind: 'unknown', warn: "Couldn't confirm this link's status. Proceed with caution." }
          : prev,
      );
      return 'pending'; // allow optimistic payment when backend is unreachable
    }
  }

  useEffect(() => {
    void checkLinkStatus();
    // Only run on mount — params.linkId is stable for the lifetime of this component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Payment state ─────────────────────────────────────────────────────────
  const [saveHistory, setSaveHistory] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [verifyState, setVerifyState] = useState<'idle' | 'verifying' | 'verified' | 'failed'>('idle');
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract();

  // ArcLinkPay: approve exactly this payment's amount, then call pay().
  // A second write hook keeps the approve transaction separate from the payment hash.
  const wagmiConfig = useConfig();
  const { writeContractAsync: approveAsync } = useWriteContract();
  const payContract = arcLinkPayFor(ARC_ACTIVE_CHAIN_ID);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess: receiptArrived,
  } = useWaitForTransactionReceipt({
    hash,
    chainId: ARC_ACTIVE_CHAIN_ID,
    query: { enabled: !!hash },
  });

  const { data: rawBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_ACTIVE_CHAIN_ID,
    query: { enabled: !!address && !isWrongChain },
  });

  const txErrorMsg = approveError ?? (isError && error ? parseOnchainError(error) : null);

  // On-chain verification after receipt arrives
  useEffect(() => {
    if (!receiptArrived || !receipt || !hash || !address) return;
    if (verifyState !== 'idle') return;

    setVerifyState('verifying');

    if (receipt.status !== 'success') {
      setVerifyState('failed');
      setVerifyError('Transaction was reverted on-chain. No funds were transferred.');
      return;
    }

    const expectedAmountRaw = parseAmount(ARC_ACTIVE_CHAIN_ID, params.amount).raw;
    const recipientLower = params.to.toLowerCase();

    let transferVerified = false;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: [TRANSFER_EVENT], data: log.data, topics: log.topics });
        if (decoded.eventName !== 'Transfer') continue;
        const { to: toAddr, value } = decoded.args as { from: string; to: string; value: bigint };
        if (toAddr.toLowerCase() === recipientLower && value === expectedAmountRaw) {
          transferVerified = true;
          break;
        }
      } catch { /* not a Transfer log — skip */ }
    }

    if (!transferVerified) {
      setVerifyState('failed');
      setVerifyError('Transaction mined but no matching USDC Transfer found. Amount or recipient may differ.');
      return;
    }

    // When paying through ArcLinkPay, the contract's LinkPaid event for exactly this link must be present too
    if (payContract) {
      const expectedRef = linkRef(params.linkId, params.to, expectedAmountRaw);
      let contractVerified = false;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== payContract.toLowerCase()) continue;
        try {
          const ev = decodeEventLog({ abi: ARCLINKPAY_ABI, data: log.data, topics: log.topics });
          if (ev.eventName === 'LinkPaid' && ev.args.ref.toLowerCase() === expectedRef.toLowerCase()) {
            contractVerified = true;
            break;
          }
        } catch { /* not a LinkPaid log — skip */ }
      }
      if (!contractVerified) {
        setVerifyState('failed');
        setVerifyError('Transaction mined but the ArcLink payment record for this link was not found.');
        return;
      }
    }

    // Transfer confirmed — persist to backend (first-writer-wins) and localStorage
    setVerifyState('verified');

    apiMarkPaid(params.linkId, hash)
      .then((updated) => {
        // Update local status so the UI reflects paid immediately
        setLinkStatus({ kind: 'paid', link: updated });
      })
      .catch((e: unknown) => {
        if (e instanceof DuplicatePaymentError) {
          // Another payment already recorded — show the original
          setLinkStatus({ kind: 'paid', link: e.original });
        }
        // Backend error: local cache still updated below
      });

    markLinkPaid(params.linkId, hash, address, params.to);
    if (saveHistory) {
      addSentPayment({
        txHash: hash,
        to: params.to,
        amount: params.amount,
        description: params.description,
        clientName: '',
        paidAt: Date.now(),
        linkId: params.linkId,
      }, address);
    }
    onNavigate({ name: 'receipt', params, txHash: hash, paidBy: address });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptArrived, receipt]);

  const arcChain = requireChain(ARC_ACTIVE_CHAIN_ID);
  const payUrl = buildPayUrl(params);

  const formattedBalance =
    rawBalance != null
      ? Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC_ACTIVE_CHAIN_ID)).toFixed(2)
      : null;

  const amountNum = parseFloat(params.amount);
  const balanceNum = formattedBalance != null ? parseFloat(formattedBalance) : null;
  const insufficientBalance = balanceNum != null && balanceNum < amountNum;

  // ── Send transaction (called from confirm modal) ───────────────────────────
  async function sendTransaction() {
    if (!isConnected || !address || isWrongChain) return;

    // Re-check status right before sending — catches concurrent payments
    const currentStatus = await checkLinkStatus();
    if (currentStatus === 'paid') return; // UI updated by checkLinkStatus

    reset();
    let parsed: bigint;
    try { parsed = parseAmount(ARC_ACTIVE_CHAIN_ID, params.amount).raw; }
    catch { return; }

    if (payContract) {
      // Step 1: allow the contract to take exactly this amount (skipped if already allowed)
      setApproveError(null);
      try {
        const allowance = await readContract(wagmiConfig, {
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address, payContract],
          chainId: ARC_ACTIVE_CHAIN_ID,
        });
        if (allowance < parsed) {
          setApproving(true);
          const approveHash = await approveAsync({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            functionName: 'approve',
            args: [payContract, parsed],
            chainId: ARC_ACTIVE_CHAIN_ID,
          });
          const approveReceipt = await waitForTransactionReceipt(wagmiConfig, {
            hash: approveHash,
            chainId: ARC_ACTIVE_CHAIN_ID,
          });
          if (approveReceipt.status !== 'success') throw new Error('The approval transaction failed.');
        }
      } catch (e) {
        setApproveError(parseOnchainError(e));
        return;
      } finally {
        setApproving(false);
      }

      // Step 2: pay through the contract (USDC goes straight from the payer to the creator)
      writeContract({
        address: payContract,
        abi: ARCLINKPAY_ABI,
        functionName: 'pay',
        args: [params.linkId, params.to as `0x${string}`, parsed],
        chainId: ARC_ACTIVE_CHAIN_ID,
      });
      return;
    }

    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [params.to as `0x${string}`, parsed],
      chainId: ARC_ACTIVE_CHAIN_ID,
    });
  }

  function handlePayClick() { setShowConfirm(true); }
  function handleConfirm() {
    setShowConfirm(false);
    void sendTransaction();
  }

  // ── Already-Paid state ────────────────────────────────────────────────────
  if (linkStatus.kind === 'paid') {
    const paid = linkStatus.link;
    const txUrl = paid.txHash ? buildTxExplorerUrl(ARC_ACTIVE_CHAIN_ID, paid.txHash) : undefined;
    return (
      <div className="mobile-frame flex flex-col items-center" style={{ paddingLeft: 'var(--px)', paddingRight: 'var(--px)' }}>
        <div className="pt-14 pb-6 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full" style={{ background: '#dcfce7' }}>
            <CheckCircle2 size={36} style={{ color: '#16a34a' }} strokeWidth={2} />
          </div>
          <h1 className="mt-5 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Already Paid
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            This payment link has already been settled.
          </p>
        </div>

        <div className="w-full card-blue space-y-3">
          <Row label="Amount">
            <span className="amount font-bold" style={{ color: 'var(--navy)' }}>
              ${paid.amount} USDC
            </span>
          </Row>
          {paid.paidAt && (
            <Row label="Paid on">{formatDate(paid.paidAt)}</Row>
          )}
          {paid.paidBy && (
            <Row label="Paid by">
              <span className="mono">{formatAddress(paid.paidBy)}</span>
            </Row>
          )}
          {paid.txHash && (
            <Row label="Transaction">
              <span className="mono">{paid.txHash.slice(0, 6)}…{paid.txHash.slice(-4)}</span>
            </Row>
          )}
          <Row label="Network">{arcChain.name}</Row>
        </div>

        {txUrl && (
          <a
            href={txUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-5 flex items-center gap-1.5 text-sm font-semibold underline"
            style={{ color: 'var(--navy)' }}
          >
            View on Arc Explorer <ExternalLink size={14} />
          </a>
        )}

        <p className="mt-6 text-xs text-center pb-10" style={{ color: 'var(--text-muted)' }}>
          If you believe this is an error, contact the person who sent you this link.
        </p>
      </div>
    );
  }

  // ── Loading state (checking status on mount) ──────────────────────────────
  const statusLoading = linkStatus.kind === 'loading';
  const statusWarn = linkStatus.kind === 'unknown' ? linkStatus.warn : null;

  // ── Normal pay flow ───────────────────────────────────────────────────────
  return (
    <div className="mobile-frame flex flex-col" style={{ paddingLeft: 'var(--px)', paddingRight: 'var(--px)' }}>
      {/* Trust header */}
      <div className="pt-10 pb-4 text-center">
        <p className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>
          Secure USDC payment
        </p>
        <span className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ background: '#fef9c3', color: '#854d0e' }}>
          Testnet
        </span>
      </div>

      {/* The address in the browser was edited — we show the creator's real values */}
      {urlWasChanged && (
        <div className="mb-4 flex gap-2 rounded-2xl p-3 text-sm"
          style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c' }}>
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>This link's address was changed. Showing the amount and recipient the creator originally set.</span>
        </div>
      )}

      {/* Backend-unreachable warning */}
      {statusWarn && (
        <div className="mb-4 flex gap-2 rounded-2xl p-3 text-sm"
          style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c' }}>
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{statusWarn}</span>
        </div>
      )}

      {/* Payment summary card */}
      <div className="card-blue mb-5 text-center">
        <p className="mb-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Payment request from{' '}
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {creatorName ?? formatAddress(params.to)}
          </span>
        </p>
        <div className="flex items-center justify-center gap-2">
          <span className="amount text-5xl font-bold tabular-nums"
            style={{ color: 'var(--navy)', letterSpacing: '-0.02em' }}>
            ${params.amount}
          </span>
          <span className="rounded-full px-3 py-1 text-sm font-semibold"
            style={{ background: '#e2e8f0', color: 'var(--text-secondary)' }}>
            USDC
          </span>
        </div>
        {params.description && (
          <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {params.description}
          </p>
        )}
        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          To: <span className="mono font-medium" style={{ color: 'var(--text-secondary)' }}>
            {formatAddress(params.to)}
          </span>
        </p>
      </div>

      {/* QR code */}
      <div className="flex flex-col items-center mb-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: '1px solid var(--border)' }}>
          <ArcQrCode value={payUrl} size={170} />
        </div>
        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Scan to pay with your mobile wallet
        </p>
      </div>

      {/* Errors */}
      {txErrorMsg && (
        <div className="mb-4 rounded-2xl p-3 text-sm"
          style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
          {txErrorMsg}
        </div>
      )}
      {verifyError && (
        <div className="mb-4 flex gap-2 rounded-2xl p-3 text-sm"
          style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{verifyError}</span>
        </div>
      )}
      {insufficientBalance && (
        <div className="mb-4 rounded-2xl p-3 text-sm"
          style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c' }}>
          Insufficient USDC balance ({formattedBalance} USDC). Use "Get test USDC" in the sidebar.
        </div>
      )}

      {/* CTA area */}
      <div className="space-y-3">
        {isConnected && address && (
          <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            Paying from:{' '}
            <span className="mono font-bold" style={{ color: 'var(--text-primary)' }}>
              {formatAddress(address)}
            </span>
          </p>
        )}
        {isConnected && !isWrongChain && (
          <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            {formattedBalance != null
              ? <>Balance: <span className="font-semibold"
                style={{ color: insufficientBalance ? '#c2410c' : 'var(--text-secondary)' }}>
                {formattedBalance} USDC</span></>
              : 'Checking balance…'}
          </p>
        )}

        {isConnected && (
          <div className="flex items-center justify-between py-1">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Save this payment to my history
            </span>
            <button role="switch" aria-checked={saveHistory}
              onClick={() => setSaveHistory((v) => !v)}
              className="relative h-7 w-12 rounded-full transition-colors"
              style={{ background: saveHistory ? 'var(--navy)' : '#cbd5e1', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
              <span className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-sm"
                style={{ left: saveHistory ? 'calc(100% - 25px)' : '3px', transition: 'left 0.18s' }} />
            </button>
          </div>
        )}

        {/* Main CTA — disabled while status is loading */}
        {!isConnected ? (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button className="btn-primary" onClick={show} disabled={statusLoading}>
                {statusLoading ? 'Checking status…' : 'Connect wallet'}
              </button>
            )}
          </ConnectKitButton.Custom>
        ) : isWrongChain ? (
          <button className="btn-primary flex items-center justify-center gap-2"
            onClick={() => switchChain({ chainId: ARC_ACTIVE_CHAIN_ID })}
            disabled={isSwitching}>
            {isSwitching && <Loader2 className="size-4 animate-spin" />}
            Switch to {arcChain.name}
          </button>
        ) : (
          <button className="btn-primary flex items-center justify-center gap-2"
            onClick={handlePayClick}
            disabled={statusLoading || approving || isPending || isConfirming || insufficientBalance}>
            {(statusLoading || approving || isPending || isConfirming) && <Loader2 className="size-4 animate-spin" />}
            {statusLoading
              ? 'Checking status…'
              : approving
                ? 'Approve USDC in wallet… (1 of 2)'
                : isPending
                  ? 'Confirm in wallet…'
                  : isConfirming
                    ? 'Confirming…'
                    : `Pay $${params.amount} USDC`}
          </button>
        )}
      </div>

      {/* Trust footer */}
      <div className="mt-6 pb-10 text-center space-y-1">
        {payContract && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Two wallet confirmations: approve this exact amount, then pay.
          </p>
        )}
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Non-custodial · funds go directly to{' '}
          {creatorName ?? formatAddress(params.to)}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Paid in <span className="font-semibold" style={{ color: 'var(--navy)' }}>USDC</span>
          {' '}on <span className="font-semibold" style={{ color: 'var(--navy)' }}>{ACTIVE_CHAIN_NAME}</span>
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Supports MetaMask, OKX Wallet, Coinbase Wallet, and other compatible wallets
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          ArcLink is an independent project, not affiliated with or endorsed by Circle or Arc.
        </p>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setShowConfirm(false)}>
          <div className="w-full rounded-t-3xl bg-white p-6 pb-10" style={{ maxWidth: 375 }}
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                Confirm payment
              </h2>
              <button onClick={() => setShowConfirm(false)}
                className="flex size-8 items-center justify-center rounded-full"
                style={{ background: '#f1f5f9' }}>
                <X size={16} style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>

            <div className="space-y-3 rounded-2xl p-4"
              style={{ background: 'var(--surface-blue)', border: '1px solid var(--border-blue)' }}>
              <Row label="You pay">
                <span className="amount font-bold tabular-nums" style={{ color: 'var(--navy)', fontSize: 18 }}>
                  ${params.amount} USDC
                </span>
              </Row>
              {params.description && <Row label="For">{params.description}</Row>}
              <Row label="Recipient">
                <span className="mono" style={{ color: 'var(--text-secondary)' }}>
                  {formatAddress(params.to)}
                </span>
              </Row>
              <Row label="Token">USDC · {USDC_ADDRESS.slice(0, 6)}…{USDC_ADDRESS.slice(-4)}</Row>
              <Row label="Network">
                <span style={{ color: 'var(--navy)', fontWeight: 600 }}>{arcChain.name}</span>
              </Row>
              <Row label="Network fee">
                <span style={{ color: '#16a34a', fontWeight: 600 }}>~$0.00 USDC</span>
              </Row>
              {formattedBalance != null && (
                <Row label="Your balance">
                  <span style={{ color: insufficientBalance ? '#c2410c' : 'var(--text-secondary)', fontWeight: 500 }}>
                    {formattedBalance} USDC
                  </span>
                </Row>
              )}
            </div>

            <p className="mt-3 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              Funds go directly to the recipient. ArcLink never holds your money.
            </p>

            <div className="mt-5 space-y-3">
              <button className="btn-primary" onClick={handleConfirm} disabled={insufficientBalance}>
                Confirm &amp; pay ${params.amount} USDC
              </button>
              <button className="btn-outline" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-sm shrink-0" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm text-right" style={{ color: 'var(--text-primary)' }}>{children}</span>
    </div>
  );
}
