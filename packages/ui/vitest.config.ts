import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: { alias: { '@margin/ui': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { name: 'ui', environment: 'happy-dom', setupFiles: ['./test/setup.ts'] },
});
