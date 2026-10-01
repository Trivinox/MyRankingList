// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Popup } from './Popup.tsx';
import type { Severity } from './Popup.tsx';

const renderPopup = (severity: Severity = 'error', onClose: () => void = vi.fn()) => {
  render(<Popup severity={severity} message="That room is full." action="OK" onClose={onClose} />);
  return onClose;
};

// What Chrome sends a modal dialog when Escape is pressed. jsdom has no
// keyboard handling of its own for it.
const pressEscape = (dialog: HTMLElement) =>
  fireEvent(dialog, new Event('cancel', { cancelable: true }));

describe('Popup', () => {
  it('opens as a modal named by its message', () => {
    renderPopup();

    const dialog = screen.getByRole('alertdialog', { name: 'That room is full.' });

    expect(dialog).toHaveAttribute('open');
    expect(dialog.tagName).toBe('DIALOG');
  });

  it('opens with the focus on its button', () => {
    renderPopup();

    expect(screen.getByRole('button', { name: 'OK' })).toHaveFocus();
  });

  // The icons differ in shape, so each severity is checked against the other
  // two rather than against a drawing.
  it('shows a different icon for each severity, hidden from screen readers', () => {
    const drawn = (['info', 'warning', 'error'] as const).map((severity) => {
      const { unmount } = render(
        <Popup severity={severity} message={severity} action="OK" onClose={() => undefined} />,
      );
      const icon = screen.getByRole('alertdialog').querySelector('svg');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      const shape = icon!.innerHTML;
      unmount();
      return shape;
    });

    expect(new Set(drawn).size).toBe(3);
  });

  it('closes and calls its handler from the button', async () => {
    const onClose = renderPopup();
    const dialog = screen.getByRole('alertdialog');

    await userEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog).not.toHaveAttribute('open');
  });

  it('does the same on Escape, without leaving the closing to the browser', () => {
    const onClose = renderPopup();
    const dialog = screen.getByRole('alertdialog');

    const allowed = pressEscape(dialog);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(allowed).toBe(false);
    expect(dialog).not.toHaveAttribute('open');
  });

  // The handler is where the focus goes back to the page, and an open modal
  // leaves the page inert.
  it('is already closed when the handler runs', async () => {
    let openWhenCalled: boolean | undefined;
    renderPopup('warning', () => {
      openWhenCalled = (screen.getByRole('alertdialog', { hidden: true }) as HTMLDialogElement)
        .open;
    });

    await userEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(openWhenCalled).toBe(false);
  });
});
