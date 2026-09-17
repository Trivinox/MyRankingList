import { useSyncExternalStore } from 'react';

// Width alone decides, not whether the screen is touch. CSS cannot import this,
// so the `@media (max-width: 767px)` blocks in the module stylesheets repeat
// the number and have to move with it.
const query = '(max-width: 767px)';

function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
