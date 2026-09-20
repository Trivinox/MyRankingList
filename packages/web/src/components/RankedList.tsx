import { Fragment, useEffect } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useAnimate } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { dragSourceId, dropTargetId } from '../core/dropTargets.ts';
import type { DropOutcome, DropTarget } from '../core/dropTargets.ts';
import { rankItems } from '../core/ranking.ts';
import type { Item, RankedSlot } from '../core/types.ts';
import { Burst } from './Burst.tsx';
import { ItemCard } from './ItemCard.tsx';
import styles from './RankedList.module.css';
import hidden from './visuallyHidden.module.css';

// What a drop would do at the target under the cursor. Worked out by the screen
// that owns the drag and handed down, so the list never has to ask dnd-kit.
export interface DropPreview {
  targetId: string;
  outcome: DropOutcome;
}

// What the last drop or tap did, and to which position. The key is new on
// every one, so two drops in a row on the same position both play.
export interface Feedback {
  outcome: DropOutcome;
  slot: number;
  key: number;
}

interface RankedListProps {
  slots: RankedSlot[];
  items: Item[];
  preview?: DropPreview | null;
  feedback?: Feedback | null;
  // Left out while there is nothing to put down, which disables every target.
  onSelect?: (target: DropTarget) => void;
  onHover?: (target: DropTarget | null) => void;
  // The placed item picked up for a tap, if any. The pool item is in hand
  // otherwise, and nothing here needs to know which one that is.
  held?: string | null;
  onPickUp: (itemId: string) => void;
  // Off on a phone, where a finger on a card has to scroll the page.
  draggable?: boolean;
}

export function RankedList({
  slots,
  items,
  preview,
  feedback,
  onSelect,
  onHover,
  held,
  onPickUp,
  draggable = true,
}: RankedListProps) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const entries = rankItems(slots);
  let seen = 0;

  const outcomeAt = (target: DropTarget) =>
    preview?.targetId === dropTargetId(target) ? preview.outcome : undefined;

  const targetProps = (target: DropTarget) => ({
    outcome: outcomeAt(target),
    onSelect: onSelect && selectHandler(target, onSelect),
    hover: hoverHandlers(target, null, onHover),
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
              held={held}
              onPickUp={onPickUp}
              draggable={draggable}
              feedback={feedback?.slot === index ? feedback : undefined}
              // Hovering the move button leaves the row, as far as the preview
              // goes: pressing it picks the card up, it never ties anything.
              moveHover={hoverHandlers(null, { kind: 'slot', index }, onHover)}
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
//
// Only the mouse is held to that. A finger has to leave the screen and come
// back for the second tap, which makes it a placement the user meant, and the
// browser counts two quick taps on the same spot as a double-tap all the same:
// the item after this one often goes into the same position, and it was being
// dropped without a word.
function selectHandler(target: DropTarget, onSelect: (target: DropTarget) => void) {
  return (event: MouseEvent) => {
    // Read off the click rather than a pointer event of its own: a click with
    // no pointer behind it, from the keyboard or a test, counts no taps and
    // is left to the rule above.
    const { pointerType } = event.nativeEvent as globalThis.PointerEvent;
    if (event.detail <= 1 || pointerType === 'touch' || pointerType === 'pen') {
      onSelect(target);
    }
  };
}

// Hover only previews for a mouse. A finger fires enter and leave around the
// tap itself, and the leave would wipe the red a refused tap has just left.
function hoverHandlers(
  enter: DropTarget | null,
  leave: DropTarget | null,
  onHover?: (target: DropTarget | null) => void,
) {
  if (!onHover) {
    return {};
  }
  return {
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') {
        onHover(enter);
      }
    },
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') {
        onHover(leave);
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
  held?: string | null;
  onPickUp: (itemId: string) => void;
  draggable: boolean;
  feedback?: Feedback;
  moveHover: ReturnType<typeof hoverHandlers>;
}

// Two tied items share one container rather than getting a row each, so the
// list reads as one position holding both. The whole row is the tie target,
// rank number included, so the pointer never crosses a dead strip on its way
// from a gap to a card.
//
// The click goes on the row for the same reason. The rank is a button with no
// handler of its own, there so a keyboard can reach the position: its click
// bubbles up to the row like any other.
function Slot({
  index,
  rank,
  tied,
  items,
  outcome,
  onSelect,
  hover,
  held,
  onPickUp,
  draggable,
  feedback,
  moveHover,
}: SlotProps) {
  const { t, i18n } = useTranslation();
  const id = dropTargetId({ kind: 'slot', index });
  const { setNodeRef } = useDroppable({ id });
  const [cards, animate] = useAnimate<HTMLDivElement>();
  const verdict = feedback?.outcome;
  const played = feedback?.key;

  // The rows themselves are never animated into place. dnd-kit measures the
  // same nodes, and a layout animation moving them under it makes the list
  // jump; a settle on the one position that changed shows where the item went.
  useEffect(() => {
    if (played === undefined) {
      return;
    }
    if (verdict === 'rejected') {
      animate(cards.current, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.35 });
    } else {
      animate(cards.current, { scale: [0.96, 1] }, { duration: 0.25, ease: 'easeOut' });
    }
  }, [animate, cards, verdict, played]);

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
      <div ref={cards} className={styles.cards}>
        {feedback && feedback.outcome !== 'rejected' ? (
          <Burst key={feedback.key} variant={feedback.outcome} />
        ) : null}
        {items.map((item) => (
          <Placed
            key={item.id}
            item={item}
            held={item.id === held}
            onPickUp={onPickUp}
            draggable={draggable}
            hover={moveHover}
          />
        ))}
      </div>
    </li>
  );
}

interface PlacedProps {
  item: Item;
  held: boolean;
  onPickUp: (itemId: string) => void;
  draggable: boolean;
  hover: ReturnType<typeof hoverHandlers>;
}

// Draggable per card, not per position, so one half of a tie can leave while
// its partner keeps the position. The row stays in the list during the drag
// because the drop is resolved against the gaps the user can see. No
// `attributes`, for the same reason as the pool card.
//
// The move button is the way to pick a card up without dragging it. A tap on
// the card itself already means tying the pool item with it, so the button
// sits beside the card rather than on it, and its click stops before the row.
function Placed({ item, held, onPickUp, draggable, hover }: PlacedProps) {
  const { t } = useTranslation();
  const id = dragSourceId({ from: 'placed', itemId: item.id });
  const { listeners, setNodeRef, isDragging } = useDraggable({ id, disabled: !draggable });

  // Only the first click of a double-click counts, as on the targets. The
  // second would put the card straight back, and it would look as if the
  // button had done nothing.
  const pickUp = (event: MouseEvent) => {
    event.stopPropagation();
    if (event.detail <= 1) {
      onPickUp(item.id);
    }
  };

  return (
    <div className={styles.placed}>
      <div
        ref={setNodeRef}
        className={[
          styles.handle,
          draggable && styles.draggable,
          (isDragging || held) && styles.lifted,
        ]
          .filter(Boolean)
          .join(' ')}
        data-drag-id={id}
        {...listeners}
      >
        <ItemCard item={item} />
      </div>
      <button
        type="button"
        className={styles.move}
        aria-label={t('sorting.select.moveItem', { item: item.text })}
        aria-pressed={held}
        onClick={pickUp}
        {...hover}
      >
        {t('sorting.select.move')}
      </button>
    </div>
  );
}
