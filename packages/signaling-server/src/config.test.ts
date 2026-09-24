import { describe, expect, it } from 'vitest';
import { readConfig } from './config.ts';

describe('readConfig', () => {
  it('runs next to the Vite dev server when nothing is set', () => {
    expect(readConfig({})).toEqual({
      port: 9000,
      allowedOrigin: 'http://localhost:5173',
      proxies: 0,
      metered: null,
    });
  });

  it('reads the port, the origin, the number of proxies and Metered', () => {
    const env = {
      PORT: '10000',
      ALLOWED_ORIGIN: 'https://example.app',
      PROXIED: '1',
      METERED_DOMAIN: 'example.metered.live',
      METERED_API_KEY: 'key',
    };
    expect(readConfig(env)).toEqual({
      port: 10000,
      allowedOrigin: 'https://example.app',
      proxies: 1,
      metered: { domain: 'example.metered.live', apiKey: 'key' },
    });
  });

  it('refuses a PROXIED that is not a count', () => {
    expect(() => readConfig({ PROXIED: 'true' })).toThrow('PROXIED');
  });

  it('refuses half of the Metered settings', () => {
    expect(() => readConfig({ METERED_DOMAIN: 'example.metered.live' })).toThrow('METERED');
    expect(() => readConfig({ METERED_API_KEY: 'key' })).toThrow('METERED');
  });
});
