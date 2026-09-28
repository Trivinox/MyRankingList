// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from '../i18n/index.ts';
import { en } from '../i18n/locales/en.ts';
import type { RoomList, RoomResult } from '../room/result.ts';
import { AffinitySummary } from './AffinitySummary.tsx';

const listOf = (id: string, left = false): RoomList => ({
  id,
  nickname: id,
  left,
  slots: [{ itemIds: ['a'] }],
});

const lists = ['Ana', 'Juan', 'Eva', 'Leo'].map((id) => listOf(id));

function renderSummary(affinity: RoomResult['affinity'], shown = lists) {
  const { container } = render(
    <I18nextProvider i18n={createI18n()}>
      <AffinitySummary
        result={{ consensus: [], discrepancies: [], lists: shown, affinity }}
        you="Ana"
      />
    </I18nextProvider>,
  );
  return container;
}

// What each term says, in the order they come.
const described = () =>
  [...document.querySelectorAll('dt')].map(
    (term) => `${term.textContent}: ${term.nextElementSibling?.textContent}`,
  );

describe('AffinitySummary', () => {
  it('names the lists nearest and furthest from yours, pairs you are not in aside', () => {
    renderSummary([
      { a: 'Ana', b: 'Juan', coefficient: 0.2 },
      { a: 'Eva', b: 'Ana', coefficient: 0.8 },
      { a: 'Ana', b: 'Leo', coefficient: -0.4 },
      { a: 'Juan', b: 'Leo', coefficient: 1 },
    ]);

    expect(described()).toEqual([
      `${en.roomResult.mostAlike}: Eva 0.80`,
      `${en.roomResult.leastAlike}: Leo -0.40`,
    ]);
  });

  it('passes over a pair with no value, and says who left', () => {
    renderSummary(
      [
        { a: 'Ana', b: 'Juan', coefficient: 0.5 },
        { a: 'Ana', b: 'Eva', coefficient: null },
      ],
      [lists[0], listOf('Juan', true), lists[2]],
    );

    expect(described()).toEqual([
      `${en.roomResult.mostAlike}: Juan (left) 0.50`,
      `${en.roomResult.leastAlike}: Juan (left) 0.50`,
    ]);
  });

  it('shows nothing when no pair has a value', () => {
    const container = renderSummary([{ a: 'Ana', b: 'Juan', coefficient: null }]);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(en.roomResult.mostAlike)).not.toBeInTheDocument();
  });
});
