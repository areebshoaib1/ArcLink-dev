/**
 * Draws the receipt as a PNG image (no libraries needed) so "Download Receipt"
 * gives a real, shareable file that looks like the receipt screen.
 */
export interface ReceiptImageData {
  headline: string;      // e.g. "You received $0.01 USDC from 0xef1e…8052"
  amount: string;        // e.g. "0.01"
  description: string;
  from: string;          // full address
  to: string;            // full address
  toName: string | null; // creator display name, if any
  network: string;
  txHash: string;
  time: string;          // already formatted
}

const W = 640;
const PAD = 40;
const INNER = 20;
const LABEL_W = 130;
const LINE = 20;
const SCALE = 2; // 2x for a sharp image on phones
const SANS = '"Segoe UI", -apple-system, Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, Menlo, Consolas, "Courier New", monospace';
const NAVY = '#1d3156';
const MUTED = '#64748b';
const TEXT = '#0f172a';

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  const push = () => { if (line) out.push(line); line = ''; };
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width <= maxW) { line = trial; continue; }
    push();
    if (ctx.measureText(word).width <= maxW) { line = word; continue; }
    // a single very long token (address, hash): break it by characters
    for (const ch of word) {
      if (ctx.measureText(line + ch).width > maxW) push();
      line += ch;
    }
  }
  push();
  return out.length ? out : [''];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function renderReceiptPng(d: ReceiptImageData): Promise<Blob | null> {
  const rows: { label: string; value: string; mono?: boolean; bold?: boolean }[] = [
    { label: 'Amount', value: `$${d.amount} USDC`, bold: true },
    { label: 'Description', value: d.description || '—', bold: true },
    { label: 'From', value: d.from || '—', mono: true },
    ...(d.toName
      ? [{ label: 'To', value: d.toName }, { label: '', value: d.to, mono: true }]
      : [{ label: 'To', value: d.to, mono: true }]),
    { label: 'Network', value: d.network },
    { label: 'Transaction hash', value: d.txHash, mono: true },
    { label: 'Time', value: d.time },
  ];
  const fontFor = (r: { mono?: boolean; bold?: boolean }) =>
    r.mono ? `12px ${MONO}` : `${r.bold ? '600 ' : ''}14px ${SANS}`;

  // First pass: measure, so the image is exactly as tall as it needs to be
  const m = document.createElement('canvas').getContext('2d')!;
  const valueW = W - PAD * 2 - INNER * 2 - LABEL_W;
  const laid = rows.map((r) => {
    m.font = fontFor(r);
    return { ...r, lines: wrapText(m, r.value, valueW) };
  });
  m.font = `13px ${SANS}`;
  const headLines = wrapText(m, d.headline, W - PAD * 2);
  const headerH = 150 + headLines.length * 18;
  const cardPad = 18;
  const rowsH = laid.reduce((h, r) => h + r.lines.length * LINE + 14, 0);
  const cardH = rowsH + cardPad * 2 - 14;
  const H = headerH + cardH + 90;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // success tick
  ctx.fillStyle = '#22c55e';
  ctx.beginPath(); ctx.arc(W / 2, 62, 28, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(W / 2 - 12, 62); ctx.lineTo(W / 2 - 3, 71); ctx.lineTo(W / 2 + 13, 53); ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = TEXT; ctx.font = `700 24px ${SANS}`;
  ctx.fillText('Payment Complete', W / 2, 124);
  ctx.fillStyle = MUTED; ctx.font = `13px ${SANS}`;
  headLines.forEach((l, i) => ctx.fillText(l, W / 2, 150 + i * 18));

  // detail card
  const cardY = headerH;
  ctx.fillStyle = '#eef3fc';
  roundRect(ctx, PAD, cardY, W - PAD * 2, cardH, 16); ctx.fill();
  let y = cardY + cardPad + 14;
  for (const r of laid) {
    ctx.textAlign = 'left'; ctx.fillStyle = MUTED; ctx.font = `13px ${SANS}`;
    ctx.fillText(r.label, PAD + INNER, y);
    ctx.textAlign = 'right'; ctx.fillStyle = TEXT; ctx.font = fontFor(r);
    r.lines.forEach((l, i) => ctx.fillText(l, W - PAD - INNER, y + i * LINE));
    y += r.lines.length * LINE + 14;
  }

  // footer
  ctx.textAlign = 'center';
  ctx.fillStyle = MUTED; ctx.font = `12px ${SANS}`;
  ctx.fillText('This payment settled instantly on Arc. No intermediaries, no delays.', W / 2, cardY + cardH + 40);
  ctx.fillStyle = NAVY; ctx.font = `600 12px ${SANS}`;
  ctx.fillText('ArcLink', W / 2, cardY + cardH + 62);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
