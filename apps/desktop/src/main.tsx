import '@clearpen/ui/styles.css';
import { App, type Backend } from '@clearpen/ui';
import { isTauri } from '@tauri-apps/api/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

async function backend(): Promise<Backend> {
  if (isTauri()) return (await import('./desktop-backend.ts')).createDesktopBackend();
  if (import.meta.env.DEV) return (await import('./browser-backend.ts')).createBrowserBackend();
  throw new Error('Clearpen runs as the desktop app.');
}

const root = document.getElementById('root')!;

backend()
  .then((b) =>
    createRoot(root).render(
      <StrictMode>
        <App backend={b} />
      </StrictMode>,
    ),
  )
  .catch((err) => {
    console.error(err);
    root.textContent = `Clearpen couldn’t open your library: ${err instanceof Error ? err.message : String(err)}`;
    root.className = 'p-8 text-sm';
  });
