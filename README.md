# MyRankingList

Web app for sorting a list of items by preference, dragging each item to the position you want. It can be used alone or in a shared room of up to 20 people, where everyone sorts the same list on their own and the results are compared at the end (consensus ranking, affinity between participants and items with the highest discrepancy).

No user accounts required. Rooms run P2P over WebRTC in a star topology: the creator acts as the host and holds the room state, so there is no application backend for the rooms: only a signaling server, and one small serverless function that checks image links.

## Status

Phase 10 (rooms over P2P) is complete: a room can be created and joined, and everyone in it waits in a lobby. When the signaling server has a Metered key, a connection that STUN cannot open goes through Metered's TURN; that has only been tested against a fake Metered, and trying it across real networks waits for the deployment in Phase 16. Phase 11 (sorting in a room) is complete. Once a second person is in, the creator can start the room: everyone gets the list with a shuffle of their own, and anyone who arrives after that is told the room has already started. While sorting, a row of avatars shows how many items each person has placed, with nothing about where. The creator can remove anyone, in the lobby or mid-sort, after confirming; the person removed is told so, and during sorting they cannot get back in. Finishing and the results come in Phase 13. Solo mode is complete: a list can be written or picked from the catalog, sorted and read back as a final ranking. The list input form from Phase 2 leads to the sorting screen: the current pool item on the left, the list built so far on the right, and a progress bar with a rocket travelling towards a flag. The pool item is dragged into a gap to insert it or onto an item to tie with it, and anything already in the list can be picked up and moved again. Clicking works as well as dragging: a gap takes the pool item, an item ties with it, and each placed card has a move button that picks it up so the next click puts it somewhere else. Two tied items share one position and one number, numbered the competition way, so whatever sits under a tie is a 4 and never a 3. Picking half a tie up takes it out of the list straight away: the partner is left holding the position on its own and the numbering closes up until the item lands somewhere. While dragging or hovering, the target under the cursor is marked green for an insertion, yellow for a tie and red where the drop is refused, which is a position already holding two other items or an untied item's own row. A refused drop, a drop outside the list and Escape all leave the list as it was. Below 768px wide the pool shrinks to a strip above the list, dragging is off and every placement and move is a tap, so a swipe over the list scrolls the page. The drag runs on dnd-kit over the pure placement rules in `packages/web/src/core`. Once the pool is empty the list can still be reordered, and a See result button opens the final list, with any tie shown as one card, from where the same items can be sorted again or taken back to the form.

The drag is read out as it happens: what was picked up, what letting go under the cursor would do, and what it did. A tie names the item on the other row, a pick-up that empties one names the partner left holding the position, and a drop that was turned down is told apart from one let go outside the list. The screen keeps a live region of its own for this, because dnd-kit's overwrites itself inside a frame and the pick-up was being talked over: each message waits a beat for the one before it, and a backlog collapses to the latest so the reading never trails the pointer. A tied position also carries a note only screen readers get, since on screen the shared container and the repeated number already say it.

Every placement gets the same feedback whether it was dragged or tapped. The carried card lifts, the position that takes an item settles into place and throws a small burst of dots, and a tie gets its own burst, pairs of yellow dots drawn into the shared container. A position that turns an item away shakes, and a refused drag flies back to where it was picked up. Four short sounds go with it: pick-up, drop, tie and error. They are placeholders synthesized from one timbre, waiting for the final sound design. Escape and putting a held item back make no sound, and the mute button in the header stays on through a reload of the tab. With "reduce motion" turned on in the OS nothing moves any more, though fades and sounds are kept.

The catalog is reached from the form with Browse preset lists. Its lists are JSON files under `packages/web/src/lists`, in a folder per language and category, and they are bundled into the app at build time. It can be searched by title or by anything inside a list, ignoring case and accents, and a list only shows in the languages it was written for. Picking one copies its items into the form, asking first if the form already holds something, and leaves the criterion for you to write.

Image links get two checks. The form marks a link that is not https or does not end in a jpg, jpeg, png, gif or webp path as soon as it is typed. A link that passes is then sent to `packages/web/api/validate-image.ts`, a function on the app's own origin that asks the image host what it really serves: a HEAD request, or a one-byte GET when the host refuses HEAD, following at most three redirects, and accepting only a JPEG, PNG, GIF or WebP `Content-Type`. It refuses private, loopback and link-local addresses, including the IPv6 and IPv4-mapped spellings, and it checks the address the connection is actually made to, so a hostname whose DNS answer changes cannot get around it. The mark from this check is only a notice: Continue stays enabled, and when the function cannot be reached (the Vite dev server has none) the row is simply left unmarked. An image that does not load still falls back to the placeholder.

`packages/web/vercel.json` sets a Content Security Policy that lets the page load its own files, images over https and confetti's worker, and nothing else. `vite preview` sends the same header, so the end-to-end run is held to it, with one addition: `connect-src` also lets in the local signaling server at `http://localhost:9000` and `ws://localhost:9000`. Both schemes are listed because peerjs asks for its ID over http before opening the WebSocket, and Chrome does not count a `ws:` source as covering http. The production signaling host is not in `vercel.json` yet, since the Render service does not exist; it goes in, under `https://` and `wss://`, when the app is deployed. The dev server sends no policy at all, because the React plugin puts an inline script in the page that the policy blocks.

`packages/signaling-server` is where two browsers will find each other before a room goes peer to peer. It runs the PeerJS server (`peer`), which relays the WebRTC offers, answers and ICE candidates, with three routes of its own on the same port. `POST /rooms` with `{ "peerId": "..." }` gives a host that is connected to `peer` a 4-character room code, drawn from 31 characters that leave out I, L, O, 0 and 1. `GET /rooms/:code` turns the code, typed in any case, back into the host's peer ID, a random UUID the server generated. Only the code can be guessed, so the lookup allows 10 wrong codes per address every 5 minutes; after that every lookup gets a 429 until the window ends, a real code included. A code is freed as soon as its host disconnects. The server also names `Retry-After` in `Access-Control-Expose-Headers`, since the app runs on another origin and the browser would otherwise hide the wait from it. `GET /ice-servers` lists the STUN and TURN servers a Peer should use: Google's STUN always, and Metered's TURN servers when the server has a Metered key. That list is kept for 10 minutes, so most rooms cost Metered no request, and if Metered fails the answer is STUN alone. The key never leaves the server.

Create room sits next to Continue on the form and needs the same things: three items and a criterion. It asks for a nickname, opens a Peer, gets a code from the server and shows the lobby, and from then on the room's list is a copy taken at that moment. Join a room, above the form, asks for the code and a nickname. A link of the form `/?room=CODE` opens that screen with the code filled in. A code with a character no code can have is turned down on the spot, so a typo does not cost one of the 10 wrong codes. Each guest opens a single data channel to the host and nothing else: the host hands out ids of its own and never passes anyone's peer ID on. Nicknames are compared ignoring case and surrounding spaces, and a repeat gets the lowest free suffix, so a second "juan" next to "Juan" becomes "juan (2)". The lobby shows the code with a Copy link button, the criterion and the people in the room out of 20, with the creator and yourself marked, and it reads out who joins and who leaves. A guest who leaves or closes the tab drops off everyone's list straight away. The host is asked before closing the room, and the guests are then told it closed and sent back to the form. A guest who typed the code gets `?room=` in the address once inside, the same as one who came by link. Going back to the form removes it, so a reload does not reopen the join screen of a room that is gone. Before every Peer the app asks the signaling server for its ICE servers, and if it cannot get them it goes on with Google's STUN. It never falls back to peerjs's defaults, which bring PeerJS's own public TURN servers. `packages/web/src/room/session.ts` is the only module that imports `peerjs`; everything it decides with is in the pure modules next to it.

## Stack

- TypeScript in both packages
- Frontend: React + Vite, dnd-kit, Zustand, Framer Motion, Howler.js, react-i18next
- P2P and signaling: PeerJS (`peerjs` on the client, `peer` on the server)
- Testing: Vitest, React Testing Library, Playwright

## Requirements

Node 22 (the exact version is pinned in `.nvmrc` and in the `engines` field of `package.json`).

## Structure

```
packages/
  web/                React + Vite frontend
    api/              Vercel functions (image validation)
    src/lists/        Preset list catalog, one JSON file per list
  signaling-server/   Node + TypeScript signaling server (PeerJS and room codes)
```

The repository is a monorepo with npm workspaces. The TypeScript, ESLint and Prettier configuration is shared and lives at the root.

## Installation

```
npm install
```

A single `npm install` at the root installs the dependencies of both packages.

## Scripts

From the root, applying to every package:

- `npm run build`
- `npm run lint`
- `npm run format` (`format:check` to only report)
- `npm run type-check`
- `npm test`
- `npm run e2e` runs the Playwright suite against a production build (`npx playwright install chromium` once first)

Inside `packages/web`:

- `npm run dev` starts the Vite development server
- `npm run preview` serves the production build, with the Content Security Policy header

Rooms need the signaling server running too. With `npm run dev` in `packages/signaling-server` and `npm run dev` in `packages/web`, two browser windows (one of them private) can create and join a room on the same machine. The app finds the server through `VITE_SIGNALING_URL`, read at build time and defaulting to `http://localhost:9000`, so nothing needs setting locally.

To try a room between two devices on the same network, both servers have to listen on the machine's LAN address and know about each other. With `192.168.1.20` standing in for that address, run the signaling server with `ALLOWED_ORIGIN=http://192.168.1.20:5173` and the app with `VITE_SIGNALING_URL=http://192.168.1.20:9000 npm run dev -- --host`, then open `http://192.168.1.20:5173` on both. In PowerShell each variable is set first, as in `$env:ALLOWED_ORIGIN = 'http://192.168.1.20:5173'`. Over plain http the browser offers no clipboard, so Copy link does not show there and the code has to be read out.

Inside `packages/signaling-server`:

- `npm run dev` runs the server from source with tsx
- `npm test` runs its unit and integration tests, which the root `npm test` also runs
- `npm run build` compiles it to `dist`, without the tests
- `npm start` runs the compiled build

The server starts with no variables set. `PORT` defaults to 9000, and `ALLOWED_ORIGIN`, the only origin CORS lets call it, defaults to the Vite dev server at `http://localhost:5173`. `PROXIED` is the number of proxies in front of the server that append to `X-Forwarded-For`, 0 by default. The rate limit counts wrong codes by the address the outermost of those proxies saw, so behind a proxy this has to be set, or every user shares one address and a single guesser blocks them all. `METERED_DOMAIN` (the app's domain on Metered, like `myapp.metered.live`) and `METERED_API_KEY` (the API key of a TURN credential in that app) turn TURN on, and they are set both or neither; with only one the server refuses to start. The key belongs in the environment of the shell or of Render, never in a committed file. Without TURN, two people behind strict NATs, like a phone on mobile data, may not connect at all.

`curl http://localhost:9000/ice-servers` shows which list the server is handing out.

## CI

GitHub Actions runs the format check, lint, type-check, the test suites of both packages and the build on every pull request. A second job runs alongside it with the Playwright suite, in desktop Chrome and in a Pixel 7 emulation where every placement is a tap. Two flows are walked from the form to the result: one typed by hand, with a tie, that goes back into sorting, and one picked from the catalog, edited and sorted. The room spec starts the signaling server next to the preview and opens three browser contexts: one creates a room, one joins by typing the code, one opens the copied link with a nickname that collides, and all three have to see each other, and then one fewer once a guest closes their tab. Another spec checks the Content Security Policy header, and every test fails if the policy blocked anything while it ran. There are no retries, so a flaky run shows up as a failure, and when it fails the HTML report with the trace is attached to the run.

## Deployment

Planned for a later phase: `packages/web` on Vercel as a static build with the function in `api/`, and `packages/signaling-server` on Render as a persistent Node service (required to keep the WebSocket connections open). The signaling server runs locally but is not deployed; on Render it will need `ALLOWED_ORIGIN` set to the app's URL, `PROXIED` to match Render's proxies, `METERED_DOMAIN` and `METERED_API_KEY` for TURN, and `NODE_ENV` set to `production`, without which Express answers a malformed request with its stack trace. On Vercel the app will need `VITE_SIGNALING_URL` set to the Render URL, and that host added to `connect-src` in `vercel.json`. `packages/web/vercel.json` already exists with the security headers and nothing deploys from it yet; to try the image check locally, run `vercel dev` from `packages/web`, since `vite dev` does not serve `api/`.

## License

All rights reserved. The repository does not include a `LICENSE` file.
