// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DndContextProps, DragEndEvent, DragOverlayProps } from '@dnd-kit/core';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from '../i18n/index.ts';
import { usePlacement } from '../state/placementStore.ts';
import { SortingScreen } from './SortingScreen.tsx';

// The same capture as in SortingScreen.test.tsx: the handlers are called by
// hand, and the overlay is kept for the drop animation it is handed.
const dnd = vi.hoisted(() => ({
  props: {} as DndContextProps,
  overlay: {} as DragOverlayProps,
}));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const dndKit = await importOriginal<typeof import('@dnd-kit/core')>();
  const { createElement } = await import('react');
  return {
    ...dndKit,
    DndContext: (props: DndContextProps) => {
      dnd.props = props;
      return createElement(dndKit.DndContext, props);
    },
    DragOverlay: (props: DragOverlayProps) => {
      dnd.overlay = props;
      return createElement(dndKit.DragOverlay, props);
    },
  };
});

const event = (active: string, over: string | null) =>
  ({ active: { id: active }, over: over && { id: over } }) as unknown as DragEndEvent;

// A file of its own because Framer Motion reads the OS setting once and keeps
// the answer for every test after. Here it is on from the very first render.
beforeEach(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;

  usePlacement.getState().start(
    ['Sushi', 'Ramen', 'Curry'].map((text) => ({ id: text.toLowerCase(), text })),
    'Which one do you like more?',
  );
});

const renderScreen = () =>
  render(
    <I18nextProvider i18n={createI18n()}>
      <SortingScreen />
    </I18nextProvider>,
  );

describe('with reduced motion on', () => {
  it('places the item without a burst', async () => {
    renderScreen();

    await userEvent.click(screen.getByRole('button', { name: 'Put it at position 1' }));

    expect(screen.getByText('2 of 3 placed')).toBeInTheDocument();
    expect(document.querySelector('[data-burst]')).toBeNull();
  });

  it('puts a refused item back without flying it there', () => {
    renderScreen();

    act(() => dnd.props.onDragStart?.(event('pool', null)));
    act(() => dnd.props.onDragEnd?.(event('pool', null)));

    expect(screen.getByText('1 of 3 placed')).toBeInTheDocument();
    expect(dnd.overlay.dropAnimation).toBeNull();
  });
});
