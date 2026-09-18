import { Howl } from 'howler';
import { useSound } from '../state/soundStore.ts';

const names = ['pickup', 'drop', 'tie', 'error'] as const;

export type SoundName = (typeof names)[number];

const loaded = new Map<SoundName, Howl>();

function howl(name: SoundName) {
  let sound = loaded.get(name);
  if (!sound) {
    sound = new Howl({ src: [`${import.meta.env.BASE_URL}sounds/${name}.wav`] });
    loaded.set(name, sound);
  }
  return sound;
}

// Howler holds a play until its file has been fetched and decoded, so a sound
// first asked for mid-drag would land late, maybe after the drop. The sorting
// screen fetches them all on arrival instead, muted or not, so turning the
// sound back on does not bring the wait back. The form never downloads any.
export function preload() {
  names.forEach(howl);
}

export function play(name: SoundName) {
  if (!useSound.getState().muted) {
    howl(name).play();
  }
}
