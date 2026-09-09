import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { parseDropTarget } from '../core/dropTargets.ts';
import { usePlacement } from '../state/placementStore.ts';
import { ItemCard } from './ItemCard.tsx';
import { PoolItem } from './PoolItem.tsx';
import { ProgressBar } from './ProgressBar.tsx';
import { RankedList } from './RankedList.tsx';
import styles from './SortingScreen.module.css';

export function SortingScreen() {
  const { t } = useTranslation();
  const { items, criterion, placement, drop } = usePlacement();
  const [dragging, setDragging] = useState(false);

  // A few pixels of travel before the gesture counts as a drag, so a plain
  // click on the card stays available for the selection method.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Nothing reaches this screen without a placement behind it, but the store
  // starts empty and the type says so.
  if (!placement) {
    return null;
  }

  const [next] = placement.pendingPool;
  const current = items.find((item) => item.id === next) ?? null;
  const placed = items.length - placement.pendingPool.length;

  const handleDragEnd = ({ over }: DragEndEvent) => {
    setDragging(false);
    const target = over && parseDropTarget(String(over.id));
    if (target) {
      drop({ from: 'pool' }, target);
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
        onDragStart={() => setDragging(true)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragging(false)}
      >
        <div className={styles.columns}>
          <aside className={styles.pool}>
            <PoolItem item={current} />
          </aside>
          <section className={styles.list} aria-label={t('sorting.listLabel')}>
            <RankedList slots={placement.rankedSlots} items={items} />
          </section>
        </div>

        {/* The store advances the pool the moment a drop lands, so without the
            flag the landing animation would play holding the next item rather
            than the one that was just dropped. */}
        <DragOverlay>
          {dragging && current ? <ItemCard item={current} size="lead" /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
