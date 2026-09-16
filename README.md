# MyRankingList

Web app for sorting a list of items by preference, dragging each item to the position you want. It can be used alone or in a shared room of up to 20 people, where everyone sorts the same list on their own and the results are compared at the end (consensus ranking, affinity between participants and items with the highest discrepancy).

No user accounts required. Rooms run P2P over WebRTC in a star topology: the creator acts as the host and holds the room state, so there is no application backend, only a signaling server.

## Status

Phase 4 (ties) is finished. The list input form from Phase 2 leads to the sorting screen: the current pool item on the left, the list built so far on the right, and a progress bar. The pool item is dragged into a gap to insert it or onto an item to tie with it, and anything already in the list can be picked up and moved again. Two tied items share one position and one number, numbered the competition way, so whatever sits under a tie is a 4 and never a 3. Picking half a tie up takes it out of the list straight away: the partner is left holding the position on its own and the numbering closes up until the item lands somewhere. While dragging, the target under the cursor is marked green for an insertion, yellow for a tie and red where the drop is refused, which is a position already holding two other items or an untied item's own row. A refused drop, a drop outside the list and Escape all leave the list as it was. The drag runs on dnd-kit over the pure placement rules in `packages/web/src/core`. The screen is desktop only: the click method and the mobile layout are Phase 5, and there is no result screen yet, so sorting stops once the pool is empty.

The drag is read out as it happens: what was picked up, what letting go under the cursor would do, and what it did. A tie names the item on the other row, a pick-up that empties one names the partner left holding the position, and a drop that was turned down is told apart from one let go outside the list. The screen keeps a live region of its own for this, because dnd-kit's overwrites itself inside a frame and the pick-up was being talked over: each message waits a beat for the one before it, and a backlog collapses to the latest so the reading never trails the pointer. A tied position also carries a note only screen readers get, the shared container and the repeated number being what say it on screen.

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

Inside `packages/web`:

- `npm run dev` starts the Vite development server
- `npm run preview` serves the production build

Inside `packages/signaling-server`:

- `npm run dev` runs the server with reload via tsx
- `npm start` runs the compiled build

## CI

GitHub Actions runs the format check, lint, type-check, the test suite and the build on every pull request. End-to-end tests will join the same workflow once there is an interface to drive.

## Deployment

Planned for a later phase: `packages/web` on Vercel as a static build, and `packages/signaling-server` on Render as a persistent Node service (required to keep the WebSocket connections open).

## License

All rights reserved. The repository does not include a `LICENSE` file.
