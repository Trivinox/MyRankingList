// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from '../i18n/index.ts';
import { en } from '../i18n/locales/en.ts';
import type { Participant } from '../room/hostRoom.ts';
import { ParticipantAvatar } from './ParticipantAvatar.tsx';
import styles from './ParticipantAvatar.module.css';

const juan: Participant = {
  id: 'j',
  nickname: 'juan',
  isCreator: false,
  progress: 3,
  connected: true,
};

function renderAvatar(props: Partial<Parameters<typeof ParticipantAvatar>[0]> = {}) {
  const i18n = createI18n();
  const { container } = render(
    <I18nextProvider i18n={i18n}>
      <ParticipantAvatar participant={juan} place={0} isYou={false} {...props} />
    </I18nextProvider>,
  );
  const fill = () => container.querySelectorAll('circle')[1].getAttribute('stroke-dasharray');
  return { i18n, fill };
}

describe('ParticipantAvatar', () => {
  it('shows the initial, capitalised, and the nickname as typed', () => {
    renderAvatar();

    expect(screen.getByText('J', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('juan', { exact: true })).toBeInTheDocument();
  });

  it.each([
    [0, '0 1'],
    [3, '0.375 1'],
    [8, '1 1'],
  ])('fills the ring for %i of 8 placed', (progress, dasharray) => {
    const { fill } = renderAvatar({ participant: { ...juan, progress }, total: 8 });

    expect(fill()).toBe(dasharray);
  });

  it('says who they are and how far along, in one label', () => {
    const { i18n } = renderAvatar({ total: 8 });

    expect(
      screen.getByRole('img', {
        name: i18n.t('room.placed', { nickname: 'juan', placed: 3, total: 8 }),
      }),
    ).toBeInTheDocument();
  });

  it('says someone is away, keeping their count and fading their ring', () => {
    const { i18n, fill } = renderAvatar({ participant: { ...juan, connected: false }, total: 8 });

    const badge = screen.getByRole('img', {
      name: i18n.t('room.placedAway', { nickname: 'juan', placed: 3, total: 8 }),
    });
    expect(badge).toHaveClass(styles.away);
    expect(fill()).toBe('0.375 1');
  });

  // Nobody has a list in the lobby, so there is nothing to count yet.
  it('leaves the ring empty and says only the name when there is no list', () => {
    const { fill } = renderAvatar();

    expect(fill()).toBe('0 1');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('marks the user and the creator', () => {
    renderAvatar({ isYou: true, participant: { ...juan, isCreator: true } });

    expect(screen.getByText(en.room.lobby.you)).toBeInTheDocument();
    expect(screen.getByText(en.room.lobby.creator)).toBeInTheDocument();
  });

  it('marks only the user in a row of avatars', () => {
    renderAvatar({ isYou: true, participant: { ...juan, isCreator: true }, stacked: true });

    expect(screen.getByText(en.room.lobby.you)).toBeInTheDocument();
    expect(screen.queryByText(en.room.lobby.creator)).not.toBeInTheDocument();
  });

  it('marks nobody else', () => {
    renderAvatar();

    expect(screen.queryByText(en.room.lobby.you)).not.toBeInTheDocument();
    expect(screen.queryByText(en.room.lobby.creator)).not.toBeInTheDocument();
  });
});
