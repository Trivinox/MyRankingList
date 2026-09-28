import { useTranslation } from 'react-i18next';
import { affinityOf } from '../room/result.ts';
import type { RoomResult } from '../room/result.ts';
import { formatCoefficient, useListName } from './useListName.ts';
import styles from './AffinitySummary.module.css';

interface AffinitySummaryProps {
  result: RoomResult;
  you: string | null;
}

// What a room too big for the grid shows each person instead: the one list
// nearest theirs and the one furthest from it. Anyone else is one pick away
// in the comparison below.
export function AffinitySummary({ result, you }: AffinitySummaryProps) {
  const { t, i18n } = useTranslation();
  const nameOf = useListName();

  // A pair with no coefficient is nobody's nearest or furthest.
  const ranked = result.lists
    .filter((list) => list.id !== you)
    .flatMap((list) => {
      const coefficient = you === null ? null : affinityOf(result, you, list.id);
      return typeof coefficient === 'number' ? [{ list, coefficient }] : [];
    })
    .sort((a, b) => b.coefficient - a.coefficient);

  if (ranked.length === 0) return null;
  const nearest = ranked[0];
  const furthest = ranked[ranked.length - 1];

  return (
    <dl className={styles.summary}>
      <div className={styles.pair}>
        <dt>{t('roomResult.mostAlike')}</dt>
        <dd>
          {nameOf(nearest.list)}{' '}
          <span className={styles.value}>
            {formatCoefficient(nearest.coefficient, i18n.language)}
          </span>
        </dd>
      </div>
      <div className={styles.pair}>
        <dt>{t('roomResult.leastAlike')}</dt>
        <dd>
          {nameOf(furthest.list)}{' '}
          <span className={styles.value}>
            {formatCoefficient(furthest.coefficient, i18n.language)}
          </span>
        </dd>
      </div>
    </dl>
  );
}
