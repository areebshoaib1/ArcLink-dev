/**
 * ArcLink server security tests.  Run with the server already running:
 *   bun run tests/security.ts
 * Uses two throw-away wallets (A = creator, B = attacker). No real funds, no network besides localhost.
 */
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const BASE = process.env.API ?? 'http://localhost:3001';
const A = privateKeyToAccount(generatePrivateKey());
const B = privateKeyToAccount(generatePrivateKey());

// Must match buildSignInMessage in src/auth.ts and server/auth.ts
const msg = (a: string, i: number) =>
  ['ArcLink sign-in', '', 'Sign this message to prove you own this wallet.',
   'It is free and does not send a transaction.', '',
   `Address: ${a.toLowerCase()}`, `Issued: ${i}`].join('\n');

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

async function hdr(acct: typeof A, claim: string = acct.address, issuedAt = Date.now()) {
  const sig = await acct.signMessage({ message: msg(claim, issuedAt) });
  return { 'X-ArcLink-Auth': `${claim.toLowerCase()}.${issuedAt}.${sig}` };
}
const get = (p: string, h: Record<string, string> = {}) => fetch(BASE + p, { headers: h });
const send = (method: string, p: string, body: unknown, h: Record<string, string> = {}) =>
  fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body) });
const mkLink = (to: string, extra: object = {}) => ({
  id: 'sec-' + Math.random().toString(36).slice(2, 12), to, amount: '1.00',
  description: 'test', clientName: 'Private Client', chainId: 5042002, ...extra,
});

console.log('\n── Dashboard privacy ──');
const myLink = mkLink(A.address);
await send('POST', '/links', myLink, await hdr(A));
const dash = `/links/by/${A.address.toLowerCase()}`;
t('no sign-in cannot read dashboard', (await get(dash)).status === 401);
t('attacker cannot read victim dashboard', (await get(dash, await hdr(B))).status === 401);
t('forged address header rejected', (await get(dash, await hdr(B, A.address))).status === 401);
t('expired (13h) sign-in rejected', (await get(dash, await hdr(A, A.address, Date.now() - 13 * 3600e3))).status === 401);
t('future-dated sign-in rejected', (await get(dash, await hdr(A, A.address, Date.now() + 10 * 60e3))).status === 401);
const good = (await hdr(A))['X-ArcLink-Auth']!;
t('tampered signature rejected', (await get(dash, { 'X-ArcLink-Auth': good.slice(0, -3) + (good.endsWith('aaa') ? 'bbb' : 'aaa') })).status === 401);
t('garbage header rejected', (await get(dash, { 'X-ArcLink-Auth': 'hello' })).status === 401);
const mine = await get(dash, await hdr(A));
t('owner can read own dashboard', mine.status === 200);
const rows = (await mine.json()) as { id: string; clientName: string }[];
t('owner sees private client name', rows.find((r) => r.id === myLink.id)?.clientName === 'Private Client');

console.log('\n── Creating links ──');
t('create without sign-in refused', (await send('POST', '/links', mkLink(A.address))).status === 401);
t("attacker cannot create a link paying victim's address", (await send('POST', '/links', mkLink(A.address), await hdr(B))).status === 403);
t('forged creation refused', (await send('POST', '/links', mkLink(A.address), await hdr(B, A.address))).status === 401);
t('owner can create', (await send('POST', '/links', mkLink(A.address), await hdr(A))).status === 200);
const dup = await send('POST', '/links', myLink, await hdr(A));
t('re-using an existing link id is refused (409)', dup.status === 409, `status ${dup.status}`);
const after = await (await get('/links/' + myLink.id)).json() as { amount: string };
t('original link unchanged after duplicate attempt', after.amount === '1.00');

console.log('\n── What a payer can see ──');
const pub = await (await get('/links/' + myLink.id)).json() as { clientName: string; description: string };
t('payer view hides private client name', pub.clientName === '');
t('payer view still has the description', pub.description === 'test');

console.log('\n── Creator display names ──');
const nameUrl = `/creators/${A.address.toLowerCase()}`;
t('anyone can read a name', (await get(nameUrl)).status === 200);
t('set name without sign-in refused', (await send('PUT', nameUrl, { displayName: 'Evil' })).status === 401);
t("attacker cannot set victim's name", (await send('PUT', nameUrl, { displayName: 'Evil' }, await hdr(B))).status === 401);
t('owner can set name', (await send('PUT', nameUrl, { displayName: 'Areeb' }, await hdr(A))).status === 200);
const ctrl = await (await send('PUT', nameUrl, { displayName: 'A\u0000B\u001bC\nD' }, await hdr(A))).json() as { displayName: string };
t('control characters stripped from names', ctrl.displayName === 'A B C D', JSON.stringify(ctrl.displayName));
const longName = await (await send('PUT', nameUrl, { displayName: 'x'.repeat(500) }, await hdr(A))).json() as { displayName: string };
t('name length capped at 60', longName.displayName.length === 60);
t('empty name rejected', (await send('PUT', nameUrl, { displayName: '   ' }, await hdr(A))).status === 400);
t('non-text name rejected', (await send('PUT', nameUrl, { displayName: 123 }, await hdr(A))).status === 400);

console.log('\n── Fake payment claims ──');
const payLink = mkLink(A.address);
await send('POST', '/links', payLink, await hdr(A));
const fakeHash = '0x' + 'ab'.repeat(32);
const claim = await send('POST', `/links/${payLink.id}/paid`, { txHash: fakeHash });
t('made-up transaction hash is NOT accepted as payment', claim.status >= 400, `status ${claim.status}`);
const still = await (await get('/links/' + payLink.id)).json() as { verified: boolean };
t('link stays unpaid after the fake claim', still.verified === false);
t('paying a link that does not exist -> 404', (await send('POST', '/links/no-such-link/paid', { txHash: fakeHash })).status === 404);
t('missing txHash rejected', (await send('POST', `/links/${payLink.id}/paid`, {})).status === 400);

console.log('\n── Hostile input ──');
t("SQL-injection style id returns 404, not data", (await get("/links/' OR '1'='1")).status === 404);
t('bad address in dashboard path -> error', (await get('/links/by/0x123', await hdr(A))).status >= 400);
t('bad address in creators path -> 400', (await get('/creators/0x123')).status === 400);
t('broken JSON body -> 400, not a crash', (await fetch(BASE + '/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' })).status === 400);
t('server still alive afterwards', (await get('/links/' + myLink.id)).status === 200);

console.log('\n── Flooding (keep this section LAST: it uses up the per-minute allowance) ──');
// Fire all 25 at once, like a flooding script would
const flood = await Promise.all(
  Array.from({ length: 25 }, (_, i) =>
    send('POST', `/links/${payLink.id}/paid`, { txHash: '0x' + i.toString(16).padStart(64, '0') }),
  ),
);
const limited = flood.filter((r) => r.status === 429).length;
const retryAfter = flood.find((r) => r.status === 429)?.headers.get('retry-after') ?? '';
t('25 rapid fake payment claims get cut off (429)', limited >= 10, `${limited} of 25 refused`);
t('refusal says how long to wait (Retry-After)', Number(retryAfter) > 0, `${retryAfter}s`);
t('normal reads still work for others/other kinds of request', (await get('/links/' + myLink.id)).status === 200);

console.log(`\n${pass} passed, ${fail} failed`);
console.log('(If you run this again, wait 60 seconds first: the flooding test uses up the limit.)');
process.exit(fail ? 1 : 0);
