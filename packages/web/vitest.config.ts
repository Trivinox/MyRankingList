import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Component tests opt into jsdom per file instead of paying for it here.
    environment: 'node',
    passWithNoTests: true,
  },
});
