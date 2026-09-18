import { Howl } from 'howler';
import { useSound } from '../state/soundStore.ts';

export type SoundName = 'pickup' | 'drop' | 'tie' | 'error';

const loaded = new Map<SoundName, Howl>();

// Each file is fetched the first time it is needed, so the form never
// downloads audio it has no use for.
export function play(name: SoundName) {
  if (useSound.getState().muted) {
    return;
  }
  let sound = loaded.get(name);
  if (!sound) {
    sound = new Howl({ src: [`${import.meta.env.BASE_URL}sounds/${name}.wav`] });
    loaded.set(name, sound);
  }
  sound.play();
}
