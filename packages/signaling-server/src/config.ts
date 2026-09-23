export type Config = {
  port: number;
  allowedOrigin: string;
  // How many proxies sit in front of the server and append to X-Forwarded-For.
  proxies: number;
};

// The defaults are for running next to the Vite dev server, with no .env file.
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const proxies = Number(env.PROXIED ?? 0);
  // A typo here would quietly put every user behind the proxy's single address,
  // where one person guessing codes blocks everyone.
  if (!Number.isInteger(proxies) || proxies < 0) {
    throw new Error(`PROXIED must be a number of proxies, got "${env.PROXIED}"`);
  }

  return {
    port: Number(env.PORT ?? 9000),
    allowedOrigin: env.ALLOWED_ORIGIN ?? 'http://localhost:5173',
    proxies,
  };
}
