import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // sdk-wire-contract.test.mjs is a standalone `node` script (it calls
    // process.exit and hits the live manifest), not a vitest suite. Running it
    // under vitest hangs the worker on exit. Run it via `npm run test:wire`.
    exclude: ['**/node_modules/**', '**/dist/**', 'test/sdk-wire-contract.test.mjs'],
  },
});
