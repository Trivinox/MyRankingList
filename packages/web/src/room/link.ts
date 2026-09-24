// A room's link is the app with its code in the query string. There is no
// router: the code is read when the app opens and when the join screen does.
const PARAM = 'room';

export const roomLink = (code: string) => `${window.location.origin}/?${PARAM}=${code}`;

export const linkedCode = () => new URLSearchParams(window.location.search).get(PARAM);

// A guest who typed the code gets the same address as one who followed the
// link, so a reload of the lobby lands on the join screen either way.
// Replaced rather than pushed: going back should not step into the form.
export function rememberRoomLink(code: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM, code);
  window.history.replaceState(window.history.state, '', url);
}

// Once the user is back on the form the room is behind them, and a reload
// must not open the join screen of a room that may be gone.
export function forgetRoomLink() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PARAM)) return;
  url.searchParams.delete(PARAM);
  window.history.replaceState(window.history.state, '', url);
}
