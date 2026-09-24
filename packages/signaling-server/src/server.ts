import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { RequestHandler } from 'express';
import { ExpressPeerServer } from 'peer';
import type { IClient } from 'peer';
import type { Config } from './config.ts';
import { createIceServers } from './iceServers.ts';
import { createRateLimiter } from './rateLimit.ts';
import { normalizeRoomCode } from './roomCode.ts';
import type { Pick } from './roomCode.ts';
import { RoomRegistry } from './rooms.ts';

// Room for a few typos from people on the same wifi. Guessing one room out of
// 923,521 codes at this pace takes months from a single address.
export const MAX_MISSES = 10;
export const MISS_WINDOW_MS = 5 * 60 * 1000;

export type SignalingOptions = Omit<Config, 'port'> & {
  pick?: Pick;
  now?: () => number;
  // Stands in for Metered in the tests.
  fetcher?: typeof fetch;
};

// The app runs on Vercel and calls this server from another origin.
function allowOrigin(origin: string): RequestHandler {
  return (req, res, next) => {
    res.set('Access-Control-Allow-Origin', origin);
    // A page on another origin only sees a handful of headers unless it is told
    // it may read more, and the app needs this one to say how long to wait.
    res.set('Access-Control-Expose-Headers', 'Retry-After');
    if (req.method !== 'OPTIONS') return next();
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(204);
  };
}

export function createSignalingServer({
  allowedOrigin,
  proxies,
  metered,
  pick,
  now,
  fetcher,
}: SignalingOptions) {
  const app = express();
  const server = createServer(app);
  // peer never reads the client's address, so it gets no `proxied` of its own
  // and its app inherits this setting when mounted.
  if (proxies > 0) app.set('trust proxy', proxies);

  const rooms = new RoomRegistry(pick);
  const misses = createRateLimiter({ limit: MAX_MISSES, windowMs: MISS_WINDOW_MS, now });
  const connected = new Map<string, IClient>();
  const iceServers = createIceServers({ metered, fetcher, now });

  const peerServer = ExpressPeerServer(server, {
    // A room code only leads to its host's ID, so that ID must be impossible to
    // guess, and no route may list the IDs that are connected.
    generateClientId: randomUUID,
    allow_discovery: false,
    corsOptions: { origin: allowedOrigin },
  });

  peerServer.on('connection', (client) => connected.set(client.getId(), client));
  peerServer.on('disconnect', (client) => {
    connected.delete(client.getId());
    rooms.release(client.getId());
  });
  // Without a listener, the first message that is not JSON would throw from
  // peer's emitter and take the whole server down. Every error it reports
  // belongs to one client's socket, which is already dealt with.
  peerServer.on('error', () => {});

  app.use('/rooms', allowOrigin(allowedOrigin), express.json());

  // A code has to lead to someone: only a peer connected right now may hold one.
  app.post('/rooms', (req, res) => {
    const peerId = req.body?.peerId;
    if (typeof peerId !== 'string' || !connected.has(peerId)) return res.sendStatus(409);

    const code = rooms.open(peerId);
    if (code === null) return res.sendStatus(503);
    res.status(201).json({ code });
  });

  app.get('/rooms/:code', (req, res) => {
    const ip = req.ip ?? '';
    // Checked before the lookup. A blocked address learns nothing, not even from a real code.
    const wait = misses.blockedFor(ip);
    if (wait > 0) {
      res.set('Retry-After', String(Math.ceil(wait / 1000)));
      return res.sendStatus(429);
    }

    const peerId = rooms.resolve(normalizeRoomCode(req.params.code));
    if (peerId === undefined) {
      misses.recordMiss(ip);
      return res.sendStatus(404);
    }
    res.json({ peerId });
  });

  // Asked before every Peer is created. The TURN credentials in it are why the
  // list comes from here: the Metered key stays on this server.
  app.use('/ice-servers', allowOrigin(allowedOrigin));
  app.get('/ice-servers', async (_req, res) => {
    res.json({ iceServers: await iceServers() });
  });

  app.use(peerServer);

  return {
    listen(port: number) {
      return new Promise<number>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, () => resolve((server.address() as AddressInfo).port));
      });
    },

    // An upgraded WebSocket is no longer the HTTP server's to close, and close()
    // alone would wait on it forever.
    close() {
      for (const client of connected.values()) client.getSocket()?.terminate();
      return new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
