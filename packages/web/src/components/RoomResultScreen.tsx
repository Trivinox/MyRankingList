import { useEffect, useId, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { ConsensusEntry } from '../core/consensus.ts';
import { rankItems } from '../core/ranking.ts';
import type { Item } from '../core/types.ts';
import { START_MINIMUM } from '../room/hostRoom.ts';
import { forgetRoomLink } from '../room/link.ts';
import { AFFINITY_MATRIX_LIMIT, affinityOf } from '../room/result.ts';
import type { RoomList, RoomResult } from '../room/result.ts';
import { changeList, leaveRoom, playAgain } from '../room/session.ts';
import { useListDraft } from '../state/listDraftStore.ts';
import { usePlacement } from '../state/placementStore.ts';
import { isOver, useRoom } from '../state/roomStore.ts';
import { useScreen } from '../state/screenStore.ts';
import { confettiColors } from '../styles/confetti.ts';
import { AffinityMatrix } from './AffinityMatrix.tsx';
import { AffinitySummary } from './AffinitySummary.tsx';
import { CloseRoom } from './CloseRoom.tsx';
import { ItemCard } from './ItemCard.tsx';
import { CRITERION_LIMIT } from './ListInputForm.tsx';
import { ParticipantAvatar } from './ParticipantAvatar.tsx';
import { ResultList } from './ResultScreen.tsx';
import { formatCoefficient, useListName } from './useListName.ts';
import styles from './RoomResultScreen.module.css';

// Enough to read at a glance. The rest of the order is in the comparison.
const DIVISIVE_SHOWN = 3;

// Items that came out level sit next to each other, so a new rank is a new
// group.
function byRank(consensus: ConsensusEntry[]) {
  const groups: string[][] = [];
  let last = 0;
  for (const { itemId, rank } of consensus) {
    if (rank === last) groups[groups.length - 1].push(itemId);
    else groups.push([itemId]);
    last = rank;
  }
  return groups;
}

// Where each list put each item, as the number the list shows.
const ranksOf = (list: RoomList) =>
  new Map(rankItems(list.slots).map((entry) => [entry.itemId, entry.rank]));

export function RoomResultScreen() {
  const { t } = useTranslation();
  const { role, you, status, result } = useRoom();
  const { items, criterion } = usePlacement();
  const setScreen = useScreen((state) => state.setScreen);
  const heading = useRef<HTMLHeadingElement>(null);
  const consensusId = useId();
  const affinityId = useId();
  const divisiveId = useId();
  const ownId = useId();

  // Whatever was pressed last is gone with the sorting screen, and for a
  // guest nothing was pressed at all: the result simply arrived.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  // As in the solo result, one burst for the whole reveal.
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

  // Another round takes everyone to sort it at once, the creator's own Same
  // items included. Guests wait in the lobby while the creator writes a new
  // list instead.
  useEffect(() => {
    if (status === 'sorting') setScreen('sorting');
    else if (status === 'preparing') setScreen('lobby');
  }, [status, setScreen]);

  if (!result) return null;

  const backToForm = () => {
    leaveRoom();
    forgetRoomLink();
    setScreen('list-input');
  };

  // The result stays after the room is gone. Only the way out changes, and a
  // line says why nobody else is there any more.
  const over = isOver(status);
  const compared = result.lists.length > 1;
  const mine = result.lists.find((list) => list.id === you);

  return (
    <div className={styles.screen}>
      <p className={styles.title}>{t('roomResult.title')}</p>
      <h2 ref={heading} className={styles.question} tabIndex={-1}>
        {criterion}
      </h2>
      {over && (
        <p className={styles.over} role="status">
          {t(`room.lobby.${status}`)}
        </p>
      )}

      <motion.div
        className={styles.sections}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <section aria-labelledby={consensusId}>
          <h3 id={consensusId} className={styles.heading}>
            {t('roomResult.consensus')}
          </h3>
          {!compared && <p className={styles.note}>{t('roomResult.onlyList')}</p>}
          <ResultList groups={byRank(result.consensus)} items={items} />
        </section>

        {compared && (
          <section aria-labelledby={affinityId}>
            <h3 id={affinityId} className={styles.heading}>
              {t('roomResult.affinity')}
            </h3>
            <p className={styles.note}>{t('roomResult.scale')}</p>
            {result.lists.length <= AFFINITY_MATRIX_LIMIT ? (
              <AffinityMatrix result={result} you={you} labelledBy={affinityId} />
            ) : (
              <AffinitySummary result={result} you={you} />
            )}
          </section>
        )}

        {compared && (
          <section aria-labelledby={divisiveId}>
            <h3 id={divisiveId} className={styles.heading}>
              {t('roomResult.divisive')}
            </h3>
            <Divisive result={result} items={items} />
          </section>
        )}

        {compared && mine && (
          <section aria-labelledby={ownId}>
            <h3 id={ownId} className={styles.heading}>
              {t('roomResult.yourList')}
            </h3>
            <ResultList groups={mine.slots.map((slot) => slot.itemIds)} items={items} />
            <Comparison result={result} mine={mine} items={items} />
          </section>
        )}
      </motion.div>

      {role === 'host' && !over && <PlayAgain criterion={criterion} total={items.length} />}
      {role === 'guest' && !over && <p className={styles.note}>{t('roomResult.creatorDecides')}</p>}

      {role === 'host' && !over ? (
        <CloseRoom onClose={backToForm} revealed />
      ) : (
        <button type="button" className={styles.leave} onClick={backToForm}>
          {t(over ? 'room.back' : 'room.lobby.leave')}
        </button>
      )}
    </div>
  );
}

interface PlayAgainProps {
  criterion: string;
  // The length of the list, for the rings.
  total: number;
}

// The creator's choice once the room has its result: the same items again, or
// a new list written on the form. The criterion field goes with either, and
// the form opens holding it.
function PlayAgain({ criterion, total }: PlayAgainProps) {
  const { t } = useTranslation();
  const setScreen = useScreen((state) => state.setScreen);
  const setDraftCriterion = useListDraft((state) => state.setCriterion);
  const { participants, you } = useRoom();
  // A round needs someone to sort with, as the first one did.
  const alone = participants.filter((p) => p.connected).length < START_MINIMUM;
  const away = participants.some((p) => !p.connected);
  const [next, setNext] = useState(criterion);
  const headingId = useId();
  const aloneId = useId();

  const change = () => {
    setDraftCriterion(next);
    changeList();
    setScreen('list-input');
  };

  return (
    <section aria-labelledby={headingId} className={styles.again}>
      <h3 id={headingId} className={styles.heading}>
        {t('roomResult.again')}
      </h3>
      {/* Who a new round would take along. It starts with whoever is
          connected, so the creator sees who is away before deciding. */}
      <ul className={styles.strip} aria-label={t('room.everyone')}>
        {participants.map((participant, place) => (
          <li key={participant.id}>
            <ParticipantAvatar
              participant={participant}
              place={place}
              isYou={participant.id === you}
              total={total}
              stacked
            />
          </li>
        ))}
      </ul>
      {away && !alone && <p className={styles.note}>{t('roomResult.awayLeftOut')}</p>}
      <label className={styles.next}>
        <span className={styles.pickerLabel}>{t('roomResult.nextCriterion')}</span>
        <input
          type="text"
          value={next}
          maxLength={CRITERION_LIMIT}
          onChange={(event) => setNext(event.target.value)}
        />
      </label>
      <div className={styles.againActions}>
        <button
          type="button"
          className={styles.same}
          disabled={alone || next.trim() === ''}
          aria-describedby={alone ? aloneId : undefined}
          onClick={() => playAgain({ criterion: next.trim() })}
        >
          {t('roomResult.sameItems')}
        </button>
        <button type="button" className={styles.leave} onClick={change}>
          {t('roomResult.changeList')}
        </button>
      </div>
      {alone && (
        <p id={aloneId} className={styles.note}>
          {t('room.alone')}
        </p>
      )}
    </section>
  );
}

interface DivisiveProps {
  result: RoomResult;
  items: Item[];
}

// The items the lists put furthest apart, each with the best and the worst
// place anyone gave it. An item everyone agreed on is not divisive at all,
// however it ranks among the rest.
function Divisive({ result, items }: DivisiveProps) {
  const { t } = useTranslation();
  const split = result.discrepancies.filter((entry) => entry.dispersion > 0);
  if (split.length === 0) return <p className={styles.note}>{t('roomResult.agreed')}</p>;

  const ranks = result.lists.map(ranksOf);
  return (
    <ul className={styles.divisive}>
      {split.slice(0, DIVISIVE_SHOWN).map(({ itemId }) => {
        // The session checked every item in the result is one of these.
        const item = items.find(({ id }) => id === itemId)!;
        const places = ranks.map((list) => list.get(itemId)!);
        return (
          <li key={itemId} className={styles.split}>
            <ItemCard item={item} />
            <span className={styles.spread}>
              {t('roomResult.spread', { best: Math.min(...places), worst: Math.max(...places) })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

interface ComparisonProps {
  result: RoomResult;
  mine: RoomList;
  items: Item[];
}

// One other list next to this person's, item by item, in their own order.
function Comparison({ result, mine, items }: ComparisonProps) {
  const { t, i18n } = useTranslation();
  const nameOf = useListName();
  const pickerId = useId();
  const others = result.lists.filter((list) => list.id !== mine.id);
  const [otherId, setOtherId] = useState(others[0].id);
  const other = others.find((list) => list.id === otherId) ?? others[0];

  const own = rankItems(mine.slots);
  const theirs = ranksOf(other);
  const coefficient = affinityOf(result, mine.id, other.id);

  return (
    <div className={styles.comparison}>
      <label htmlFor={pickerId} className={styles.pickerLabel}>
        {t('roomResult.compareWith')}
      </label>
      <select
        id={pickerId}
        className={styles.picker}
        value={other.id}
        onChange={(event) => setOtherId(event.target.value)}
      >
        {others.map((list) => (
          <option key={list.id} value={list.id}>
            {nameOf(list)}
          </option>
        ))}
      </select>
      <p className={styles.note}>
        {t('roomResult.compareAffinity', {
          value:
            typeof coefficient === 'number'
              ? formatCoefficient(coefficient, i18n.language)
              : t('roomResult.noValue'),
        })}
      </p>
      <table className={styles.sideBySide}>
        <thead>
          <tr>
            <th scope="col">{t('roomResult.item')}</th>
            <th scope="col">{t('roomResult.you')}</th>
            <th scope="col">{nameOf(other)}</th>
          </tr>
        </thead>
        <tbody>
          {own.map(({ itemId, rank }) => (
            <tr key={itemId}>
              <th scope="row">{items.find(({ id }) => id === itemId)?.text}</th>
              <td>{rank}</td>
              <td>{theirs.get(itemId)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
