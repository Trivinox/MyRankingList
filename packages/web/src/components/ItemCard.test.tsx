// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import type { Item } from '../core/types.ts';
import { IMAGE_TIMEOUT, ItemCard } from './ItemCard.tsx';

// The card remembers a failed address for as long as the page lives, so each
// test starts from one nobody has asked for yet.
const freshUrl = () => `https://example.com/${crypto.randomUUID()}.jpg`;
let item: Item;

const placeholder = (container: HTMLElement) => container.querySelector('[class*="placeholder"]');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  item = { id: 'a', text: 'Mango', imageUrl: freshUrl() };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ItemCard', () => {
  it('shows the image while it is loading', () => {
    const { container } = render(<ItemCard item={item} />);

    expect(container.querySelector('img')).toHaveAttribute('src', item.imageUrl);
    expect(placeholder(container)).toBeNull();
  });

  it('swaps in the placeholder when the image errors', () => {
    const { container } = render(<ItemCard item={item} />);

    fireEvent.error(container.querySelector('img')!);

    expect(container.querySelector('img')).toBeNull();
    expect(placeholder(container)).not.toBeNull();
  });

  // The image it stands in for had an empty alt, and the text beside it still
  // names the item.
  it('draws the placeholder rather than leaving a box, and keeps it from screen readers', () => {
    const { container } = render(<ItemCard item={item} />);

    fireEvent.error(container.querySelector('img')!);

    expect(placeholder(container)?.tagName).toBe('svg');
    expect(placeholder(container)).toHaveAttribute('aria-hidden', 'true');
  });

  it('swaps in the placeholder when the image never answers', () => {
    const { container } = render(<ItemCard item={item} />);

    act(() => vi.advanceTimersByTime(IMAGE_TIMEOUT));

    expect(container.querySelector('img')).toBeNull();
    expect(placeholder(container)).not.toBeNull();
  });

  it('waits out the whole timeout before giving up', () => {
    const { container } = render(<ItemCard item={item} />);

    act(() => vi.advanceTimersByTime(IMAGE_TIMEOUT - 1));

    expect(container.querySelector('img')).not.toBeNull();
  });

  it('keeps an image that loads in time', () => {
    const { container } = render(<ItemCard item={item} />);

    fireEvent.load(container.querySelector('img')!);
    act(() => vi.advanceTimersByTime(IMAGE_TIMEOUT * 3));

    expect(container.querySelector('img')).not.toBeNull();
    expect(placeholder(container)).toBeNull();
  });

  it.each(['http://example.com/a.jpg', 'https://example.com/a.svg'])(
    'shows the placeholder straight away for a link the text checks turn down (%s)',
    (imageUrl) => {
      const { container } = render(<ItemCard item={{ ...item, imageUrl }} />);

      expect(container.querySelector('img')).toBeNull();
      expect(placeholder(container)).not.toBeNull();
    },
  );

  describe('a card for an image that already failed', () => {
    it('shows the placeholder at once after an error', () => {
      const first = render(<ItemCard item={item} />);
      fireEvent.error(first.container.querySelector('img')!);
      first.unmount();

      const { container } = render(<ItemCard item={item} />);

      expect(container.querySelector('img')).toBeNull();
      expect(placeholder(container)).not.toBeNull();
    });

    it('shows it at once after a timeout as well', () => {
      const first = render(<ItemCard item={item} />);
      act(() => vi.advanceTimersByTime(IMAGE_TIMEOUT));
      first.unmount();

      const { container } = render(<ItemCard item={item} />);

      expect(container.querySelector('img')).toBeNull();
      expect(placeholder(container)).not.toBeNull();
    });

    it('still asks for an image that loaded, and for any other address', () => {
      const loaded = render(<ItemCard item={item} />);
      fireEvent.load(loaded.container.querySelector('img')!);
      loaded.unmount();
      const broken = { ...item, imageUrl: freshUrl() };
      fireEvent.error(render(<ItemCard item={broken} />).container.querySelector('img')!);

      const { container } = render(<ItemCard item={item} />);

      expect(container.querySelector('img')).toHaveAttribute('src', item.imageUrl);
    });
  });

  it('shows just the text for an item with no image', () => {
    const { container } = render(<ItemCard item={{ id: 'b', text: 'Kiwi' }} />);

    expect(container).toHaveTextContent('Kiwi');
    expect(container.querySelector('img')).toBeNull();
    expect(placeholder(container)).toBeNull();
  });
});
