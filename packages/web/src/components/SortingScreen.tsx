import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  Announcements,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  Modifier,
} from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import {
  describeDrop,
  dragSourceId,
  dropTargetId,
  landingSlot,
  listWhileLifted,
  parseDragSource,
  parseDropTarget,
} from '../core/dropTargets.ts';
import type { DragSource, DropTarget } from '../core/dropTargets.ts';
import type { RankedSlot } from '../core/types.ts';
import { usePlacement } from '../state/placementStore.ts';
import { Announcer } from './Announcer.tsx';
import { useAnnouncer } from './useAnnouncer.ts';
import { useIsMobile } from './useIsMobile.ts';
import { ItemCard } from './ItemCard.tsx';
import { PoolItem } from './PoolItem.tsx';
import { ProgressBar } from './ProgressBar.tsx';
import { RankedList } from './RankedList.tsx';
import type { DropPreview } from './RankedList.tsx';
import styles from './SortingScreen.module.css';

// dnd-kit's stock instructions explain a keyboard drag, and only the pointer
// sensor is wired here. Blanked rather than just left unreferenced, since they
// are rendered into the page whether or not anything points at them.
const noInstructions = { draggable: '' };

// The announcing is done through our own region, which queues, so dnd-kit's is
// left empty rather than racing it. Its defaults have to be overridden for
// that: left alone it reads out ids of its own accord.
const noAnnouncements: Announcements = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

// dnd-kit sizes the overlay after the node that was picked up, and both of
// them are wide: the pool card is a screenful and a placed row spans the list.
// Carried at that size the card covered the very target whose preview it was
// meant to show, so the sizing is dropped and the card inside decides.
const unsized = { width: 'auto', height: 'auto' };

// The overlay still starts at the picked-up node's corner, so once it is
// smaller than that node the card would hang off away from the pointer. This
// keeps the same spot of the card under it: grabbed by its middle, carried by
// its middle.
const keepGrabPoint: Modifier = ({
  transform,
  activatorEvent,
  activeNodeRect,
  overlayNodeRect,
}) => {
  const pointer = activatorEvent && getEventCoordinates(activatorEvent);
  if (!pointer || !activeNodeRect || !overlayNodeRect) {
    return transform;
  }
  const across = (pointer.x - activeNodeRect.left) / activeNodeRect.width;
  const down = (pointer.y - activeNodeRect.top) / activeNodeRect.height;
  return {
    ...transform,
    x: transform.x + across * (activeNodeRect.width - overlayNodeRect.width),
    y: transform.y + down * (activeNodeRect.height - overlayNodeRect.height),
  };
};

// Every drag event and every announcement starts by reading the same two ids.
// Anything that is not one of ours comes back null, and so does no `over`.
function readDrag({ active, over }: Pick<DragEndEvent, 'active' | 'over'>) {
  return {
    source: parseDragSource(String(active.id)),
    target: over && parseDropTarget(String(over.id)),
  };
}

type Placed = Extract<DragSource, { from: 'placed' }>;

// The pool sticks right under the headline, whose height depends on the
// question: a long one wraps to three lines on a phone, and a guessed offset
// would park the pool over the progress bar. Declared outside the component so
// the ref stays the same and the observer is not rebuilt on every render.
function measureHeadline(headline: HTMLElement | null) {
  const screen = headline?.parentElement;
  if (!headline || !screen) {
    return;
  }
  const update = () => screen.style.setProperty('--headline-height', `${headline.offsetHeight}px`);
  // The observer only reports on the next frame, too late for a first scroll.
  update();
  const observer = new ResizeObserver(update);
  observer.observe(headline);
  return () => observer.disconnect();
}

export function SortingScreen() {
  const { t } = useTranslation();
  const { items, criterion, placement, drop } = usePlacement();
  const [dragged, setDragged] = useState<DragSource | null>(null);
  // A placed item picked up with its move button, waiting for the tap that puts
  // it down. Null means a tap places the pool item. Kept here and not in the
  // store: a half-finished tap is not progress worth saving.
  const [held, setHeld] = useState<Placed | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);
  const list = useRef<HTMLElement>(null);
  const mobile = useIsMobile();

  // A few pixels of travel before the gesture counts as a drag. Without them the
  // sensor starts one on press, and a plain click on the card would announce a
  // pickup and then a drop outside the list.
  const pointer = useSensor(PointerSensor, { activationConstraint: { distance: 4 } });
  // On a phone a finger on the list scrolls the page, so tapping is the only
  // way to place anything. Null rather than no argument: useSensors memoizes on
  // its arguments and their count must not change between renders.
  const sensors = useSensors(mobile ? null : pointer);
  const { announcement, say } = useAnnouncer();

  const [next] = placement?.pendingPool ?? [];
  const current = items.find((item) => item.id === next) ?? null;
  const heldItem = held && items.find((item) => item.id === held.itemId);

  const moveButtonOf = (itemId: string) =>
    list.current?.querySelector<HTMLElement>(
      `[data-drag-id="${dragSourceId({ from: 'placed', itemId })}"] + button`,
    );

  // Putting the held item back is nothing more than no longer holding it.
  // Rendered at once so half a tie is back in the list before the focus goes
  // looking for its button.
  const release = (refocus: boolean) => {
    if (!held) {
      return;
    }
    flushSync(() => {
      setHeld(null);
      setPreview(null);
    });
    say(t('sorting.select.released', { item: heldItem?.text }));
    if (refocus) {
      moveButtonOf(held.itemId)?.focus();
    }
  };

  // No dependency list, so the listener never calls a stale release. It only
  // listens while something is held, and leaves Escape alone otherwise.
  useEffect(() => {
    if (!held) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        release(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  // Nothing reaches this screen without a placement behind it, but the store
  // starts empty and the type says so.
  if (!placement) {
    return null;
  }

  const placed = items.length - placement.pendingPool.length;
  // The preview, the resolver and the progress all keep reading the placement
  // itself: the drop is worked out against the real list, and the progress
  // counts what has left the pool rather than what is on screen right now.
  const shown = listWhileLifted(placement.rankedSlots, dragged ?? held);
  // An untied card stays where it was and dims; the overlay is what travels.
  const carried =
    dragged?.from === 'placed' ? items.find((item) => item.id === dragged.itemId) : current;

  // Whichever of the two names in a position is not the one being carried. On
  // a pair being put back together the carried item is the head of its own
  // slot, and reading that would have it tying with itself.
  const partnerIn = (slot: RankedSlot | undefined, dragged: DragSource) => {
    const own = dragged.from === 'placed' ? dragged.itemId : null;
    const partner = slot?.itemIds.find((id) => id !== own);
    return items.find(({ id }) => id === partner)?.text;
  };

  // Half a tie leaves the list on the way up, the one moment it changes without
  // anything having been put down, so a pick-up says who is left standing in
  // the position and the renumbering follows from that.
  const leftBehind = (source: Placed) =>
    partnerIn(
      placement.rankedSlots.find(({ itemIds }) => itemIds.includes(source.itemId)),
      source,
    );

  const handleDragStart = ({ active }: DragStartEvent) => {
    const source = parseDragSource(String(active.id));
    setDragged(source);
    // A drag takes over from whatever was held for a tap.
    setHeld(null);
    const item = source?.from === 'placed' ? items.find(({ id }) => id === source.itemId) : current;
    if (!source || !item) {
      return;
    }
    const partner = source.from === 'placed' ? leftBehind(source) : undefined;
    say(
      partner
        ? t('sorting.announce.liftedFromTie', { item: item.text, partner })
        : t('sorting.announce.lifted', { item: item.text }),
    );
  };

  // The preview and the announcement are the same verdict, so they come off
  // one call and cannot disagree. Silent over nothing: letting go there is
  // covered on drop.
  const handleDragOver = (event: DragOverEvent) => {
    const { source, target } = readDrag(event);
    if (!source || !target) {
      setPreview(null);
      return;
    }
    const outcome = describeDrop(placement, source, target);
    setPreview({ targetId: dropTargetId(target), outcome });

    if (outcome === 'tie') {
      const item = partnerIn(placement.rankedSlots[target.index], source);
      say(t('sorting.announce.overTie', { item }));
      return;
    }
    const slot = landingSlot(placement, source, target);
    say(
      slot === null
        ? t('sorting.announce.overRejected')
        : t('sorting.announce.overInsert', { position: slot + 1 }),
    );
  };

  // A refused drop, a drop over nothing and a cancelled drag all leave the
  // placement as it was. The item then is wherever it was before, the pool
  // card included, because nothing ever took it out of there.
  const settle = () => {
    setDragged(null);
    setPreview(null);
  };

  const handleDragCancel = () => {
    settle();
    say(t('sorting.announce.cancelled'));
  };

  // Null for a refusal, which a drag and a tap word differently.
  const landed = (source: DragSource, target: DropTarget) => {
    if (describeDrop(placement, source, target) === 'tie') {
      const item = partnerIn(placement.rankedSlots[target.index], source);
      return t('sorting.announce.tied', { item });
    }
    const slot = landingSlot(placement, source, target);
    if (slot === null) {
      return null;
    }
    return source.from === 'placed'
      ? t('sorting.announce.moved', { position: slot + 1 })
      : t('sorting.announce.placed', { position: slot + 1 });
  };

  // Both methods end here, so whatever a drop does, a tap does too. The
  // message is read off the placement the drop was made against, before the
  // store swaps it for the one the drop produced.
  const putDown = (source: DragSource, target: DropTarget, refused: string) => {
    say(landed(source, target) ?? refused);
    drop(source, target);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    settle();
    const { source, target } = readDrag(event);
    if (source && target) {
      putDown(source, target, t('sorting.announce.refused'));
    } else {
      say(t('sorting.announce.outside'));
    }
  };

  const rankOf = (slot: number) =>
    list.current?.querySelector<HTMLElement>(
      `[data-drop-target="${dropTargetId({ kind: 'slot', index: slot })}"] button`,
    );

  // A tap has no hover to warn it off a full position, so a refused one stays
  // red until the next tap. An accepted one changes the list under the
  // pointer, and whatever the mark said no longer applies. A held item stays
  // in hand after a refusal, so the next try does not start from the button.
  const handleSelect = (target: DropTarget) => {
    const source: DragSource = held ?? { from: 'pool' };
    const outcome = describeDrop(placement, source, target);
    setPreview(outcome === 'rejected' ? { targetId: dropTargetId(target), outcome } : null);
    const slot = landingSlot(placement, source, target);
    // Rendered straight away so the focus can follow the item. The button that
    // was pressed stays in the list but moves down with the row it belongs to,
    // and whatever it names by then is not where the item went.
    flushSync(() => {
      putDown(source, target, t('sorting.select.refused'));
      if (slot !== null) {
        setHeld(null);
      }
    });
    if (slot === null) {
      return;
    }
    // A moved item keeps the focus on its own button, which names it and picks
    // it straight back up if the spot was wrong. The rank of the position it
    // landed in would offer to tie the next pool item with it instead.
    if (source.from === 'placed') {
      moveButtonOf(source.itemId)?.focus();
    } else {
      rankOf(slot)?.focus();
    }
  };

  // The move button of the item already in hand puts it back.
  const handlePickUp = (itemId: string) => {
    if (held?.itemId === itemId) {
      release(true);
      return;
    }
    const source: Placed = { from: 'placed', itemId };
    const item = items.find(({ id }) => id === itemId);
    const from = placement.rankedSlots.findIndex(({ itemIds }) => itemIds.includes(itemId));
    const partner = leftBehind(source);
    flushSync(() => {
      setHeld(source);
      setPreview(null);
    });
    say(
      partner
        ? t('sorting.select.heldFromTie', { item: item?.text, partner })
        : t('sorting.select.held', { item: item?.text }),
    );
    // Half a pair leaves the list the moment it is held, and its button goes
    // with it. The focus lands on the partner's rank instead: the same
    // position, and pressing it puts the pair back together.
    if (partner) {
      rankOf(from)?.focus();
    }
  };

  // A drag keeps its own preview going, and the pointer crosses targets on
  // the way.
  const handleHover = (target: DropTarget | null) => {
    if (dragged) {
      return;
    }
    setPreview(
      target && {
        targetId: dropTargetId(target),
        outcome: describeDrop(placement, held ?? { from: 'pool' }, target),
      },
    );
  };

  return (
    <div className={styles.screen}>
      <div ref={measureHeadline} className={styles.headline}>
        <h2 className={styles.question}>{criterion}</h2>
        <ProgressBar placed={placed} total={items.length} />
      </div>

      <DndContext
        sensors={sensors}
        // The gaps are thin strips between the cards, so the drop has to follow
        // the cursor rather than snap to the nearest centre.
        collisionDetection={pointerWithin}
        accessibility={{
          announcements: noAnnouncements,
          screenReaderInstructions: noInstructions,
        }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className={styles.columns}>
          <aside className={styles.pool}>
            <PoolItem
              item={current}
              held={heldItem}
              onRelease={() => release(false)}
              mobile={mobile}
            />
          </aside>
          <section ref={list} className={styles.list} aria-label={t('sorting.listLabel')}>
            <RankedList
              slots={shown}
              items={items}
              preview={preview}
              onSelect={current || held ? handleSelect : undefined}
              // Off by width, not by pointer: a mouse in a window narrower
              // than the breakpoint gets the phone behaviour too.
              onHover={(current || held) && !mobile ? handleHover : undefined}
              held={held?.itemId}
              onPickUp={handlePickUp}
              draggable={!mobile}
            />
          </section>
        </div>

        {/* dnd-kit animates a drop back to the dragged node, and here that node
            stays where the item was picked up, not where it has just landed. */}
        <DragOverlay dropAnimation={null} modifiers={[keepGrabPoint]} style={unsized}>
          {carried && !mobile ? (
            <div className={styles.carried}>
              <ItemCard item={carried} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Announcer announcement={announcement} />
    </div>
  );
}
