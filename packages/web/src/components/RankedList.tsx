import { Fragment } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { dragSourceId, dropTargetId } from '../core/dropTargets.ts';
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
      {slots.map((slot, index) => {
        // One entry per item, in list order, so a position takes the rank of
        // whichever item heads it and a tie leaves a number behind.
        const { rank } = entries[seen];
        seen += slot.itemIds.length;

        return (
          <Fragment key={slot.itemIds.join('+')}>
            <Gap index={index} />
            <Slot rank={rank} items={slot.itemIds.flatMap((id) => byId.get(id) ?? [])} />
          </Fragment>
        );
      })}
      <Gap index={slots.length} />
    </ol>
  );
}

// The strip an insertion aims at, between two positions and at either end of
// the list. Hidden from screen readers: it holds nothing to read, and reaching
// a position without a pointer is the selection method's job.
function Gap({ index }: { index: number }) {
  const id = dropTargetId({ kind: 'gap', index });
  const { setNodeRef } = useDroppable({ id });

  return <li ref={setNodeRef} className={styles.gap} data-drop-target={id} aria-hidden="true" />;
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
          <Placed key={item.id} item={item} />
        ))}
      </div>
    </li>
  );
}

// Each card is picked up on its own, so dragging one half of a tie dims that
// half and leaves its partner solid, which is what the drop will do to them.
// The row stays in the list meanwhile: the gaps around it are the ones the
// user sees, and the drop is resolved against those. No `attributes`, for the
// same reason as the pool card.
function Placed({ item }: { item: Item }) {
  const id = dragSourceId({ from: 'placed', itemId: item.id });
  const { listeners, setNodeRef, isDragging } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? `${styles.handle} ${styles.lifted}` : styles.handle}
      data-drag-id={id}
      {...listeners}
    >
      <ItemCard item={item} />
    </div>
  );
}
