import { Fragment } from 'react';
import { rankItems } from '../core/ranking.ts';
import type { Item, RankedSlot } from '../core/types.ts';
import { ItemCard } from './ItemCard.tsx';
import styles from './RankedList.module.css';

interface RankedListProps {
  slots: RankedSlot[];
  items: Item[];
}

export function RankedList({ slots, items }: RankedListProps) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ranks = new Map(rankItems(slots).map((entry) => [entry.itemId, entry.rank]));

  return (
    <ol className={styles.list}>
      {slots.map((slot, index) => (
        <Fragment key={slot.itemIds.join('+')}>
          <Gap index={index} />
          <Slot
            rank={ranks.get(slot.itemIds[0]) ?? index + 1}
            items={slot.itemIds.flatMap((id) => byId.get(id) ?? [])}
          />
        </Fragment>
      ))}
      <Gap index={slots.length} />
    </ol>
  );
}

// The strip between two positions, and above the first and below the last. It
// is where an insertion aims, so it stays visible instead of collapsing into
// the list's spacing. Skipped by screen readers: it carries no content of its
// own, and the equivalent for the keyboard comes with the selection method.
function Gap({ index }: { index: number }) {
  return <li className={styles.gap} aria-hidden="true" data-gap={index} />;
}

interface SlotProps {
  rank: number;
  items: Item[];
}

// Two tied items share one container rather than getting a row each, so the
// list reads as one position holding both.
function Slot({ rank, items }: SlotProps) {
  return (
    <li className={styles.slot}>
      <span className={styles.rank}>{rank}</span>
      <div className={styles.cards}>
        {items.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </div>
    </li>
  );
}
