import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  FilePenLineIcon,
  FolderOpenIcon,
  HomeIcon,
  TerminalIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils.ts';
import { useLibrary } from '../library.tsx';
import { NotificationsBell } from './notifications-bell.tsx';
import { Button } from './ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.tsx';
import { Separator } from './ui/separator.tsx';
import { SidebarTrigger, useSidebar } from './ui/sidebar.tsx';
import { APPS, type WebApp } from './web-apps.ts';

const spaces = [
  { key: 'writing', name: 'Writing', Icon: FilePenLineIcon },
  { key: 'home', name: 'Home', Icon: HomeIcon },
  { key: 'files', name: 'Files', Icon: FolderOpenIcon },
] as const;
export type WorkspaceView = (typeof spaces)[number]['key'] | WebApp;
const destinations = [...spaces, ...APPS];

export function AppNavigation({
  view,
  onView,
  terminal,
  onTerminal,
  children,
}: {
  view: WorkspaceView;
  onView(view: WorkspaceView): void;
  terminal: boolean;
  onTerminal(): void;
  children?: ReactNode;
}) {
  const { open, isMobile } = useSidebar();
  const { backend } = useLibrary();
  const showLibrary = !open || isMobile;
  const active = destinations.find((item) => item.key === view)!;
  const item = ({ key, name, Icon }: (typeof destinations)[number]) => (
    <DropdownMenuItem
      key={key}
      onSelect={() => onView(key)}
      aria-current={key === view ? 'page' : undefined}
      className="min-h-8 gap-2"
    >
      <Icon /> {name}
      {key === view && <CheckIcon className="ml-auto text-muted-foreground" />}
    </DropdownMenuItem>
  );

  return (
    <header
      data-tauri-drag-region
      className={cn(
        '@container flex min-h-12 shrink-0 flex-wrap items-center gap-1 border-b bg-background px-3 py-1.5',
        showLibrary && backend.overlayTitleBar && 'pl-20',
      )}
    >
      {showLibrary && <SidebarTrigger />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`Switch workspace: ${active.name}`} title="Switch workspace">
            <active.Icon className="text-muted-foreground" /> {active.name}{' '}
            <ChevronDownIcon className="size-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel>Workspace</DropdownMenuLabel>
          {spaces.map(item)}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Web apps</DropdownMenuLabel>
          {APPS.map((app) =>
            backend.webapps ? (
              item(app)
            ) : (
              <DropdownMenuItem key={app.key} asChild className="min-h-8 gap-2">
                <a href={app.url} target="_blank" rel="noopener noreferrer">
                  <app.Icon /> {app.name}
                  <ExternalLinkIcon className="ml-auto text-muted-foreground" />
                </a>
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <div data-tauri-drag-region className="min-h-6 flex-1" />
      {view === 'writing' ? (
        children
      ) : (
        <Button variant="ghost" size="sm" onClick={() => onView('writing')}>
          <ArrowLeftIcon /> Back to writing
        </Button>
      )}
      <Separator orientation="vertical" className="mx-1 h-4 self-center" />
      {(backend.terminal || backend.webTerminalUrl) && (
        <Button
          variant={terminal ? 'secondary' : 'ghost'}
          size="icon-sm"
          onClick={onTerminal}
          aria-label="Terminal"
          aria-pressed={backend.terminal ? terminal : undefined}
          title="Integrated terminal (Ctrl+`)"
        >
          <TerminalIcon />
        </Button>
      )}
      <NotificationsBell />
    </header>
  );
}
