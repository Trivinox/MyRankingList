import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Announcements, DragEndEvent } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { parseDropTarget } from '../core/dropTargets.ts';
import { usePlacement } from '../state/placementStore.ts';
import { ItemCard } from './ItemCard.tsx';
import { PoolItem } from './PoolItem.tsx';
import { ProgressBar } from './ProgressBar.tsx';
import { RankedList } from './RankedList.tsx';
import styles from './SortingScreen.module.css';

// dnd-kit ships instructions for picking an item up with the space bar and
// steering it with the arrow keys. Only the pointer sensor is wired here, and
// placing without one is going to mean clicking a position in the list rather
// than driving the drag, so these describe a way in that never arrives.
const noInstructions = { draggable: '' };

export function SortingScreen() {
  const { t } = useTranslation();
  const { items, criterion, placement, drop } = usePlacement();
  const [dragging, setDragging] = useState(false);

  // A few pixels of travel before the gesture counts as a drag. Without them the
  // sensor starts one on press, and a plain click on the card would announce a
  // pickup and then a drop outside the list.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const [next] = placement?.pendingPool ?? [];
  const current = items.find((item) => item.id === next) ?? null;

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: () =>
        current ? t('sorting.announce.lifted', { item: current.text }) : undefined,
      // Narrating the cursor is only worth it once the preview exists to agree
      // with what it says.
      onDragOver: () => undefined,
      onDragEnd: ({ over }) => {
        const target = over && parseDropTarget(String(over.id));
        // Gaps are the only targets so far, so an accepted drop is always an
        // insertion and the position it reads out is one past the gap.
        return target
          ? t('sorting.announce.placed', { position: target.index + 1 })
          : t('sorting.announce.outside');
      },
      onDragCancel: () => t('sorting.announce.cancelled'),
    }),
    [t, current],
  );

  // Nothing reaches this screen without a placement behind it, but the store
  // starts empty and the type says so.
  if (!placement) {
    return null;
  }

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
        accessibility={{ announcements, screenReaderInstructions: noInstructions }}
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
