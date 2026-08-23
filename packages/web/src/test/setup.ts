import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Testing Library only registers its own cleanup when Vitest runs with globals.
afterEach(cleanup);
