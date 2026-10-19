/**
 * ArcLink backend — Bun.serve on port 3001.
 * Vite proxies /api/* here (see vite.config.ts).
 *
 * Routes:
 *   POST /links              — create a payment link record
 *   GET  /links/:id          — fetch a single link
 *   GET  /links/by/:addr     — fetch all links for a recipient wallet
 *   POST /links/:id/paid     — server-side on-chain verify then mark paid
 *                              200: first verified payment wins
 *                              400: on-chain check failed (receipt, revert, timestamp, amount)
 *                              409: link already paid OR txHash used on another link
 *   GET  /health             — liveness probe
 */

import { serve } from 'bun';
import { db, stmts } from './db';
import { verifyPayment } from './verify';
import { ACTIVE_CHAIN_ID } from './chain-facts';

const PORT = 3001;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function err(msg: string, status = 400): Response {
  return json({ error: msg }, status);
}

// ── DB row type ───────────────────────────────────────────────────────────────
interface DbRow {
  id:          string;
  chain_id:    number;
  to_addr:     string;
  amount:      string;
  description: string;
  client_name: string;
  created_at:  number;
  tx_hash:     string | null;
  paid_by:     string | null;
  paid_at:     number | null;
  verified:    number;
}

function dbRowToLink(row: DbRow) {
  return {
    id:          row.id,
    chainId:     row.chain_id,
    to:          row.to_addr,
    amount:      row.amount,
    description: row.description,
    clientName:  row.client_name,
    createdAt:   row.created_at,
    txHash:      row.tx_hash  ?? undefined,
    paidBy:      row.paid_by  ?? undefined,
    paidAt:      row.paid_at  ?? undefined,
    verified:    row.verified === 1,
  };
}

// ── Server ────────────────────────────────────────────────────────────────────
serve({
  port: PORT,
  async fetch(req) {
    const url  = new URL(req.url);
    const path = url.pathname;

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin':  '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // ── POST /links ───────────────────────────────────────────────────────────
    if (req.method === 'POST' && path === '/links') {
      let body: Record<string, unknown>;
      try { body = await req.json() as Record<string, unknown>; }
      catch { return err('Invalid JSON'); }

      const { id, to, amount, description, clientName, chainId } = body as {
        id?: string; to?: string; amount?: string;
        description?: string; clientName?: string; chainId?: number;
      };

      if (!id || !to || !amount) return err('id, to, amount are required');
      if (typeof id !== 'string' || typeof to !== 'string' || typeof amount !== 'string') {
        return err('id, to, amount must be strings');
      }
      if (!/^0x[0-9a-fA-F]{40}$/.test(to)) return err('to must be a valid EVM address');

      // chainId from body — fall back to the current active chain
      const resolvedChainId = typeof chainId === 'number' ? chainId : ACTIVE_CHAIN_ID;

      stmts.insertLink.run({
        $id:          id,
        $chain_id:    resolvedChainId,
        $to_addr:     to.toLowerCase(),
        $amount:      amount,
        $description: (typeof description === 'string' ? description : '').slice(0, 200),
        $client_name: (typeof clientName  === 'string' ? clientName  : '').slice(0, 100),
        $created_at:  Date.now(),
      });
      return json({ ok: true });
    }

    // Route helpers — order matters: /links/by/:addr BEFORE /links/:id
    const byAddrMatch = path.match(/^\/links\/by\/([^/]+)$/);
    const paidMatch   = path.match(/^\/links\/([^/]+)\/paid$/);
    const singleMatch = path.match(/^\/links\/([^/]+)$/);

    // ── GET /links/by/:addr ───────────────────────────────────────────────────
    if (req.method === 'GET' && byAddrMatch) {
      const addr = decodeURIComponent(byAddrMatch[1]).toLowerCase();
      const rows = stmts.getLinksByRecipient.all({ $to_addr: addr }) as DbRow[];
      return json(rows.map(dbRowToLink));
    }

    // ── POST /links/:id/paid ──────────────────────────────────────────────────
    if (req.method === 'POST' && paidMatch) {
      const id = decodeURIComponent(paidMatch[1]);

      let body: Record<string, unknown>;
      try { body = await req.json() as Record<string, unknown>; }
      catch { return err('Invalid JSON'); }

      const { txHash } = body as { txHash?: string };
      if (!txHash || typeof txHash !== 'string') return err('txHash (string) required');

      // 1. Load link from DB (trusted source for chain_id, to_addr, amount, created_at)
      const link = stmts.getLink.get({ $id: id }) as DbRow | undefined;
      if (!link) return err('link not found', 404);

      // 2. Already paid — record duplicate, return 409
      if (link.verified === 1) {
        stmts.recordDuplicate.run({
          $link_id:     id,
          $tx_hash:     txHash,
          $paid_by:     'unknown',
          $recorded_at: Date.now(),
        });
        return json(
          {
            error:    'already_paid',
            message:  'This link has already been paid. Duplicate attempt recorded.',
            original: dbRowToLink(link),
          },
          409,
        );
      }

      // 3. txHash already used on a different link
      const existingByHash = stmts.getLinkByTxHash.get({ $tx_hash: txHash }) as DbRow | undefined;
      if (existingByHash) {
        return json(
          { error: 'tx_hash_already_used',
            message: 'This transaction has already been used to verify a different payment link.' },
          409,
        );
      }

      // 4. Server-side on-chain verification
      //    All trusted inputs come from the DB row — not from the browser.
      let result: Awaited<ReturnType<typeof verifyPayment>>;
      try {
        result = await verifyPayment(
          txHash,
          link.chain_id,    // verify only on the chain this link was created for
          link.to_addr,
          link.amount,
          link.created_at,  // block timestamp must be after this
        );
      } catch (e) {
        console.error('[verify] unexpected error:', e);
        return err('On-chain verification failed unexpectedly. Try again shortly.', 502);
      }

      if (!result.ok) {
        return err(result.reason, 400);
      }

      // 5. Write — only after all checks pass
      //    paidBy is from the Transfer log, not the browser.
      try {
        stmts.markPaid.run({
          $id:      id,
          $tx_hash: txHash,
          $paid_by: result.paidBy,
          $paid_at: Date.now(),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes('unique')) {
          const winner = stmts.getLink.get({ $id: id }) as DbRow | undefined;
          return json(
            {
              error:    'already_paid',
              message:  'A concurrent payment was recorded first.',
              original: winner ? dbRowToLink(winner) : undefined,
            },
            409,
          );
        }
        throw e;
      }

      const updated = stmts.getLink.get({ $id: id }) as DbRow;
      return json(dbRowToLink(updated));
    }

    // ── GET /links/:id ────────────────────────────────────────────────────────
    if (req.method === 'GET' && singleMatch) {
      const id  = decodeURIComponent(singleMatch[1]);
      const row = stmts.getLink.get({ $id: id }) as DbRow | undefined;
      if (!row) return err('not found', 404);
      return json(dbRowToLink(row));
    }

    // ── Health ────────────────────────────────────────────────────────────────
    if (path === '/health') return json({ ok: true });

    return err('not found', 404);
  },
});

console.log(`ArcLink API running on http://localhost:${PORT} — active chain: ${ACTIVE_CHAIN_ID}`);

setInterval(() => {
  try { db.run('PRAGMA wal_checkpoint(TRUNCATE)'); }
  catch { /* non-fatal */ }
}, 5 * 60 * 1000);
