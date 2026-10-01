// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Loader } from './Loader.tsx';

describe('Loader', () => {
  // The line beside it says what is being waited for, so it adds nothing to
  // what a screen reader reads.
  it('draws three dots and keeps them from screen readers', () => {
    const { container } = render(<Loader />);
    const loader = container.firstElementChild!;

    expect(loader).toHaveAttribute('aria-hidden', 'true');
    expect(loader.children).toHaveLength(3);
    expect(loader).toHaveTextContent('');
  });
});
