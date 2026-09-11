import { Fragment } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { dragSourceId, dropTargetId } from '../core/dropTargets.ts';
import type { DropOutcome, DropTarget } from '../core/dropTargets.ts';
import { rankItems } from '../core/ranking.ts';
import type { Item, RankedSlot } from '../core/types.ts';
import { ItemCard } from './ItemCard.tsx';
import styles from './RankedList.module.css';

// What a drop would do at the target under the cursor. Worked out by the screen
// that owns the drag and handed down, so the list never has to ask dnd-kit.
export interface DropPreview {
  targetId: string;
  outcome: DropOutcome;
}

interface RankedListProps {
  slots: RankedSlot[];
  items: Item[];
  preview?: DropPreview | null;
}

export function RankedList({ slots, items, preview }: RankedListProps) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const entries = rankItems(slots);
  let seen = 0;

  const outcomeAt = (target: DropTarget) =>
    preview?.targetId === dropTargetId(target) ? preview.outcome : undefined;

  return (
    <ol className={styles.list}>
      {slots.map((slot, index) => {
        // One entry per item, in list order, so a position takes the rank of
        // whichever item heads it and a tie leaves a number behind.
        const { rank } = entries[seen];
        seen += slot.itemIds.length;

        return (
          <Fragment key={slot.itemIds.join('+')}>
            <Gap index={index} outcome={outcomeAt({ kind: 'gap', index })} />
            <Slot
              index={index}
              rank={rank}
              items={slot.itemIds.flatMap((id) => byId.get(id) ?? [])}
              outcome={outcomeAt({ kind: 'slot', index })}
            />
          </Fragment>
        );
      })}
      <Gap index={slots.length} outcome={outcomeAt({ kind: 'gap', index: slots.length })} />
    </ol>
  );
}

// The strip an insertion aims at, between two positions and at either end of
// the list. Hidden from screen readers: it holds nothing to read, and reaching
// a position without a pointer is the selection method's job.
function Gap({ index, outcome }: { index: number; outcome?: DropOutcome }) {
  const id = dropTargetId({ kind: 'gap', index });
  const { setNodeRef } = useDroppable({ id });

  return (
    <li
      ref={setNodeRef}
      className={styles.gap}
      data-drop-target={id}
      data-outcome={outcome}
      aria-hidden="true"
    />
  );
}

interface SlotProps {
  index: number;
  rank: number;
  items: Item[];
  outcome?: DropOutcome;
}

// Two tied items share one container rather than getting a row each, so the
// list reads as one position holding both. The whole row is the tie target,
// rank number included, so the pointer never crosses a dead strip on its way
// from a gap to a card.
function Slot({ index, rank, items, outcome }: SlotProps) {
  const id = dropTargetId({ kind: 'slot', index });
  const { setNodeRef } = useDroppable({ id });

  return (
    <li ref={setNodeRef} className={styles.slot} data-drop-target={id} data-outcome={outcome}>
      <span className={styles.rank}>{rank}</span>
      <div className={styles.cards}>
        {items.map((item) => (
          <Placed key={item.id} item={item} />
        ))}
      </div>
    </li>
  );
}

// Draggable per card, not per position, so one half of a tie can leave while
// its partner keeps the position. The row stays in the list during the drag
// because the drop is resolved against the gaps the user can see. No
// `attributes`, for the same reason as the pool card.
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
