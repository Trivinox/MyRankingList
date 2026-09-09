import { useTranslation } from 'react-i18next';
import type { Item } from '../core/types.ts';
import { ItemCard } from './ItemCard.tsx';
import styles from './PoolItem.module.css';

interface PoolItemProps {
  // Null once the pool runs out. There is nowhere to go from there yet, so the
  // area just says so.
  item: Item | null;
}

export function PoolItem({ item }: PoolItemProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.area}>
      {item ? (
        <>
          {/* Keyed so a card that failed to load an image does not keep that
              verdict when the next pool item takes its place. */}
          <ItemCard key={item.id} item={item} size="lead" />
          <p className={styles.hint}>{t('sorting.poolHint')}</p>
        </>
      ) : (
        <p className={styles.done}>{t('sorting.allPlaced')}</p>
      )}
    </div>
  );
}
