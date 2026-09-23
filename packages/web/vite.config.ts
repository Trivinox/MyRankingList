import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The policy lives in vercel.json, where production reads it, and the preview
// server sends the same one, so the end-to-end run is held to what Vercel will
// serve. The dev server does not: the React plugin injects an inline script
// into the page there, which this policy would block.
const { headers: rules } = JSON.parse(
  readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'),
);
// Plus the signaling server the E2E starts next to the preview, under both
// schemes: peerjs asks it for an ID over http before opening the WebSocket,
// and Chrome does not let a ws source cover the http call.
const policy: string = rules[0].headers[0].value.replace(
  "connect-src 'self'",
  "connect-src 'self' http://localhost:9000 ws://localhost:9000",
);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: { headers: { 'Content-Security-Policy': policy } },
});
