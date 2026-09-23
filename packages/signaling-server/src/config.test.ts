import { describe, expect, it } from 'vitest';
import { readConfig } from './config.ts';

describe('readConfig', () => {
  it('runs next to the Vite dev server when nothing is set', () => {
    expect(readConfig({})).toEqual({
      port: 9000,
      allowedOrigin: 'http://localhost:5173',
      proxies: 0,
    });
  });

  it('reads the port, the origin and the number of proxies', () => {
    const env = { PORT: '10000', ALLOWED_ORIGIN: 'https://example.app', PROXIED: '1' };
    expect(readConfig(env)).toEqual({
      port: 10000,
      allowedOrigin: 'https://example.app',
      proxies: 1,
    });
  });

  it('refuses a PROXIED that is not a count', () => {
    expect(() => readConfig({ PROXIED: 'true' })).toThrow('PROXIED');
  });
});
