/**
 * ArcLink logo: an original mark made for this project — two interlocking
 * chain links on a teal rounded square. It is deliberately NOT based on any
 * other company's logo.
 *
 * (The file and component names are kept as they were so every screen that
 * imports ArcLogoMark / ArcLogoSmall keeps working.)
 */

const TILE = '#0f766e'; // teal
const RADIUS = 0.2;     // corner radius as a fraction of the tile size

/** Two rounded links, drawn in a 64x64 box, rotated so the chain runs diagonally. */
function ChainGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <g
        transform="rotate(-45 32 32)"
        stroke="white"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="6" y="23" width="30" height="18" rx="9" />
        <rect x="28" y="23" width="30" height="18" rx="9" />
      </g>
    </svg>
  );
}

function LogoTile({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * RADIUS),
        background: TILE,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <ChainGlyph size={Math.round(size * 0.72)} />
    </div>
  );
}

export function ArcLogoMark({ size = 72 }: { size?: number }) {
  return <LogoTile size={size} />;
}

export function ArcLogoSmall({ size = 40 }: { size?: number }) {
  return <LogoTile size={size} />;
}
