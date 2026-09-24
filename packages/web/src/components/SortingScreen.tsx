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
  ClientRect,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DropAnimation,
  Modifier,
} from '@dnd-kit/core';
import { CSS, getEventCoordinates } from '@dnd-kit/utilities';
import type { Coordinates } from '@dnd-kit/utilities';
import { motion, useReducedMotion } from 'framer-motion';
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
import type { DragSource, DropOutcome, DropTarget } from '../core/dropTargets.ts';
import type { RankedSlot } from '../core/types.ts';
import { play, preload } from '../sound/sounds.ts';
import type { SoundName } from '../sound/sounds.ts';
import { usePlacement } from '../state/placementStore.ts';
import { useRoom } from '../state/roomStore.ts';
import { useScreen } from '../state/screenStore.ts';
import { Announcer } from './Announcer.tsx';
import { useAnnouncer } from './useAnnouncer.ts';
import { useIsMobile } from './useIsMobile.ts';
import { ItemCard } from './ItemCard.tsx';
import { PoolItem } from './PoolItem.tsx';
import { ProgressBar } from './ProgressBar.tsx';
import { RankedList } from './RankedList.tsx';
import type { DropPreview, Feedback } from './RankedList.tsx';
import { RoomProgress } from './RoomProgress.tsx';
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

const soundOf: Record<DropOutcome, SoundName> = {
  insert: 'drop',
  tie: 'tie',
  rejected: 'error',
};

// Where a card was grabbed, as a share of its width and height.
interface GrabPoint {
  across: number;
  down: number;
}

function grabPoint(pointer: Coordinates, rect: ClientRect): GrabPoint {
  return {
    across: (pointer.x - rect.left) / rect.width,
    down: (pointer.y - rect.top) / rect.height,
  };
}

// How far the overlay has to shift for that same share of it to line up with
// the node it was picked up from.
function grabOffset({ across, down }: GrabPoint, active: ClientRect, overlay: ClientRect) {
  return {
    x: across * (active.width - overlay.width),
    y: down * (active.height - overlay.height),
  };
}

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
  const offset = grabOffset(grabPoint(pointer, activeNodeRect), activeNodeRect, overlayNodeRect);
  return { ...transform, x: transform.x + offset.x, y: transform.y + offset.y };
};

// dnd-kit flies a refused card back to the corner of the node it left, and the
// card is smaller than that node. It goes back to the spot it was grabbed by
// instead, where keepGrabPoint had it on the way out. The grab is kept as a
// share rather than as coordinates: the list may have scrolled since, and
// half a tie comes back as a new node.
function returnTo(grab: GrabPoint | null): DropAnimation {
  return {
    keyframes: ({ active, dragOverlay, transform: { initial, final } }) => {
      const offset = grab ? grabOffset(grab, active.rect, dragOverlay.rect) : { x: 0, y: 0 };
      return [
        { transform: CSS.Transform.toString(initial) },
        {
          transform: CSS.Transform.toString({
            ...final,
            x: final.x + offset.x,
            y: final.y + offset.y,
          }),
        },
      ];
    },
  };
}

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

// The button that opened this screen, Continue or Sort again, is gone with the
// screen it was on, and the focus would otherwise fall back to the page.
// Declared outside, like measureHeadline, so it runs when the heading mounts
// and not again on every render.
function focusOnArrival(heading: HTMLHeadingElement | null) {
  heading?.focus();
}

export function SortingScreen() {
  const { t } = useTranslation();
  const { items, criterion, placement, drop } = usePlacement();
  const setScreen = useScreen((state) => state.setScreen);
  const roomStatus = useRoom((state) => state.status);
  const inRoom = roomStatus === 'sorting';
  const [dragged, setDragged] = useState<DragSource | null>(null);
  // A placed item picked up with its move button, waiting for the tap that puts
  // it down. Null means a tap places the pool item. Kept here and not in the
  // store: a half-finished tap is not progress worth saving.
  const [held, setHeld] = useState<Placed | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);
  // The last thing put down, for the list to show where it went. Cleared on
  // the next pick-up: lifting half a tie remounts its position, and a burst
  // still attached to it would play all over again.
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [grab, setGrab] = useState<GrabPoint | null>(null);
  // Decided when the drag ends, since the overlay reads it on the render that
  // lets go. The preview cannot be used: it is cleared in that same render.
  const [returning, setReturning] = useState(false);
  const list = useRef<HTMLElement>(null);
  const mobile = useIsMobile();
  const reduceMotion = useReducedMotion();

  // A few pixels of travel before the gesture counts as a drag. Without them the
  // sensor starts one on press, and a plain click on the card would announce a
  // pickup and then a drop outside the list.
  const pointer = useSensor(PointerSensor, { activationConstraint: { distance: 4 } });
  // On a phone a finger on the list scrolls the page, so tapping is the only
  // way to place anything. The cards turn their own dragging off there. The
  // sensor stays, since dnd-kit uses the sensors as effect dependencies and
  // React complains if their number changes between renders.
  const sensors = useSensors(pointer);
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

  useEffect(preload, []);

  // The lobby screen already knows how to tell someone the room is gone and
  // take them back to the form.
  useEffect(() => {
    if (roomStatus === 'closed') {
      setScreen('lobby');
    }
  }, [roomStatus, setScreen]);

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

  const handleDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const source = parseDragSource(String(active.id));
    setDragged(source);
    // A drag takes over from whatever was held for a tap.
    setHeld(null);
    setFeedback(null);
    const pointer = activatorEvent && getEventCoordinates(activatorEvent);
    const node =
      activatorEvent?.target instanceof Element && activatorEvent.target.closest('[data-drag-id]');
    setGrab(pointer && node ? grabPoint(pointer, node.getBoundingClientRect()) : null);
    const item = source?.from === 'placed' ? items.find(({ id }) => id === source.itemId) : current;
    if (!source || !item) {
      return;
    }
    play('pickup');
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

  // Silent, as is putting a held item back: both are the user changing their
  // mind, and the error sound is for a drop that was turned away.
  const handleDragCancel = () => {
    setReturning(true);
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
  //
  // A refused item shakes the position that turned it away. An accepted one
  // marks the position it landed in, counted in the list the drop produces,
  // since that is the list about to be on screen.
  const putDown = (source: DragSource, target: DropTarget, refused: string) => {
    const outcome = describeDrop(placement, source, target);
    const slot = landingSlot(placement, source, target) ?? target.index;
    setFeedback((last) => ({ outcome, slot, key: (last?.key ?? 0) + 1 }));
    play(soundOf[outcome]);
    say(landed(source, target) ?? refused);
    // The pool card is gone after this one, and the button that takes its
    // place is out of sight for someone on the list.
    if (source.from === 'pool' && outcome !== 'rejected' && placement.pendingPool.length === 1) {
      say(t(inRoom ? 'sorting.announce.allPlacedInRoom' : 'sorting.announce.allPlaced'));
    }
    drop(source, target);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    settle();
    const { source, target } = readDrag(event);
    setReturning(!source || !target || describeDrop(placement, source, target) === 'rejected');
    if (source && target) {
      putDown(source, target, t('sorting.announce.refused'));
    } else {
      play('error');
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
      setFeedback(null);
    });
    play('pickup');
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
        <h2 ref={focusOnArrival} className={styles.question} tabIndex={-1}>
          {criterion}
        </h2>
        <ProgressBar placed={placed} total={items.length} />
      </div>

      <RoomProgress />

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
              onFinish={() => setScreen('result')}
              inRoom={inRoom}
              mobile={mobile}
            />
          </aside>
          <section ref={list} className={styles.list} aria-label={t('sorting.listLabel')}>
            <RankedList
              slots={shown}
              items={items}
              preview={preview}
              feedback={feedback}
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

        {/* dnd-kit animates a drop back to the dragged node, and that node
            stays where the item was picked up. Right for a card that was
            turned away, wrong for one that has just landed somewhere else.
            The OS setting is read by hand here: this animation is dnd-kit's,
            and MotionConfig never sees it. */}
        <DragOverlay
          dropAnimation={returning && !reduceMotion ? returnTo(grab) : null}
          modifiers={[keepGrabPoint]}
          style={unsized}
        >
          {carried && !mobile ? (
            <motion.div
              className={styles.carried}
              initial={{ scale: 1, boxShadow: '0 1px 3px rgba(120, 100, 190, 0)' }}
              animate={{ scale: 1.04, boxShadow: '0 12px 28px rgba(120, 100, 190, 0.3)' }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <ItemCard item={carried} />
            </motion.div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Announcer announcement={announcement} />
    </div>
  );
}
