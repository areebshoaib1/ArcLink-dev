/**
 * ArcLink SQLite database — single writer, WAL mode, crash-safe.
 * One process opens this file; never open it from a second process.
 */
import { Database } from 'bun:sqlite';
import path from 'node:path';

const DB_PATH = path.join(import.meta.dir, '../arclink.db');

export const db = new Database(DB_PATH, { create: true });

// Crash-safe settings
db.run('PRAGMA journal_mode=WAL');
db.run('PRAGMA synchronous=FULL');
db.run('PRAGMA busy_timeout=5000');
db.run('PRAGMA foreign_keys=ON');

// ── Schema ────────────────────────────────────────────────────────────────────

db.run(`
  CREATE TABLE IF NOT EXISTS links (
    id          TEXT    PRIMARY KEY,
    chain_id    INTEGER NOT NULL,          -- the chain this link was created on
    to_addr     TEXT    NOT NULL,
    amount      TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    client_name TEXT    NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL,
    tx_hash     TEXT    UNIQUE,            -- globally unique: one tx cannot verify two links
    paid_by     TEXT,
    paid_at     INTEGER,
    verified    INTEGER NOT NULL DEFAULT 0 -- 1 = server-verified Transfer log, first-writer-wins
  )
`);


/**
 * Duplicate payments: a second verified tx arrives for an already-paid link.
 * The original record is never overwritten; duplicates are stored here.
 */
db.run(`
  CREATE TABLE IF NOT EXISTS duplicate_payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id     TEXT    NOT NULL REFERENCES links(id),
    tx_hash     TEXT    NOT NULL,
    paid_by     TEXT    NOT NULL,
    recorded_at INTEGER NOT NULL
  )
`);

// ── Prepared statements ───────────────────────────────────────────────────────
export const stmts = {
  insertLink: db.prepare(`
    INSERT OR IGNORE INTO links (id, chain_id, to_addr, amount, description, client_name, created_at)
    VALUES ($id, $chain_id, $to_addr, $amount, $description, $client_name, $created_at)
  `),

  getLink: db.prepare(`
    SELECT * FROM links WHERE id = $id
  `),

  getLinkByTxHash: db.prepare(`
    SELECT * FROM links WHERE tx_hash = $tx_hash
  `),

  getLinksByRecipient: db.prepare(`
    SELECT * FROM links WHERE to_addr = $to_addr ORDER BY created_at DESC
  `),

  /**
   * Atomic first-writer-wins update.
   * WHERE verified = 0 means a concurrent second call hits 0 rows.
   * UNIQUE on tx_hash causes SQLITE_CONSTRAINT if the same hash is reused.
   */
  markPaid: db.prepare(`
    UPDATE links
    SET tx_hash = $tx_hash, paid_by = $paid_by, paid_at = $paid_at, verified = 1
    WHERE id = $id AND verified = 0
  `),

  recordDuplicate: db.prepare(`
    INSERT INTO duplicate_payments (link_id, tx_hash, paid_by, recorded_at)
    VALUES ($link_id, $tx_hash, $paid_by, $recorded_at)
  `),
};
