import { useTranslation } from 'react-i18next';
import type { RoomList } from '../room/result.ts';

// Someone who left before the reveal still counts, and everywhere their list
// is named says they went.
export function useListName() {
  const { t } = useTranslation();
  return (list: RoomList) =>
    list.left ? t('roomResult.leftName', { nickname: list.nickname }) : list.nickname;
}

// Two decimals, written the way the language writes them: 0,83 in Spanish.
// Rounded first, so a value a hair under zero does not come out as -0.00.
export function formatCoefficient(value: number, language: string) {
  const rounded = Math.round(value * 100) / 100 + 0;
  return rounded.toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
