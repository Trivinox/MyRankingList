import { useMemo, useState } from 'react';
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
  dropTargetId,
  landingSlot,
  listWhileDragging,
  parseDragSource,
  parseDropTarget,
} from '../core/dropTargets.ts';
import type { DragSource } from '../core/dropTargets.ts';
import type { RankedSlot } from '../core/types.ts';
import { usePlacement } from '../state/placementStore.ts';
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

export function SortingScreen() {
  const { t } = useTranslation();
  const { items, criterion, placement, drop } = usePlacement();
  const [dragged, setDragged] = useState<DragSource | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);

  // A few pixels of travel before the gesture counts as a drag. Without them the
  // sensor starts one on press, and a plain click on the card would announce a
  // pickup and then a drop outside the list.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const [next] = placement?.pendingPool ?? [];
  const current = items.find((item) => item.id === next) ?? null;

  const announcements = useMemo<Announcements>(() => {
    // Whichever of the two names in a position is not the one being carried.
    // On a pair being put back together the carried item is the head of its
    // own slot, and reading that would have it tying with itself.
    const partnerIn = (slot: RankedSlot | undefined, dragged: DragSource) => {
      const own = dragged.from === 'placed' ? dragged.itemId : null;
      const partner = slot?.itemIds.find((id) => id !== own);
      return items.find(({ id }) => id === partner)?.text;
    };

    return {
      onDragStart: ({ active }) => {
        const source = parseDragSource(String(active.id));
        const item =
          source?.from === 'placed' ? items.find(({ id }) => id === source.itemId) : current;
        return item ? t('sorting.announce.lifted', { item: item.text }) : undefined;
      },
      // Reads out the same verdict the preview paints, so the two cannot
      // disagree. Silent over nothing: letting go there is covered on drop.
      onDragOver: (event) => {
        const { source, target } = readDrag(event);
        if (!placement || !source || !target) {
          return undefined;
        }
        if (describeDrop(placement, source, target) === 'tie') {
          const item = partnerIn(placement.rankedSlots[target.index], source);
          return t('sorting.announce.overTie', { item });
        }
        const slot = landingSlot(placement, source, target);
        return slot === null
          ? t('sorting.announce.overRejected')
          : t('sorting.announce.overInsert', { position: slot + 1 });
      },
      onDragEnd: (event) => {
        const { source, target } = readDrag(event);
        // This runs in the same pass as the drop, before the list re-renders,
        // so the placement here is still the one the drop was made against.
        if (!placement || !source || !target) {
          return t('sorting.announce.outside');
        }
        if (describeDrop(placement, source, target) === 'tie') {
          const item = partnerIn(placement.rankedSlots[target.index], source);
          return t('sorting.announce.tied', { item });
        }
        const slot = landingSlot(placement, source, target);
        if (slot === null) {
          return t('sorting.announce.outside');
        }
        return source.from === 'placed'
          ? t('sorting.announce.moved', { position: slot + 1 })
          : t('sorting.announce.placed', { position: slot + 1 });
      },
      onDragCancel: () => t('sorting.announce.cancelled'),
    };
  }, [t, items, current, placement]);

  // Nothing reaches this screen without a placement behind it, but the store
  // starts empty and the type says so.
  if (!placement) {
    return null;
  }

  const placed = items.length - placement.pendingPool.length;
  // The preview, the resolver and the progress all keep reading the placement
  // itself: the drop is worked out against the real list, and the progress
  // counts what has left the pool rather than what is on screen right now.
  const shown = listWhileDragging(placement.rankedSlots, dragged);
  // An untied card stays where it was and dims; the overlay is what travels.
  const carried =
    dragged?.from === 'placed' ? items.find((item) => item.id === dragged.itemId) : current;

  const handleDragStart = ({ active }: DragStartEvent) => {
    setDragged(parseDragSource(String(active.id)));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { source, target } = readDrag(event);
    setPreview(
      source && target
        ? { targetId: dropTargetId(target), outcome: describeDrop(placement, source, target) }
        : null,
    );
  };

  // A refused drop, a drop over nothing and a cancelled drag all leave the
  // placement as it was. The item then is wherever it was before, the pool
  // card included, because nothing ever took it out of there.
  const settle = () => {
    setDragged(null);
    setPreview(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    settle();
    const { source, target } = readDrag(event);
    if (source && target) {
      drop(source, target);
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.headline}>
        <h2 className={styles.question}>{criterion}</h2>
        <ProgressBar placed={placed} total={items.length} />
      </div>

      <DndContext
        sensors={sensors}
        // The gaps are thin strips between the cards, so the drop has to follow
        // the cursor rather than snap to the nearest centre.
        collisionDetection={pointerWithin}
        accessibility={{ announcements, screenReaderInstructions: noInstructions }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={settle}
      >
        <div className={styles.columns}>
          <aside className={styles.pool}>
            <PoolItem item={current} />
          </aside>
          <section className={styles.list} aria-label={t('sorting.listLabel')}>
            <RankedList slots={shown} items={items} preview={preview} />
          </section>
        </div>

        {/* dnd-kit animates a drop back to the dragged node, and here that node
            stays where the item was picked up, not where it has just landed. */}
        <DragOverlay dropAnimation={null} modifiers={[keepGrabPoint]} style={unsized}>
          {carried ? (
            <div className={styles.carried}>
              <ItemCard item={carried} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
