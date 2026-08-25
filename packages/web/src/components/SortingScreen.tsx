import { useTranslation } from 'react-i18next';
import { usePlacement } from '../state/placementStore.ts';
import { PoolItem } from './PoolItem.tsx';
import { ProgressBar } from './ProgressBar.tsx';
import { RankedList } from './RankedList.tsx';
import styles from './SortingScreen.module.css';

export function SortingScreen() {
  const { t } = useTranslation();
  const { items, criterion, placement } = usePlacement();

  // Nothing reaches this screen without a placement behind it, but the store
  // starts empty and the type says so.
  if (!placement) {
    return null;
  }

  const [next] = placement.pendingPool;
  const current = items.find((item) => item.id === next) ?? null;
  const placed = items.length - placement.pendingPool.length;

  return (
    <div className={styles.screen}>
      <h2 className={styles.question}>{criterion}</h2>
      <ProgressBar placed={placed} total={items.length} />

      <div className={styles.columns}>
        <aside className={styles.pool}>
          <PoolItem item={current} />
        </aside>
        <section className={styles.list} aria-label={t('sorting.listLabel')}>
          <RankedList slots={placement.rankedSlots} items={items} />
        </section>
      </div>
    </div>
  );
}
