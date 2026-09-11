import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Announcements, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { parseDragSource, parseDropTarget, resolveDrop } from '../core/dropTargets.ts';
import type { DragSource } from '../core/dropTargets.ts';
import { usePlacement } from '../state/placementStore.ts';
import { ItemCard } from './ItemCard.tsx';
import { PoolItem } from './PoolItem.tsx';
import { ProgressBar } from './ProgressBar.tsx';
import { RankedList } from './RankedList.tsx';
import styles from './SortingScreen.module.css';

// dnd-kit's stock instructions explain a keyboard drag, and only the pointer
// sensor is wired here. Blanked rather than just left unreferenced, since they
// are rendered into the page whether or not anything points at them.
const noInstructions = { draggable: '' };

export function SortingScreen() {
  const { t } = useTranslation();
  const { items, criterion, placement, drop } = usePlacement();
  const [dragged, setDragged] = useState<DragSource | null>(null);

  // A few pixels of travel before the gesture counts as a drag. Without them the
  // sensor starts one on press, and a plain click on the card would announce a
  // pickup and then a drop outside the list.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const [next] = placement?.pendingPool ?? [];
  const current = items.find((item) => item.id === next) ?? null;

  const announcements = useMemo<Announcements>(() => {
    const itemOf = (source: DragSource) =>
      source.from === 'pool' ? current : items.find((item) => item.id === source.itemId);

    return {
      onDragStart: ({ active }) => {
        const source = parseDragSource(String(active.id));
        const item = source && itemOf(source);
        return item ? t('sorting.announce.lifted', { item: item.text }) : undefined;
      },
      // Narrating the cursor is only worth it once the preview exists to agree
      // with what it says.
      onDragOver: () => undefined,
      onDragEnd: ({ active, over }) => {
        const source = parseDragSource(String(active.id));
        const target = over && parseDropTarget(String(over.id));
        // Resolved again rather than read back from the store: this runs in the
        // same pass as the drop, before the list re-renders, so the placement
        // here is still the one the drop was made against. A placed item moved
        // down lands one above the gap it was dropped in, and only the resolver
        // knows that.
        const result = placement && source && target && resolveDrop(placement, source, target);
        const item = source && itemOf(source);
        if (!result || !item) {
          return t('sorting.announce.outside');
        }
        const position = result.rankedSlots.findIndex((slot) => slot.itemIds.includes(item.id)) + 1;
        return source.from === 'pool'
          ? t('sorting.announce.placed', { position })
          : t('sorting.announce.moved', { position });
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
  const lifted =
    dragged?.from === 'placed' ? items.find((item) => item.id === dragged.itemId) : null;

  const handleDragStart = ({ active }: DragStartEvent) => {
    setDragged(parseDragSource(String(active.id)));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDragged(null);
    const source = parseDragSource(String(active.id));
    const target = over && parseDropTarget(String(over.id));
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
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragged(null)}
      >
        <div className={styles.columns}>
          <aside className={styles.pool}>
            <PoolItem item={current} />
          </aside>
          <section className={styles.list} aria-label={t('sorting.listLabel')}>
            <RankedList slots={placement.rankedSlots} items={items} />
          </section>
        </div>

        {/* dnd-kit animates a drop back to the dragged node, and here that node
            stays where the item was picked up, not where it has just landed. */}
        <DragOverlay dropAnimation={null}>
          {lifted ? (
            <ItemCard item={lifted} />
          ) : current ? (
            <ItemCard item={current} size="lead" />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
