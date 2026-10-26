/**
 * ArcLink logo: an original mark made for this project — two interlocking
 * chain links in white on an indigo-to-cyan rounded square. It is
 * deliberately NOT based on any other company's logo and contains no text.
 *
 * (The file and component names are kept as they were so every screen that
 * imports ArcLogoMark / ArcLogoSmall keeps working.)
 */

const TILE_BG = 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)';
const RADIUS = 0.234; // corner radius as a fraction of the tile size (15/64)

/** Two interlocking rounded links, drawn in a 64x64 box along the diagonal. */
function ChainGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="white" strokeWidth="4.5" strokeLinecap="round">
        <rect x="13.6" y="32.9" width="24" height="11" rx="5.5" transform="rotate(-45 25.6 38.4)" />
        <rect x="26.4" y="20.1" width="24" height="11" rx="5.5" transform="rotate(-45 38.4 25.6)" />
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
        background: TILE_BG,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <ChainGlyph size={size} />
    </div>
  );
}

export function ArcLogoMark({ size = 72 }: { size?: number }) {
  return <LogoTile size={size} />;
}

export function ArcLogoSmall({ size = 40 }: { size?: number }) {
  return <LogoTile size={size} />;
}
