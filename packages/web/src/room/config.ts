// Fixed at build time. The fallback is where the signaling server listens when
// started with no variables, so dev, preview and the E2E need no .env.
export const SIGNALING_URL: string = import.meta.env.VITE_SIGNALING_URL || 'http://localhost:9000';
