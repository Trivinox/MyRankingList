# MyRankingList

Web app for sorting a list of items by preference, dragging each item to the position you want. It can be used alone or in a shared room of up to 20 people, where everyone sorts the same list on their own and the results are compared at the end (consensus ranking, affinity between participants and items with the highest discrepancy).

No user accounts required. Rooms run P2P over WebRTC in a star topology: the creator acts as the host and holds the room state, so there is no application backend, only a signaling server.

## Status

Phase 8 (the preset list catalog and the server-side image check) is finished, on top of a solo mode that was already complete: a list can be written or picked from the catalog, sorted and read back as a final ranking. The list input form from Phase 2 leads to the sorting screen: the current pool item on the left, the list built so far on the right, and a progress bar with a rocket travelling towards a flag. The pool item is dragged into a gap to insert it or onto an item to tie with it, and anything already in the list can be picked up and moved again. Clicking works as well as dragging: a gap takes the pool item, an item ties with it, and each placed card has a move button that picks it up so the next click puts it somewhere else. Two tied items share one position and one number, numbered the competition way, so whatever sits under a tie is a 4 and never a 3. Picking half a tie up takes it out of the list straight away: the partner is left holding the position on its own and the numbering closes up until the item lands somewhere. While dragging or hovering, the target under the cursor is marked green for an insertion, yellow for a tie and red where the drop is refused, which is a position already holding two other items or an untied item's own row. A refused drop, a drop outside the list and Escape all leave the list as it was. Below 768px wide the pool shrinks to a strip above the list, dragging is off and every placement and move is a tap, so a swipe over the list scrolls the page. The drag runs on dnd-kit over the pure placement rules in `packages/web/src/core`. Once the pool is empty the list can still be reordered, and a See result button opens the final list, with any tie shown as one card, from where the same items can be sorted again or taken back to the form.

The drag is read out as it happens: what was picked up, what letting go under the cursor would do, and what it did. A tie names the item on the other row, a pick-up that empties one names the partner left holding the position, and a drop that was turned down is told apart from one let go outside the list. The screen keeps a live region of its own for this, because dnd-kit's overwrites itself inside a frame and the pick-up was being talked over: each message waits a beat for the one before it, and a backlog collapses to the latest so the reading never trails the pointer. A tied position also carries a note only screen readers get, since on screen the shared container and the repeated number already say it.

Every placement gets the same feedback whether it was dragged or tapped. The carried card lifts, the position that takes an item settles into place and throws a small burst of dots, and a tie gets its own burst, pairs of yellow dots drawn into the shared container. A position that turns an item away shakes, and a refused drag flies back to where it was picked up. Four short sounds go with it: pick-up, drop, tie and error. They are placeholders synthesized from one timbre, waiting for the final sound design. Escape and putting a held item back make no sound, and the mute button in the header stays on through a reload of the tab. With "reduce motion" turned on in the OS nothing moves any more, though fades and sounds are kept.

The catalog is reached from the form with Browse preset lists. Its lists are JSON files under `packages/web/src/lists`, in a folder per language and category, and they are bundled into the app at build time. It can be searched by title or by anything inside a list, ignoring case and accents, and a list only shows in the languages it was written for. Picking one copies its items into the form, asking first if the form already holds something, and leaves the criterion for you to write.

Image links get two checks. The form marks a link that is not https or does not end in a jpg, jpeg, png, gif or webp path as soon as it is typed. A link that passes is then sent to `packages/web/api/validate-image.ts`, a function on the app's own origin that asks the image host what it really serves: a HEAD request, or a one-byte GET when the host refuses HEAD, following at most three redirects, and accepting only a JPEG, PNG, GIF or WebP `Content-Type`. It refuses private, loopback and link-local addresses, including the IPv6 and IPv4-mapped spellings, and it checks the address the connection is actually made to, so a hostname whose DNS answer changes cannot get around it. The mark from this check is only a notice: Continue stays enabled, and when the function cannot be reached (the Vite dev server has none) the row is simply left unmarked. An image that does not load still falls back to the placeholder.

`packages/web/vercel.json` sets a Content Security Policy that lets the page load its own files, images over https and confetti's worker, and nothing else. `vite preview` sends the same header, so the end-to-end run is held to it. The dev server does not, because the React plugin puts an inline script in the page that the policy blocks.

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
  signaling-server/   Node + TypeScript signaling server
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

Inside `packages/signaling-server`:

- `npm run dev` runs the server with reload via tsx
- `npm start` runs the compiled build

## CI

GitHub Actions runs the format check, lint, type-check, the test suite and the build on every pull request. A second job runs alongside it with the Playwright suite: one test of the whole solo flow, from the form to the result and back into sorting, in desktop Chrome and in a Pixel 7 emulation where every placement is a tap. It has no retries, so a flaky run shows up as a failure, and when it fails the HTML report with the trace is attached to the run.

## Deployment

Planned for a later phase: `packages/web` on Vercel as a static build with the function in `api/`, and `packages/signaling-server` on Render as a persistent Node service (required to keep the WebSocket connections open). `packages/web/vercel.json` already exists with the security headers and nothing deploys from it yet; to try the image check locally, run `vercel dev` from `packages/web`, since `vite dev` does not serve `api/`.

## License

All rights reserved. The repository does not include a `LICENSE` file.
