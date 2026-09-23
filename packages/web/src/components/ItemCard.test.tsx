// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { IMAGE_TIMEOUT, ItemCard } from './ItemCard.tsx';

const item = { id: 'a', text: 'Mango', imageUrl: 'https://example.com/mango.jpg' };

const placeholder = (container: HTMLElement) => container.querySelector('[class*="placeholder"]');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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

  it('shows neither image nor placeholder for a link the rule turns down', () => {
    const { container } = render(
      <ItemCard item={{ ...item, imageUrl: 'http://example.com/a.jpg' }} />,
    );

    act(() => vi.advanceTimersByTime(IMAGE_TIMEOUT));

    expect(container.querySelector('img')).toBeNull();
    expect(placeholder(container)).toBeNull();
  });

  it('shows just the text for an item with no image', () => {
    const { container } = render(<ItemCard item={{ id: 'b', text: 'Kiwi' }} />);

    expect(container).toHaveTextContent('Kiwi');
    expect(container.querySelector('img')).toBeNull();
    expect(placeholder(container)).toBeNull();
  });
});
