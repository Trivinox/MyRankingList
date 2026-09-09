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
  const entries = rankItems(slots);
  let seen = 0;

  return (
    <ol className={styles.list}>
      {slots.map((slot) => {
        // One entry per item, in list order, so a position takes the rank of
        // whichever item heads it and a tie leaves a number behind.
        const { rank } = entries[seen];
        seen += slot.itemIds.length;

        return (
          <Fragment key={slot.itemIds.join('+')}>
            <Gap />
            <Slot rank={rank} items={slot.itemIds.flatMap((id) => byId.get(id) ?? [])} />
          </Fragment>
        );
      })}
      <Gap />
    </ol>
  );
}

// The strip an insertion aims at, between two positions and at either end of
// the list. Hidden from screen readers: it holds nothing to read, and reaching
// a position without a pointer is the selection method's job.
function Gap() {
  return <li className={styles.gap} aria-hidden="true" />;
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
