// One stream for everything that happens. The Rust hub broadcasts an event;
// this provider stores it in the interaction log and turns the ones marked as
// notifications into a toast and an entry in the bell.
//
// The log is intentionally raw. A later small model can read `interactions`
// and decide which events deserve attention; today every notification is
// shown, and nothing is hidden.

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { AppEvent, Backend, EventInput } from './backend.ts';

export type EventSeverity = 'info' | 'success' | 'warning' | 'error';

export interface NotifyInput {
  title: string;
  body?: string;
  severity?: EventSeverity;
}

interface EventValue {
  /** The events this session has seen, newest first. */
  recent: AppEvent[];
  /** The subset that asked for attention. */
  notifications: AppEvent[];
  unread: number;
  emit(event: EventInput): void;
  /** A notification for the writer, also stored in the log. */
  notify(input: NotifyInput): void;
  markAllRead(): void;
  clearNotifications(): void;
}

interface EventState {
  recent: AppEvent[];
  notifications: AppEvent[];
  unread: number;
}

interface EventActions {
  emit(event: EventInput): void;
  notify(input: NotifyInput): void;
  markAllRead(): void;
  clearNotifications(): void;
}

// State and actions are separate contexts so emitting an event doesn't
// re-render every component that can emit one. Without this, an effect that
// emits on mount would re-run when the event list changed, and loop.
const EventStateContext = createContext<EventState | null>(null);
const EventActionsContext = createContext<EventActions | null>(null);
const NOTIFICATION = 'notification.received';

export function isNotification(event: AppEvent): boolean {
  return event.kind === NOTIFICATION;
}

function field(data: unknown, key: string): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function notificationTitle(event: AppEvent): string {
  return field(event.data, 'title') ?? 'A notification';
}

export function notificationBody(event: AppEvent): string | undefined {
  return field(event.data, 'body');
}

export function notificationSeverity(event: AppEvent): EventSeverity {
  const value = field(event.data, 'severity');
  return value === 'success' || value === 'warning' || value === 'error' ? value : 'info';
}

function showToast(event: AppEvent) {
  const title = notificationTitle(event);
  const body = notificationBody(event);
  const options = body ? { description: body } : undefined;
  const severity = notificationSeverity(event);
  const send =
    severity === 'error'
      ? toast.error
      : severity === 'warning'
        ? toast.warning
        : severity === 'success'
          ? toast.success
          : toast.info;
  send(title, options);
}

export function EventProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  const [recent, setRecent] = useState<AppEvent[]>([]);
  const [notifications, setNotifications] = useState<AppEvent[]>([]);
  const [unread, setUnread] = useState(0);
  // Events can arrive before the recent-history query returns; both share this.
  const seen = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    // Keep a season of context; the model filter doesn't need years of keystrokes.
    void backend.library.interactions.prune(Date.now() - 90 * 24 * 60 * 60 * 1000).catch(() => {});
    void backend.library.interactions
      .recent(200)
      .then((rows) => {
        if (cancelled) return;
        for (const row of rows) seen.current.add(row.id);
        setRecent(rows as AppEvent[]);
        setNotifications((rows as AppEvent[]).filter(isNotification));
      })
      .catch(() => {});

    const stop = backend.events.onEvent((event) => {
      if (seen.current.has(event.id)) return;
      seen.current.add(event.id);
      setRecent((all) => [event, ...all].slice(0, 300));
      void backend.library.interactions.add(event).catch(() => {});
      if (isNotification(event)) {
        setNotifications((all) => [event, ...all].slice(0, 100));
        setUnread((count) => count + 1);
        showToast(event);
      }
    });

    return () => {
      cancelled = true;
      stop();
    };
  }, [backend]);

  const emit = useCallback((event: EventInput) => backend.events.emit(event), [backend]);

  const notify = useCallback(
    (input: NotifyInput) => {
      const data = {
        title: input.title,
        ...(input.body ? { body: input.body } : {}),
        ...(input.severity ? { severity: input.severity } : {}),
      };
      backend.events.emit({ kind: NOTIFICATION, data });
    },
    [backend],
  );

  const markAllRead = useCallback(() => setUnread(0), []);
  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setUnread(0);
  }, []);

  const value = useMemo<EventState>(() => ({ recent, notifications, unread }), [recent, notifications, unread]);
  const actions = useMemo<EventActions>(
    () => ({ emit, notify, markAllRead, clearNotifications }),
    [emit, notify, markAllRead, clearNotifications],
  );

  return (
    <EventActionsContext.Provider value={actions}>
      <EventStateContext.Provider value={value}>{children}</EventStateContext.Provider>
    </EventActionsContext.Provider>
  );
}

/** Everything: the notification list, the count, and the ways to emit. */
export function useEvents(): EventValue {
  const state = useContext(EventStateContext);
  const actions = useContext(EventActionsContext);
  if (!state || !actions) throw new Error('useEvents needs an EventProvider');
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}

/**
 * Only the stable actions. Use this where a component emits events but does
 * not draw the notification list, so an event doesn't re-render it.
 */
export function useEventActions(): EventActions {
  const actions = useContext(EventActionsContext);
  if (!actions) throw new Error('useEventActions needs an EventProvider');
  return actions;
}
