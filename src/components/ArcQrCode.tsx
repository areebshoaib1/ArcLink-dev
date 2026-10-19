import { QRCodeSVG } from 'qrcode.react';
import { ArcLogoSmall } from './ArcLogo';

/**
 * Payment QR code with the Arc logo in the centre (matches the Figma design).
 *
 * The logo is a real React component (not an image URL), so it is drawn as an
 * overlay on top of the QR instead of using qrcode.react's `imageSettings`.
 * That overlay is what was missing in the testnet build: the centre was left
 * blank for a logo that never rendered.
 *
 * Error-correction level "H" lets the code survive ~30% damage, so the covered
 * centre (about 5-7% of the area) still scans reliably.
 *
 * Requires: npm i qrcode.react
 */
export function ArcQrCode({
  value,
  size = 176,
}: {
  value: string;
  size?: number;
}) {
  const logoSize = Math.round(size * 0.22); // logo tile ≈ 22% of the QR width
  const pad = Math.max(4, Math.round(size * 0.025)); // white ring around the logo

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        lineHeight: 0,
      }}
    >
      <QRCodeSVG
        value={value}
        size={size}
        level="H"
        bgColor="#ffffff"
        fgColor="#000000"
      />

      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          padding: pad,
          background: '#ffffff',
          borderRadius: Math.round((logoSize + pad * 2) * 0.24),
          lineHeight: 0,
        }}
      >
        <ArcLogoSmall size={logoSize} />
      </div>
    </div>
  );
}
