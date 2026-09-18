// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom has no audio to play, so Howler is replaced by a stand-in that only
// records which files were asked for and how often one was played.
const howler = vi.hoisted(() => ({ files: [] as string[], play: vi.fn() }));

vi.mock('howler', () => ({
  Howl: vi.fn(function ({ src }: { src: string[] }) {
    howler.files.push(...src);
    return { play: howler.play };
  }),
}));

// Fresh modules for every test, so no file loaded by the one before is
// already sitting in the cache.
const load = async () => {
  vi.resetModules();
  const { play, preload } = await import('./sounds.ts');
  const { useSound } = await import('../state/soundStore.ts');
  return { play, preload, useSound };
};

beforeEach(() => {
  sessionStorage.clear();
  howler.files = [];
  howler.play.mockClear();
});

describe('play', () => {
  it('fetches all four up front, and plays from what was fetched', async () => {
    const { play, preload } = await load();

    preload();
    play('tie');
    play('tie');

    expect(howler.files).toEqual([
      '/sounds/pickup.wav',
      '/sounds/drop.wav',
      '/sounds/tie.wav',
      '/sounds/error.wav',
    ]);
    expect(howler.play).toHaveBeenCalledTimes(2);
  });

  it('fetches a sound on first play if nothing preloaded it', async () => {
    const { play } = await load();

    expect(howler.files).toEqual([]);

    play('drop');
    play('drop');
    play('tie');

    expect(howler.files).toEqual(['/sounds/drop.wav', '/sounds/tie.wav']);
    expect(howler.play).toHaveBeenCalledTimes(3);
  });

  it('stays silent while muted and plays again once the sound is back on', async () => {
    const { play, useSound } = await load();

    useSound.getState().toggleMuted();
    play('pickup');
    expect(howler.play).not.toHaveBeenCalled();

    useSound.getState().toggleMuted();
    play('pickup');
    expect(howler.play).toHaveBeenCalledTimes(1);
  });
});
