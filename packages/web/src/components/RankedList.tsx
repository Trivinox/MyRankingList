import { Fragment } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { dragSourceId, dropTargetId } from '../core/dropTargets.ts';
import type { DropOutcome, DropTarget } from '../core/dropTargets.ts';
import { rankItems } from '../core/ranking.ts';
import type { Item, RankedSlot } from '../core/types.ts';
import { ItemCard } from './ItemCard.tsx';
import styles from './RankedList.module.css';
import hidden from './visuallyHidden.module.css';

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
  // Left out while there is nothing to put down, which disables every target.
  onSelect?: (target: DropTarget) => void;
  onHover?: (target: DropTarget | null) => void;
}

export function RankedList({ slots, items, preview, onSelect, onHover }: RankedListProps) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const entries = rankItems(slots);
  let seen = 0;

  const outcomeAt = (target: DropTarget) =>
    preview?.targetId === dropTargetId(target) ? preview.outcome : undefined;

  const targetProps = (target: DropTarget) => ({
    outcome: outcomeAt(target),
    onSelect: onSelect && selectHandler(target, onSelect),
    hover: hoverHandlers(target, onHover),
  });

  return (
    <ol className={styles.list}>
      {slots.map((slot, index) => {
        // One entry per item, in list order, so a position takes the rank of
        // whichever item heads it and a tie leaves a number behind.
        const { rank, tied } = entries[seen];
        seen += slot.itemIds.length;

        return (
          <Fragment key={slot.itemIds.join('+')}>
            <Gap index={index} {...targetProps({ kind: 'gap', index })} />
            <Slot
              index={index}
              rank={rank}
              tied={tied}
              items={slot.itemIds.flatMap((id) => byId.get(id) ?? [])}
              {...targetProps({ kind: 'slot', index })}
            />
          </Fragment>
        );
      })}
      <Gap index={slots.length} {...targetProps({ kind: 'gap', index: slots.length })} />
    </ol>
  );
}

// The first click of a double-click places the item and the list moves under
// the pointer, so the second would land on whatever took its place and put the
// next pool item there as well. A keyboard press counts no clicks at all.
function selectHandler(target: DropTarget, onSelect: (target: DropTarget) => void) {
  return (event: MouseEvent) => {
    if (event.detail <= 1) {
      onSelect(target);
    }
  };
}

// Hover only previews for a mouse. A finger fires enter and leave around the
// tap itself, and the leave would wipe the red a refused tap has just left.
function hoverHandlers(target: DropTarget, onHover?: (target: DropTarget | null) => void) {
  if (!onHover) {
    return {};
  }
  return {
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') {
        onHover(target);
      }
    },
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') {
        onHover(null);
      }
    },
  };
}

interface TargetProps {
  index: number;
  outcome?: DropOutcome;
  onSelect?: (event: MouseEvent) => void;
  hover: ReturnType<typeof hoverHandlers>;
}

// The strip an insertion aims at, between two positions and at either end of
// the list. The button fills it, so a click anywhere on the strip counts.
//
// With nothing to put down, a target only says it is disabled through
// aria-disabled. The real attribute drops focus, and after the last placement
// made from the keyboard the user would be left nowhere.
function Gap({ index, outcome, onSelect, hover }: TargetProps) {
  const { t } = useTranslation();
  const id = dropTargetId({ kind: 'gap', index });
  const { setNodeRef } = useDroppable({ id });

  return (
    <li ref={setNodeRef} className={styles.gap} data-drop-target={id} data-outcome={outcome}>
      <button
        type="button"
        className={styles.gapButton}
        aria-disabled={!onSelect}
        aria-label={t('sorting.select.gap', { position: index + 1 })}
        onClick={onSelect}
        {...hover}
      />
    </li>
  );
}

interface SlotProps extends TargetProps {
  rank: number;
  tied: boolean;
  items: Item[];
}

// Two tied items share one container rather than getting a row each, so the
// list reads as one position holding both. The whole row is the tie target,
// rank number included, so the pointer never crosses a dead strip on its way
// from a gap to a card.
//
// The click goes on the row for the same reason. The rank is a button with no
// handler of its own, there so a keyboard can reach the position: its click
// bubbles up to the row like any other.
function Slot({ index, rank, tied, items, outcome, onSelect, hover }: SlotProps) {
  const { t, i18n } = useTranslation();
  const id = dropTargetId({ kind: 'slot', index });
  const { setNodeRef } = useDroppable({ id });
  const names = new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(
    items.map((item) => item.text),
  );

  return (
    <li
      ref={setNodeRef}
      className={styles.slot}
      data-drop-target={id}
      data-outcome={outcome}
      onClick={onSelect}
      {...hover}
    >
      <button
        type="button"
        className={styles.rank}
        aria-disabled={!onSelect}
        aria-label={t('sorting.select.tie', { item: names })}
      >
        {rank}
      </button>
      {/* The shared container and the repeated number carry the tie on screen,
          so this is only here for the readers that see neither. It sits ahead
          of the cards so the position is announced as a tie before its items. */}
      {tied ? <span className={hidden.text}>{t('sorting.tied')}</span> : null}
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
