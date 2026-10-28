import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: { alias: { '@clearpen/ui': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    name: 'ui',
    environment: 'happy-dom',
    // A script from the web (TradingView's ticker tag) is appended, never fetched: happy-dom would otherwise report that as an error.
    environmentOptions: { happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: true } } },
    setupFiles: ['./test/setup.ts'],
  },
});
