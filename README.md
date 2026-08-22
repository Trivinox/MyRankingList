# MyRankingList

Web app for sorting a list of items by preference, dragging each item to the position you want. It can be used alone or in a shared room of up to 20 people, where everyone sorts the same list on their own and the results are compared at the end (consensus ranking, affinity between participants and items with the highest discrepancy).

No user accounts required. Rooms run P2P over WebRTC in a star topology: the creator acts as the host and holds the room state, so there is no application backend, only a signaling server.

## Status

Phase 1 (core logic). The monorepo, TypeScript configuration, linting and CI are in place. The sorting rules are being written as pure functions under `packages/web/src/core`, covered by unit tests; there is no interface on top of them yet.

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
