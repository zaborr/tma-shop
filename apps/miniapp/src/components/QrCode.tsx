import { useMemo } from 'react';
import { encodeQr } from '../lib/qr.js';

/** A QR code drawn as SVG (black on white, with the quiet zone scanners need). */
export function QrCode({ text, size = 220 }: { text: string; size?: number }): React.JSX.Element {
  const { path, dimension } = useMemo(() => {
    const modules = encodeQr(text);
    const quiet = 4;
    let d = '';
    modules.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x + quiet},${y + quiet}h1v1h-1z`;
      }),
    );
    return { path: d, dimension: modules.length + quiet * 2 };
  }, [text]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${dimension} ${dimension}`}
      shapeRendering="crispEdges"
      role="img"
      style={{ background: '#fff', borderRadius: 8 }}
    >
      <path d={path} fill="#000" />
    </svg>
  );
}
