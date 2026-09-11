import { useDraggable } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { POOL_DRAG_ID } from '../core/dropTargets.ts';
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
          <Handle key={item.id} item={item} />
          <p className={styles.hint}>{t('sorting.poolHint')}</p>
        </>
      ) : (
        <p className={styles.done}>{t('sorting.allPlaced')}</p>
      )}
    </div>
  );
}

// The card stays in the area while it is dragged and the overlay is what
// follows the cursor, so this dims rather than moves.
//
// dnd-kit's `attributes` are deliberately not spread on it: they turn the card
// into a focusable button described by instructions for picking it up with the
// space bar, and no sensor here would answer. Placing without a pointer means
// clicking a position in the list, so it is never this card's job.
function Handle({ item }: { item: Item }) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: POOL_DRAG_ID });

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? `${styles.handle} ${styles.lifted}` : styles.handle}
      data-drag-id={POOL_DRAG_ID}
      {...listeners}
    >
      <ItemCard item={item} size="lead" />
    </div>
  );
}
