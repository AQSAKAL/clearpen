import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tauri loads the dev build from a fixed port and bundles the production
// build from dist/ (see src-tauri/tauri.conf.json).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // @clearpen/ui's components import each other by package name.
    alias: [
      { find: /^@clearpen\/ui(?=\/|$)/, replacement: fileURLToPath(new URL('../../packages/ui/src', import.meta.url)) },
    ],
  },
  clearScreen: false, // keep Rust's errors on screen
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
});
