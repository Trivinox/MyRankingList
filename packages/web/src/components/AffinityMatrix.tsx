import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { affinityOf } from '../room/result.ts';
import type { RoomResult } from '../room/result.ts';
import { formatCoefficient, useListName } from './useListName.ts';
import hidden from './visuallyHidden.module.css';
import styles from './AffinityMatrix.module.css';

// A lilac that deepens with the coefficient, palest at -1 and most saturated
// at 1. Literal until the design system gives the gradient a name.
function shade(coefficient: number) {
  const share = (coefficient + 1) / 2;
  return `hsl(258 ${Math.round(15 + 55 * share)}% ${Math.round(95 - 17 * share)}%)`;
}

interface AffinityMatrixProps {
  result: RoomResult;
  you: string | null;
  // The heading the grid sits under, which names the table.
  labelledBy: string;
}

// Everyone against everyone, the same pair read from either side. The
// diagonal is left empty: a list compared with itself says nothing.
export function AffinityMatrix({ result, you, labelledBy }: AffinityMatrixProps) {
  const { t, i18n } = useTranslation();
  const nameOf = useListName();
  const { lists } = result;

  return (
    // Eight columns do not fit a phone, so the grid scrolls sideways inside
    // its own box, which has to take the focus for a keyboard to scroll it.
    <div className={styles.scroller} tabIndex={0}>
      <table className={styles.matrix} aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <td />
            {lists.map((list) => (
              <th key={list.id} scope="col" className={list.id === you ? styles.you : undefined}>
                {nameOf(list)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lists.map((row) => (
            <tr key={row.id}>
              <th scope="row" className={row.id === you ? styles.you : undefined}>
                {nameOf(row)}
              </th>
              {lists.map((column) => {
                if (column.id === row.id) return <td key={column.id} className={styles.self} />;
                const coefficient = affinityOf(result, row.id, column.id);
                if (typeof coefficient !== 'number') {
                  return (
                    <td key={column.id} className={styles.none}>
                      <span aria-hidden="true">–</span>
                      <span className={hidden.text}>{t('roomResult.noValue')}</span>
                    </td>
                  );
                }
                return (
                  <td
                    key={column.id}
                    className={styles.cell}
                    style={{ '--shade': shade(coefficient) } as CSSProperties}
                  >
                    {formatCoefficient(coefficient, i18n.language)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
