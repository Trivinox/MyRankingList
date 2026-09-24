export type Metered = { domain: string; apiKey: string };

export type Config = {
  port: number;
  allowedOrigin: string;
  // How many proxies sit in front of the server and append to X-Forwarded-For.
  proxies: number;
  // Where TURN credentials come from. Without it rooms get STUN alone.
  metered: Metered | null;
};

// The defaults are for running next to the Vite dev server, with no .env file.
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const proxies = Number(env.PROXIED ?? 0);
  // A typo here would quietly put every user behind the proxy's single address,
  // where one person guessing codes blocks everyone.
  if (!Number.isInteger(proxies) || proxies < 0) {
    throw new Error(`PROXIED must be a number of proxies, got "${env.PROXIED}"`);
  }

  const domain = env.METERED_DOMAIN;
  const apiKey = env.METERED_API_KEY;
  // One without the other would fall back to STUN with nothing to show for it
  // until someone on mobile data fails to join.
  if (!domain !== !apiKey) {
    throw new Error('METERED_DOMAIN and METERED_API_KEY go together: set both or neither');
  }

  return {
    port: Number(env.PORT ?? 9000),
    allowedOrigin: env.ALLOWED_ORIGIN ?? 'http://localhost:5173',
    proxies,
    metered: domain && apiKey ? { domain, apiKey } : null,
  };
}
