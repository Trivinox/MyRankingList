import { useState } from 'react';
import { isAllowedImageUrl } from '../core/images.ts';
import type { Item } from '../core/types.ts';
import styles from './ItemCard.module.css';

interface ItemCardProps {
  item: Item;
  size?: 'lead' | 'row';
}

export function ItemCard({ item, size = 'row' }: ItemCardProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const url = item.imageUrl;
  const showImage = url !== undefined && isAllowedImageUrl(url);

  return (
    <div className={`${styles.card} ${styles[size]}`}>
      {showImage &&
        (imageFailed ? (
          <div className={styles.placeholder} />
        ) : (
          // Decorative: the item's text sits right next to it and says the
          // same thing.
          <img className={styles.image} src={url} alt="" onError={() => setImageFailed(true)} />
        ))}
      <span className={styles.text}>{item.text}</span>
    </div>
  );
}
