// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import type { Item } from '../core/types.ts';
import { createI18n } from '../i18n/index.ts';
import { en } from '../i18n/locales/en.ts';
import { useListDraft } from '../state/listDraftStore.ts';
import { LONG_LIST_THRESHOLD, ListInputForm } from './ListInputForm.tsx';

const blankRows = (count: number): Item[] =>
  Array.from({ length: count }, () => ({ id: crypto.randomUUID(), text: '' }));

// Distinct text per row, so a seeded list does not trip the duplicate notice.
const filledRows = (count: number): Item[] =>
  Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    text: `Item ${index + 1}`,
  }));

const renderForm = () => {
  const i18n = createI18n();
  render(
    <I18nextProvider i18n={i18n}>
      <ListInputForm />
    </I18nextProvider>,
  );
  return i18n;
};

// The store is a module singleton, so each test starts it back at the three
// empty rows the app opens with.
beforeEach(() => {
  useListDraft.setState({ screen: 'list-input', items: blankRows(3), criterion: '' });
});

describe('ListInputForm', () => {
  it('stops item text at 80 characters', async () => {
    renderForm();

    const field = screen.getByLabelText('Item 1');
    await userEvent.type(field, 'x'.repeat(95));

    expect(field).toHaveValue('x'.repeat(80));
  });

  it('stops the criterion at 100 characters', async () => {
    renderForm();

    const field = screen.getByLabelText(en.form.criterionLabel);
    await userEvent.type(field, 'y'.repeat(140));

    expect(field).toHaveValue('y'.repeat(100));
  });

  it('unlocks the continue button on the third filled item', async () => {
    useListDraft.setState({ criterion: 'Which one do you like more?' });
    renderForm();

    const jump = screen.getByRole('button', { name: en.form.continue });
    expect(jump).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Item 1'), 'Alien');
    await userEvent.type(screen.getByLabelText('Item 2'), 'The Thing');
    expect(jump).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Item 3'), 'Blade Runner');
    expect(jump).toBeEnabled();
  });

  it('ignores rows that only hold whitespace when counting', async () => {
    useListDraft.setState({ criterion: 'Which one do you like more?' });
    renderForm();

    await userEvent.type(screen.getByLabelText('Item 1'), 'Alien');
    await userEvent.type(screen.getByLabelText('Item 2'), 'The Thing');
    await userEvent.type(screen.getByLabelText('Item 3'), '   ');

    expect(screen.getByRole('button', { name: en.form.continue })).toBeDisabled();
  });

  it('keeps continue shut while the criterion is empty', async () => {
    useListDraft.setState({ items: filledRows(3) });
    renderForm();

    const jump = screen.getByRole('button', { name: en.form.continue });
    expect(jump).toBeDisabled();
    expect(screen.getByText(en.form.criterionNotice)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(en.form.criterionLabel), 'Which one is better?');

    expect(jump).toBeEnabled();
  });

  it('does not take a criterion of nothing but spaces', async () => {
    useListDraft.setState({ items: filledRows(3) });
    renderForm();

    await userEvent.type(screen.getByLabelText(en.form.criterionLabel), '    ');

    expect(screen.getByRole('button', { name: en.form.continue })).toBeDisabled();
  });

  it('holds the long-list warning back until the threshold', () => {
    useListDraft.setState({ items: filledRows(LONG_LIST_THRESHOLD - 1) });
    renderForm();

    expect(screen.queryByRole('img', { name: en.form.longListWarning })).not.toBeInTheDocument();
  });

  it('shows the long-list warning at the threshold', () => {
    useListDraft.setState({ items: filledRows(LONG_LIST_THRESHOLD) });
    renderForm();

    expect(screen.getByRole('img', { name: en.form.longListWarning })).toBeInTheDocument();
  });

  it('flags two rows that differ only in casing', async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText('Item 1'), 'Apple');
    await userEvent.type(screen.getByLabelText('Item 2'), 'APPLE');

    expect(screen.getAllByText(en.form.duplicateFlag)).toHaveLength(2);
    expect(screen.getByText(en.form.duplicateNotice)).toBeInTheDocument();
  });

  it('flags two rows that differ only in surrounding whitespace', async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText('Item 1'), 'Pear');
    await userEvent.type(screen.getByLabelText('Item 2'), '  Pear  ');

    expect(screen.getAllByText(en.form.duplicateFlag)).toHaveLength(2);
  });

  it('reads the duplicate flag out as a description of the row it marks', async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText('Item 1'), 'Apple');
    await userEvent.type(screen.getByLabelText('Item 2'), 'APPLE');

    expect(screen.getByLabelText('Item 1')).toHaveAccessibleDescription(en.form.duplicateFlag);
    expect(screen.getByLabelText('Item 3')).not.toHaveAccessibleDescription();
  });

  it('leaves distinct rows unflagged', async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText('Item 1'), 'Apple');
    await userEvent.type(screen.getByLabelText('Item 2'), 'Pear');

    expect(screen.queryByText(en.form.duplicateFlag)).not.toBeInTheDocument();
  });

  it('marks an image URL the validator rejects', async () => {
    renderForm();

    await userEvent.type(
      screen.getByLabelText('Image URL for item 1'),
      'http://example.com/photo.jpg',
    );
    await userEvent.type(
      screen.getByLabelText('Image URL for item 2'),
      'https://example.com/logo.svg',
    );

    expect(screen.getAllByText(en.form.imageUrlRejected)).toHaveLength(2);
  });

  it('accepts an https image URL with an allowed extension', async () => {
    renderForm();

    await userEvent.type(
      screen.getByLabelText('Image URL for item 1'),
      'https://example.com/photo.jpg',
    );

    expect(screen.queryByText(en.form.imageUrlRejected)).not.toBeInTheDocument();
  });

  it('adds and removes rows', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: en.form.addItem }));
    expect(screen.getByLabelText('Item 4')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove item 4' }));
    expect(screen.queryByLabelText('Item 4')).not.toBeInTheDocument();
  });

  it('counts filled rows rather than rows', async () => {
    renderForm();

    expect(screen.getByText('0 items')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Item 1'), 'Alien');

    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  // Arriving with rows written, from the catalog or from a result, leaves the
  // criterion as the one thing to do.
  it('focuses the criterion when the rows already hold text', () => {
    useListDraft.setState({ items: filledRows(3) });
    renderForm();

    expect(screen.getByLabelText(en.form.criterionLabel)).toHaveFocus();
  });

  it('leaves the focus alone on a form with nothing written', () => {
    renderForm();

    expect(document.activeElement).toBe(document.body);
  });

  // A picked list turns into ordinary rows, so the form holds it to the same
  // rules as one typed by hand.
  it('checks a picked list the way it checks a typed one', async () => {
    useListDraft
      .getState()
      .seedItems([
        { text: 'Apple', imageUrl: 'http://example.com/apple.jpg' },
        { text: 'Banana' },
        { text: 'Cherry' },
      ]);
    useListDraft.setState({ criterion: 'Which one do you like more?' });
    renderForm();

    expect(screen.getByText(en.form.imageUrlRejected)).toBeInTheDocument();

    const second = screen.getByLabelText('Item 2');
    await userEvent.clear(second);
    await userEvent.type(second, 'apple');
    expect(screen.getAllByText(en.form.duplicateFlag)).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Remove item 3' }));
    expect(screen.getByRole('button', { name: en.form.continue })).toBeDisabled();
  });

  it('opens the catalog', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: en.catalog.browse }));

    expect(useListDraft.getState().screen).toBe('catalog');
  });

  it('translates its own labels when the language changes', async () => {
    const i18n = renderForm();
    await userEvent.type(screen.getByLabelText('Item 1'), 'Alien');

    await act(() => i18n.changeLanguage('es'));

    expect(screen.getByLabelText('Elemento 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Añadir elemento' })).toBeInTheDocument();
    expect(screen.getByText('1 elemento')).toBeInTheDocument();
  });
});
