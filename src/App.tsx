import { useState, useEffect, useRef } from 'react';
import type { AppView } from './types';
import { parseLinkParamsFromUrl, parseReceiptFromUrl } from './utils';
import Landing from './components/Landing';
import CreateLink from './components/CreateLink';
import PayLink from './components/PayLink';
import Dashboard from './components/Dashboard';
import Receipt from './components/Receipt';

/**
 * Routing strategy:
 *  - Pay links  → hash params:   /#?a=...&r=...&d=...&n=...&id=...
 *    Works without a server (static hosting, preview, zip). Hash is never
 *    sent to the server so the base HTML is always returned.
 *  - Receipts   → search params: /?tx=...&from=...&a=...&r=...&d=...&n=...&id=...
 *    Internal navigation only — the user never manually crafts these URLs.
 *  - Everything else → landing page.
 */
function parseInitialView(): AppView {
  // 1. Pay link — all data in hash fragment, no server needed
  const linkParams = parseLinkParamsFromUrl();
  if (linkParams) return { name: 'pay', params: linkParams };

  // 2. Receipt — data in search params (internal navigation)
  const receipt = parseReceiptFromUrl();
  if (receipt) {
    return {
      name: 'receipt',
      params: receipt.params,
      txHash: receipt.txHash,
      paidBy: receipt.paidBy,
    };
  }

  return { name: 'landing' };
}

const NAV_ORDER: AppView['name'][] = ['landing', 'create', 'dashboard', 'pay', 'receipt'];

function getDirection(from: AppView['name'], to: AppView['name']): 1 | -1 {
  const fi = NAV_ORDER.indexOf(from);
  const ti = NAV_ORDER.indexOf(to);
  if (fi === -1 || ti === -1) return 1;
  return ti >= fi ? 1 : -1;
}

export default function App() {
  const [view, setView] = useState<AppView>(parseInitialView);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [animKey, setAnimKey] = useState(0);
  const prevViewRef = useRef<AppView['name']>(view.name);

  function navigate(next: AppView) {
    const dir = getDirection(prevViewRef.current, next.name);
    setDirection(dir);
    setAnimKey((k) => k + 1);
    prevViewRef.current = next.name;
    setView(next);

    // Sync URL — pay links use hash, receipts use search, everything else is clean
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';

    if (next.name === 'pay') {
      // Write pay params to hash so the URL is shareable on any static host
      const p = new URLSearchParams({
        a: next.params.amount,
        d: next.params.description,
        r: next.params.to,
        n: '',
        id: next.params.linkId,
      });
      url.hash = `?${p.toString()}`;
    } else if (next.name === 'receipt') {
      // Write receipt params to search (internal navigation)
      url.searchParams.set('tx', next.txHash);
      url.searchParams.set('from', next.paidBy);
      url.searchParams.set('a', next.params.amount);
      url.searchParams.set('d', next.params.description);
      url.searchParams.set('r', next.params.to);
      
      url.searchParams.set('id', next.params.linkId);
    }

    window.history.pushState(null, '', url.toString());
  }

  // Handle browser back/forward
  useEffect(() => {
    const onPop = () => {
      const next = parseInitialView();
      setDirection(-1);
      setAnimKey((k) => k + 1);
      prevViewRef.current = next.name;
      setView(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const animClass = direction === 1 ? 'slide-in-right' : 'slide-in-left';

  return (
    <div style={{ minHeight: '100dvh', background: '#f1f5f9', display: 'flex', justifyContent: 'center' }}>

      <div
        key={animKey}
        className={animClass}
        style={{
          width: '100%',
          maxWidth: 1200,
          minHeight: '100dvh',
        }}
      >

        {view.name === 'landing' && <Landing onNavigate={navigate} />}
        {view.name === 'create' && <CreateLink onNavigate={navigate} />}
        {view.name === 'pay' && <PayLink params={view.params} onNavigate={navigate} />}
        {view.name === 'dashboard' && <Dashboard onNavigate={navigate} />}
        {view.name === 'receipt' && (
          <Receipt
            params={view.params}
            txHash={view.txHash}
            paidBy={view.paidBy}
            onNavigate={navigate}
          />
        )}
      </div>
    </div>
  );
}
