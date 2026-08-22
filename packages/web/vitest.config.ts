import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Phase 1 is pure logic with no DOM dependency. Component tests (phase 2+)
    // opt into jsdom per file with a `// @vitest-environment jsdom` docblock
    // instead of paying for it globally here.
    environment: 'node',
    // This groundwork PR ships the test runner before any test file exists
    // (the first real suite lands with 1.1); without this, an empty package
    // fails CI on a technicality rather than a real problem.
    passWithNoTests: true,
  },
});
