import { useDraggable } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { dragSourceId } from '../core/dropTargets.ts';
import type { Item } from '../core/types.ts';
import { ItemCard } from './ItemCard.tsx';
import styles from './PoolItem.module.css';

interface PoolItemProps {
  // Null once the pool runs out, when the area offers the result instead.
  item: Item | null;
  // A placed item picked up with its move button. The next tap in the list is
  // for it, not for the pool item, and the hint has to say so.
  held?: Item | null;
  onRelease?: () => void;
  onFinish?: () => void;
  // A room has no result of one person's to show, so an empty pool there only
  // says the list can still change.
  inRoom?: boolean;
  // On a phone the list is the main element, so the card shrinks to a row and
  // is only ever placed by tapping.
  mobile?: boolean;
}

export function PoolItem({
  item,
  held,
  onRelease,
  onFinish,
  inRoom = false,
  mobile = false,
}: PoolItemProps) {
  const { t } = useTranslation();
  const hint = held ? t('sorting.select.heldHint', { item: held.text }) : t('sorting.poolHint');

  // Tapping the area hands the next tap back to the pool item. It stays a
  // pointer shortcut: from the keyboard, Escape or the move button again do
  // the same.
  return (
    <div
      className={held ? `${styles.area} ${styles.releasing}` : styles.area}
      onClick={held ? onRelease : undefined}
    >
      {item ? (
        <>
          {/* Keyed so a card that failed to load an image does not keep that
              verdict when the next pool item takes its place. */}
          <Handle key={item.id} item={item} dimmed={Boolean(held)} mobile={mobile} />
          <p className={styles.hint}>{hint}</p>
        </>
      ) : inRoom ? (
        <p className={styles.hint}>{held ? hint : t('sorting.allPlacedInRoom')}</p>
      ) : (
        <>
          {/* Leaving now would drop the held item without a word, so the
              button waits for it to be put down. aria-disabled rather than
              disabled keeps it in the tab order. Its click stops here: left
              to reach the area it would put the item back, which a button
              that says it is off should not do. */}
          <button
            type="button"
            className={styles.finish}
            aria-disabled={Boolean(held)}
            onClick={(event) => {
              if (held) {
                event.stopPropagation();
                return;
              }
              onFinish?.();
            }}
          >
            {t('sorting.seeResult')}
          </button>
          {held ? <p className={styles.hint}>{hint}</p> : null}
        </>
      )}
    </div>
  );
}

// The card stays in the area while it is dragged and the overlay is what
// follows the cursor, so this dims rather than moves. It dims the same way
// while a placed item is held, being out of play until that one is put down.
//
// dnd-kit's `attributes` are deliberately not spread on it: they turn the card
// into a focusable button described by instructions for picking it up with the
// space bar, and no sensor here would answer. Placing without a pointer means
// clicking a position in the list, so it is never this card's job.
function Handle({ item, dimmed, mobile }: { item: Item; dimmed: boolean; mobile: boolean }) {
  const id = dragSourceId({ from: 'pool' });
  const { listeners, setNodeRef, isDragging } = useDraggable({ id, disabled: mobile });

  const className = [
    styles.handle,
    !mobile && styles.draggable,
    (isDragging || dimmed) && styles.lifted,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={setNodeRef} className={className} data-drag-id={id} {...listeners}>
      <ItemCard item={item} size={mobile ? 'row' : 'lead'} />
    </div>
  );
}
