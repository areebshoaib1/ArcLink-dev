import { useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';

interface Props {
  label?: string;
  disabled?: boolean;
  className?: string;
}

export default function WalletChooser({
  label = 'Connect wallet',
  disabled = false,
  className = 'btn-primary',
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const { isConnected } = useAccount();
  const {
    connectors,
    connectAsync,
    isPending: isConnecting,
  } = useConnect();
  const {
    disconnectAsync,
    isPending: isDisconnecting,
  } = useDisconnect();

  async function chooseWallet(connector: (typeof connectors)[number]) {
    setError('');

    try {
      if (isConnected) {
        await disconnectAsync();
      }

      await connectAsync({ connector });
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not connect wallet.',
      );
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled || isConnecting || isDisconnecting}
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        {isConnecting || isDisconnecting ? 'Connecting…' : label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Choose a wallet"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-slate-900 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Choose a wallet</h2>
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  type="button"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left font-medium hover:bg-slate-50 disabled:opacity-50"
                  disabled={isConnecting || isDisconnecting}
                  onClick={() => void chooseWallet(connector)}
                >
                  {connector.name}
                </button>
              ))}
            </div>

            {error && (
              <p className="mt-4 break-words text-sm text-red-600">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
