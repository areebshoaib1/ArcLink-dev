/**
 * Small in-memory rate limiter (fixed window, per client IP + rule).
 *
 * Why: every payment claim makes the server ask the blockchain, and every
 * sign-in check does signature maths. Without a limit, one script could
 * flood the server with fake claims and slow it down for real payers.
 *
 * Behind a reverse proxy (nginx, Cloudflare, Render, Railway...), start the
 * server with TRUST_PROXY=1 so the real visitor address is read from
 * X-Forwarded-For. Without it, the direct connection address is used.
 *
 * Limits reset when the server restarts — fine for one server instance.
 */
interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

export interface Rule { name: string; limit: number; windowMs: number }

const MIN = 60_000;
const RULES = {
  paid:    { name: 'paid',    limit: 10,  windowMs: MIN },  // each one queries the chain
  create:  { name: 'create',  limit: 20,  windowMs: MIN },
  name:    { name: 'name',    limit: 10,  windowMs: MIN },
  dash:    { name: 'dash',    limit: 60,  windowMs: MIN },  // signature check each time
  general: { name: 'general', limit: 240, windowMs: MIN },
} satisfies Record<string, Rule>;

export function ruleFor(method: string, path: string): Rule {
  if (method === 'POST' && /^\/links\/[^/]+\/paid$/.test(path)) return RULES.paid;
  if (method === 'POST' && path === '/links') return RULES.create;
  if (method === 'PUT' && path.startsWith('/creators/')) return RULES.name;
  if (method === 'GET' && path.startsWith('/links/by/')) return RULES.dash;
  return RULES.general;
}

export function clientIp(req: Request, server: { requestIP(r: Request): { address: string } | null }): string {
  if (process.env.TRUST_PROXY === '1') {
    const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (first) return first;
  }
  return server.requestIP(req)?.address ?? 'unknown';
}

/** Counts this request. ok=false means the caller is over the limit. */
export function rateLimit(ip: string, rule: Rule, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const key = `${rule.name}:${ip}`;
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + rule.windowMs };
    buckets.set(key, b);
  }
  b.count++;
  return { ok: b.count <= rule.limit, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
}

// Forget finished windows so memory can't grow without bound
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  if (buckets.size > 50_000) buckets.clear();
}, MIN).unref?.();
