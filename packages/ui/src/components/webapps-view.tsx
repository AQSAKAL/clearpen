// Telegram, WhatsApp, X, Google and Wikipedia, beside the writing. Each is a real child
// webview owned by the desktop shell (not an iframe), so logins and sites that
// refuse to be framed work. The panel only says where the webview goes; the
// page itself is drawn by the native webview on top of that rectangle.
//
// Switching tabs hides the others instead of closing them: a chat stays where
// it was, and its session survives leaving this view or restarting Clearpen.

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BellIcon,
  ExternalLinkIcon,
  GlobeIcon,
  RotateCwIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { WebAppBounds } from '../backend.ts';
import { notificationBody, notificationTitle, useEvents } from '../events.tsx';
import { useWebAppOverlay } from '../hooks/use-web-app-overlay.ts';
import { useLibrary } from '../library.tsx';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { APPS, type WebApp } from './web-apps.ts';

function boundsOf(el: HTMLElement): WebAppBounds {
  const rect = el.getBoundingClientRect();
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

/** An address, a bare domain, a localhost port, or a Google search. */
function toUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(value)) return `https://${value}`;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/.test(value)) return `http://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

export function WebAppsView({ active }: { active: WebApp }) {
  const { backend } = useLibrary();
  const service = backend.webapps;
  const hidden = useWebAppOverlay(!!service);
  const { notifications, unread, markAllRead } = useEvents();
  const [attempt, setAttempt] = useState(0);
  const [urls, setUrls] = useState<Record<string, string>>(() =>
    Object.fromEntries(APPS.map((app) => [app.key, app.url])),
  );
  const [draft, setDraft] = useState<string>(APPS[0]?.url ?? '');
  const [error, setError] = useState('');
  const host = useRef<HTMLDivElement>(null);

  const latest = notifications[0];
  const app = APPS.find((candidate) => candidate.key === active) ?? APPS[0]!;
  const address = urls[active] ?? app.url;

  useEffect(() => setDraft(address), [address]);

  // Opening creates a hidden child. Only this effect may put it on screen,
  // including when a slow first open finishes after a switch or unmount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt retries a failed open.
  useLayoutEffect(() => {
    const el = host.current;
    if (!service || !el || hidden) return;
    let current = true;
    let observer: ResizeObserver | undefined;
    setError('');
    const present = async () => {
      try {
        await service.open({ id: app.id, url: app.url });
        if (!current) return;
        const place = () => service.present(app.id, boundsOf(el));
        place();
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => {
            if (current) place();
          });
          observer.observe(el);
        }
        const url = await service.url(app.id).catch(() => null);
        if (current && url) setUrls((all) => ({ ...all, [app.key]: url }));
      } catch (err) {
        if (current) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void present();
    return () => {
      current = false;
      observer?.disconnect();
      service.present(app.id, null);
    };
  }, [service, hidden, app, attempt]);

  // Links and redirects inside the page update the address bar.
  useEffect(() => {
    if (!service) return;
    return service.onNavigate((id, url) => {
      const webapp = APPS.find((candidate) => candidate.id === id);
      if (webapp) setUrls((all) => ({ ...all, [webapp.key]: url }));
    });
  }, [service]);

  const go = (input: string) => {
    const url = toUrl(input);
    if (!url) return;
    service?.navigate(app.id, url);
    setUrls((all) => ({ ...all, [active]: url }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {service && (
        <form
          className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            go(draft);
          }}
        >
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Back"
            onClick={() => service?.action(app.id, 'back')}
          >
            <ArrowLeftIcon />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Forward"
            onClick={() => service?.action(app.id, 'forward')}
          >
            <ArrowRightIcon />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Reload"
            onClick={() => service?.action(app.id, 'reload')}
          >
            <RotateCwIcon />
          </Button>
          {app.browser ? (
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
              placeholder="Search Google, or enter an address"
              aria-label="Address"
              spellCheck={false}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate px-2 text-xs text-muted-foreground">{address}</span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open in browser"
            title="Open in browser"
            type="button"
            onClick={() => void backend.openLink(address)}
          >
            <ExternalLinkIcon />
          </Button>
        </form>
      )}

      {latest && unread > 0 && (
        <div className="flex shrink-0 items-start gap-2 border-b bg-muted/40 px-3 py-2">
          <BellIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">{notificationTitle(latest)}</p>
            {notificationBody(latest) && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{notificationBody(latest)}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6 shrink-0"
            aria-label="Dismiss notifications"
            title="Dismiss notifications"
            onClick={markAllRead}
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      )}

      <div className="relative min-h-0 flex-1 bg-background">
        <div ref={host} className="absolute inset-0" />

        {!service && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="max-w-md text-center">
              <GlobeIcon className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 font-medium">{app.name} opens inside Clearpen on desktop.</p>
              <Button className="mt-4" variant="outline" size="sm" onClick={() => void backend.openLink(address)}>
                <ExternalLinkIcon /> Open {app.name} in browser
              </Button>
            </div>
          </div>
        )}

        {service && !hidden && !error && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            Loading {app.name}…
          </div>
        )}

        {service && error && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="max-w-md text-center">
              <GlobeIcon className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 font-medium">The embedded browser couldn’t start.</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{error}</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </Button>
                <Button variant="outline" size="sm" onClick={() => void backend.openLink(app.url)}>
                  <ExternalLinkIcon />
                  Open in browser
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
