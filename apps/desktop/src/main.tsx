import '@clearpen/ui/styles.css';
import { App, type Backend } from '@clearpen/ui';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Component, type ErrorInfo, type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function reportError(where: string, err: unknown) {
  const e = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err);
  const line = `[${new Date().toISOString()}] ${where}: ${e}`;
  console.error(line);
  if (isTauri()) invoke('log_error', { message: line }).catch(() => {});
  return line;
}

window.addEventListener('error', (e) => {
  reportError('window.error', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  reportError('unhandledrejection', e.reason);
});

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
  }
  override componentDidCatch(err: unknown, info: ErrorInfo) {
    reportError(
      'render',
      `${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n${info.componentStack ?? ''}`,
    );
  }
  override render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-sm" style={{ whiteSpace: 'pre-wrap' }}>
          <strong>Clearpen hit an error while drawing the window.</strong>
          {'\n\n'}
          {this.state.error}
          {'\n\n'}The details were written to /tmp/clearpen-js.log.
        </div>
      );
    }
    return this.props.children;
  }
}

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
        <ErrorBoundary>
          <App backend={b} />
        </ErrorBoundary>
      </StrictMode>,
    ),
  )
  .catch((err) => {
    root.textContent = `Clearpen couldn’t open your library: ${err instanceof Error ? err.message : String(err)}`;
    root.className = 'p-8 text-sm';
    reportError('open library', err);
  });
