import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Item } from '../core/types.ts';
import { usePlacement } from '../state/placementStore.ts';
import { useScreen } from '../state/screenStore.ts';
import { confettiColors } from '../styles/confetti.ts';
import { ItemCard } from './ItemCard.tsx';
import styles from './ResultScreen.module.css';

export function ResultScreen() {
  const { t } = useTranslation();
  const { items, criterion, placement, start } = usePlacement();
  const setScreen = useScreen((state) => state.setScreen);
  const heading = useRef<HTMLHeadingElement>(null);

  // See result unmounted along with the sorting screen.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  // One burst for the whole list. The library checks the OS setting itself.
  // The reset stops a burst still falling when the screen is left, which is
  // also what keeps Strict Mode's second run from firing a second one.
  useEffect(() => {
    confetti({
      particleCount: 140,
      spread: 90,
      origin: { y: 0.6 },
      colors: confettiColors,
      disableForReducedMotion: true,
    });
    return () => {
      confetti.reset();
    };
  }, []);

  if (!placement) {
    return null;
  }

  const sortAgain = () => {
    start(items, criterion);
    setScreen('sorting');
  };

  return (
    <div className={styles.screen}>
      <p className={styles.title}>{t('result.title')}</p>
      <h2 ref={heading} className={styles.question} tabIndex={-1}>
        {criterion}
      </h2>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <ResultList groups={placement.rankedSlots.map((slot) => slot.itemIds)} items={items} />
      </motion.div>

      <div className={styles.actions}>
        <button type="button" className={styles.again} onClick={sortAgain}>
          {t('result.sortAgain')}
        </button>
        <button type="button" className={styles.newList} onClick={() => setScreen('list-input')}>
          {t('result.newList')}
        </button>
      </div>
    </div>
  );
}

interface ResultListProps {
  // Each group is one rank, in order.
  groups: string[][];
  items: Item[];
}

// A tied position is one card holding a row per item, each row with the shared
// number. Nothing here assumes two: a room's consensus can put more items on
// one rank, and the card just grows. The numbering is the competition one
// either way, every item on a rank counting towards the next.
export function ResultList({ groups, items }: ResultListProps) {
  const { t } = useTranslation();
  const byId = new Map(items.map((item) => [item.id, item]));
  let seen = 0;

  return (
    <ol className={styles.list}>
      {groups.map((itemIds) => {
        const rank = seen + 1;
        seen += itemIds.length;
        const tied = itemIds.length > 1;

        return (
          <li
            key={itemIds.join('+')}
            className={tied ? `${styles.position} ${styles.tie}` : styles.position}
          >
            {tied ? <span className={styles.tiedLabel}>{t('result.tied')}</span> : null}
            {itemIds
              .flatMap((id) => byId.get(id) ?? [])
              .map((item) => (
                <div key={item.id} className={styles.row}>
                  <span className={styles.rank}>{rank}</span>
                  <div className={styles.card}>
                    <ItemCard item={item} />
                  </div>
                </div>
              ))}
          </li>
        );
      })}
    </ol>
  );
}
