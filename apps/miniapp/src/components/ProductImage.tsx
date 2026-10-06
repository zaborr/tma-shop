import { useState } from 'react';

/**
 * Product photo from its `imageUrl`. Renders nothing when there is no URL or
 * the image fails to load (e.g. the external host removed it), so a broken
 * link never shows a broken-image icon in the shop.
 */
export function ProductImage({
  url,
  alt,
  size,
}: {
  url: string | null;
  alt: string;
  /** Square thumbnail size in px; omit for a full-width banner. */
  size?: number;
}): React.JSX.Element | null {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;

  const style: React.CSSProperties =
    size === undefined
      ? { display: 'block', width: '100%', maxHeight: 320, objectFit: 'cover' }
      : { display: 'block', width: size, height: size, objectFit: 'cover', borderRadius: 10 };

  return (
    <img src={url} alt={alt} loading="lazy" style={style} onError={() => setFailed(true)} />
  );
}
