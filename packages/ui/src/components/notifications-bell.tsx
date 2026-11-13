// The bell: what the event hub wants the writer to see. It reads the same
// `notification.received` events that are stored in the interaction log, so
// nothing is shown here that the future model filter can't also learn from.

import { BellIcon } from 'lucide-react';
import { notificationBody, notificationSeverity, notificationTitle, useEvents } from '../events.tsx';
import { timeAgo } from '../lib/time.ts';
import { cn } from '../lib/utils.ts';
import { Button } from './ui/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.tsx';

const DOT: Record<string, string> = {
  info: 'bg-ai',
  success: 'bg-[var(--ins)]',
  warning: 'bg-[#b7791f]',
  error: 'bg-destructive',
};

export function NotificationsBell() {
  const { notifications, unread, markAllRead, clearNotifications } = useEvents();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Notifications" title="Notifications" className="relative">
          <BellIcon />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-brand text-[10px] leading-none font-medium text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {notifications.length > 0 && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <BellIcon className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Nothing needs your attention.</p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              A small model will decide what belongs here as Clearpen learns how you work.
            </p>
          </div>
        ) : (
          <>
            <div className="max-h-80 overflow-y-auto">
              {notifications.map((event) => {
                const body = notificationBody(event);
                return (
                  <div key={event.id} className="border-b px-3 py-2.5 last:border-0">
                    <div className="flex items-start gap-2">
                      <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', DOT[notificationSeverity(event)])} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{notificationTitle(event)}</p>
                        {body && <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>}
                        <p className="mt-0.5 text-[11px] text-muted-foreground/70">{timeAgo(event.at)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t p-2">
              <Button variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={clearNotifications}>
                Clear
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
