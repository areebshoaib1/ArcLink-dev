/**
 * ArcLink logo mark: navy rounded square with a white filled arch.
 *
 * The glyph outline was traced directly from the reference image and fitted
 * with cubic Béziers (≈98% pixel overlap with the reference):
 *   - Thick left leg with a flat base, leaning slightly outward
 *   - Rounded apex, a little left of centre
 *   - Right leg sweeps down into a curved foot that ends in a sharp point
 *   - A separate wedge ("crossbar") inside the arch; the gap between it and
 *     the left leg is where the hollow opens to the navy tile
 *
 * Tile: #1d3156, corner radius 20% of the tile size.
 * Glyph: ~55% of the tile height, centred (with a ~1px downward nudge to
 * match the reference).
 */

const NAVY = '#1d3156';

// Glyph geometry (viewBox units, traced from the reference).
const VB_W = 104.5;
const VB_H = 107.6;
const GLYPH_PATH =
  'M 0.2 107.4 L 21.2 107.4 ' +
  // inner edge of left leg, up and over the inner apex, down the right side
  'C 23.2 84.5, 25.1 61.4, 35 40.4 ' +
  'C 37.5 35.1, 40.2 29.8, 44.2 25.5 ' +
  'C 45.7 23.9, 47.2 22, 49.4 21.2 ' +
  'C 56.6 18.9, 61.5 26.5, 64.8 31.6 ' +
  'C 73.2 44.9, 77.5 61, 80 76.2 ' +
  // top edge of the wedge, back left to its inner end
  'C 68.9 75.6, 57.1 73.3, 45.4 74.6 ' +
  // wedge's left edge, then its underside sweeping right to the point
  'C 44.3 81.1, 42.7 87.9, 42.4 94.5 ' +
  'C 52.7 94.8, 63.7 93.9, 74.1 96.2 ' +
  'C 84.6 98.6, 94.7 103.1, 104.2 107.2 ' +
  // outer edge of right leg, up and over the outer apex, down the left leg
  'C 104.2 79.6, 98.5 51.9, 86.2 27.4 ' +
  'C 80.1 15, 69.3 0.8, 54.2 0 ' +
  'C 39.2 -0.8, 29.3 9.9, 21.5 21.5 ' +
  'C 14.8 31.5, 10.9 42.6, 7.8 54.1 ' +
  'C 3 71.4, 0.2 89.2, 0.2 107.4 Z';

function LogoTile({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.2),
        background: NAVY,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <ArchSvg tileSize={size} />
    </div>
  );
}

export function ArcLogoMark({ size = 72 }: { size?: number }) {
  return <LogoTile size={size} />;
}

export function ArcLogoSmall({ size = 40 }: { size?: number }) {
  return <LogoTile size={size} />;
}

// Placement fitted against the reference (fractions of the tile size).
const GLYPH_HEIGHT = 0.548; // glyph height / tile height
const GLYPH_DX = -0.0026; // tiny nudge left
const GLYPH_DY = 0.0051; // tiny nudge down (the reference sits ~1px low)

/** White arch glyph, sized relative to the tile it sits in. */
function ArchSvg({ tileSize }: { tileSize: number }) {
  const height = tileSize * GLYPH_HEIGHT;
  const width = height * (VB_W / VB_H);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      overflow="visible"
      fill="none"
      aria-hidden="true"
      style={{
        transform: `translate(${tileSize * GLYPH_DX}px, ${tileSize * GLYPH_DY}px)`,
      }}
    >
      <path fill="white" d={GLYPH_PATH} />
    </svg>
  );
}
