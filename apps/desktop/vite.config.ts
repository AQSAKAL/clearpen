import { defineConfig } from 'vite';

// Tauri loads the dev build from a fixed port and bundles the production
// build from dist/ (see src-tauri/tauri.conf.json).
export default defineConfig({
  clearScreen: false, // keep Rust's errors on screen
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
});
