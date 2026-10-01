import { useEffect, useState } from 'react';
import { isAllowedImageUrl } from '../core/images.ts';
import type { Item } from '../core/types.ts';
import { UnavailableImage } from './Illustration.tsx';
import styles from './ItemCard.module.css';

// Adjustable: how long an image gets before it counts as one that failed. A
// host that never answers fires no error, so without this the card would sit
// blank for as long as the browser cares to wait. Longer than the check the
// form asks the server for, which gives up at six seconds.
export const IMAGE_TIMEOUT = 10000;

interface ItemCardProps {
  item: Item;
  size?: 'lead' | 'row';
}

export function ItemCard({ item, size = 'row' }: ItemCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const url = item.imageUrl;
  // A link the text checks turn down is never requested, and ends up the same
  // as one that was and failed.
  const usable = url !== undefined && isAllowedImageUrl(url);

  useEffect(() => {
    if (!usable || imageLoaded || imageFailed) return;
    const timer = setTimeout(() => setImageFailed(true), IMAGE_TIMEOUT);
    return () => clearTimeout(timer);
  }, [usable, imageLoaded, imageFailed]);

  return (
    <div className={`${styles.card} ${styles[size]}`}>
      {url &&
        (usable && !imageFailed ? (
          // Decorative: the item's text sits right next to it and says the
          // same thing. So is the drawing that stands in for it.
          <img
            className={styles.image}
            src={url}
            alt=""
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <UnavailableImage className={styles.placeholder} />
        ))}
      <span className={styles.text}>{item.text}</span>
    </div>
  );
}
