# MyRankingList

Web app for sorting a list of items by preference, dragging each one to the position you want. It works alone or in a shared room of up to 20 people, where everyone sorts the same list on their own and the results are compared at the end.

There are no user accounts. Rooms run peer to peer over WebRTC, with the creator's browser acting as host and holding the room state. The only server pieces are a signaling server and a small serverless function that checks image links.

## Features

- Solo mode: write a list or pick one from the preset catalog, sort it and get a final ranking.
- Items are placed by drag and drop or by clicking, and two items can be tied in the same position. On phones every move is a tap.
- Animations, sounds and screen reader announcements for every placement. "Reduce motion" in the OS turns the movement off.
- A catalog of preset lists, searchable by title or content, per language.
- Rooms joined with a 4-character code or a link. The creator starts the sort, sees everyone's progress and can remove people.
- Reconnection: a guest who drops or reloads mid-sort gets their place and their list back, and a creator who drops gets the room back, under a new code if it took too long.
- In a room, each person hands their list in with Finish once everything is placed. After that it is locked, the others see a tick on their avatar, and a reload comes back to the waiting screen.
- Once the last list is in, everyone sees the result at the same moment: the room's combined ranking, how alike each pair of lists is (a grid up to 8 people, and above that who is most and least like you), the items the room split on most, and your own list next to anyone else's. Lists of people who dropped after finishing still count; people the creator removed do not.
- From the result the creator can play another round in the same room: the same items under the same or a new criterion, or a new list written on the form while the others wait in the lobby. Everyone connected starts over with a shuffle of their own. Anyone away at that moment is left out of the new round, and nobody new can join it.

Phase 13 completes the room, from joining to playing again. Phase 14 extends the end-to-end tests over the whole of it, and the visual design, the final sounds and the deployment come after that.

## Stack

- TypeScript in both packages
- Frontend: React + Vite, dnd-kit, Zustand, Framer Motion, Howler.js, react-i18next
- P2P and signaling: PeerJS (`peerjs` on the client, `peer` on the server)
- Testing: Vitest, React Testing Library, Playwright

## Structure

```
packages/
  web/                React + Vite frontend
    api/              Vercel functions (image validation)
    src/lists/        Preset list catalog, one JSON file per list
  signaling-server/   Node signaling server (PeerJS and room codes)
```

A monorepo with npm workspaces. The TypeScript, ESLint and Prettier configuration lives at the root.

## Getting started

Node 22 is required (pinned in `.nvmrc`). A single `npm install` at the root installs both packages.

From the root:

- `npm run build`, `npm run lint`, `npm run type-check`, `npm test`
- `npm run format` (`format:check` to only report)
- `npm run e2e` runs Playwright against a production build (run `npx playwright install chromium` once first)

For rooms, start the signaling server as well: `npm run dev` in `packages/signaling-server` and `npm run dev` in `packages/web`, then open two browser windows, one of them private. The app looks for the server at `VITE_SIGNALING_URL`, which defaults to `http://localhost:9000`.

The signaling server runs with no variables set. The ones that matter outside local development are `ALLOWED_ORIGIN` (the app's origin for CORS), `PROXIED` (number of proxies in front of it) and `METERED_DOMAIN` with `METERED_API_KEY`, which turn on Metered's TURN servers. Without TURN, two people behind strict NATs may not connect at all.

## CI

Every pull request runs the format check, lint, type-check, both test suites and the build on GitHub Actions, plus the Playwright suite in desktop Chrome and a Pixel 7 emulation.

## Deployment

Not deployed yet. The plan is `packages/web` on Vercel and `packages/signaling-server` on Render, which keeps the WebSocket connections open.

## License

All rights reserved. The repository does not include a `LICENSE` file.
