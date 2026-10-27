// The library: projects (titles only, collapsible), loose articles, search,
// drag-to-move, and the trash. Shadcn's Sidebar does the layout, the ⌘\
// toggle and the narrow-window sheet.

import type { DocumentSummary, Project } from '@clearpen/db';
import {
  ChevronRightIcon,
  FilePlusIcon,
  FolderIcon,
  FolderPlusIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import { type DragEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAsk } from '../ask.tsx';
import { timeAgo } from '../lib/time.ts';
import { cn } from '../lib/utils.ts';
import { useLibrary } from '../library.tsx';
import { useSettings } from '../settings.tsx';
import { ModelStatus } from './model-status.tsx';
import { Button } from './ui/button.tsx';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible.tsx';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './ui/context-menu.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu.tsx';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
  useSidebar,
} from './ui/sidebar.tsx';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.tsx';

const DRAG_TYPE = 'text/x-clearpen-doc';

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center font-serif text-[21px] font-semibold tracking-tight', className)}>
      Clear
      <span aria-hidden className="mx-[2px] inline-block h-[19px] w-[2px] rounded-full bg-brand" />
      pen
    </span>
  );
}

export function LibrarySidebar({
  onMove,
  onTrash,
  onModels,
}: {
  onMove(docId: string): void;
  onTrash(): void;
  onModels(): void;
}) {
  const lib = useLibrary();
  const { settings, set } = useSettings();
  const { prompt, confirm } = useAsk();
  const { isMobile, setOpenMobile } = useSidebar();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Set<string> | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Full-text search, a moment after typing stops, and again when the library changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: lib.docs changing means the results may have too.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setMatches(null);
      return;
    }
    const t = setTimeout(() => {
      lib.backend.library.documents
        .search(q)
        .then((found) => setMatches(new Set(found.map((d) => d.id))))
        .catch(() => setMatches(new Set()));
    }, 150);
    return () => clearTimeout(t);
  }, [query, lib.backend, lib.docs]);

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const visible = matches ? lib.docs.filter((d) => matches.has(d.id)) : lib.docs;
    const projects = lib.projects
      .map((p) => {
        const named = !!q && p.name.toLowerCase().includes(q);
        const docs = (named ? lib.docs : visible).filter((d) => d.projectId === p.id);
        return {
          project: p,
          docs,
          show: !q || named || docs.length > 0,
          total: lib.docs.filter((d) => d.projectId === p.id).length,
        };
      })
      .filter((g) => g.show);
    const loose = visible.filter((d) => !d.projectId);
    return { projects, loose };
  }, [lib.docs, lib.projects, matches, q]);

  const nothing = !!q && matches !== null && !groups.projects.length && !groups.loose.length;

  const openDoc = (id: string) => {
    lib.open(id).catch((err) => toast.error(String(err.message ?? err)));
    if (isMobile) setOpenMobile(false);
  };

  const newArticle = (projectId?: string) => {
    lib
      .create(projectId ? { projectId } : {})
      .then(() => isMobile && setOpenMobile(false))
      .catch((err) => toast.error(String(err.message ?? err)));
  };

  async function newProject() {
    const name = await prompt({
      title: 'New project',
      description: 'A project groups articles — a blog, a book, a series.',
      placeholder: 'Project name',
      action: 'Create',
    });
    if (!name) return;
    try {
      const p = await lib.createProject(name);
      newArticle(p.id);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function renameProject(p: Project) {
    const name = await prompt({ title: 'Rename project', value: p.name, action: 'Rename' });
    if (name && name !== p.name) await lib.renameProject(p.id, name).catch((err) => toast.error(err.message));
  }

  async function deleteProject(p: Project) {
    const ok = await confirm({
      title: `Delete “${p.name}”?`,
      description: 'Its articles stay in your library, outside any project.',
      action: 'Delete project',
      destructive: true,
    });
    if (!ok) return;
    const moved = await lib.deleteProject(p.id);
    toast(`Project deleted${moved ? ` · ${moved} article${moved === 1 ? '' : 's'} kept` : ''}`);
  }

  const toggle = (id: string, open: boolean) =>
    set('collapsed', open ? settings.collapsed.filter((x) => x !== id) : [...new Set([...settings.collapsed, id])]);

  // Drag an article onto a project, or onto "Articles" to take it out of one.
  const dropProps = (target: string | null) => ({
    onDragOver(e: DragEvent) {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTarget(target ?? '');
    },
    onDragLeave() {
      setDropTarget(null);
    },
    onDrop(e: DragEvent) {
      const id = e.dataTransfer.getData(DRAG_TYPE);
      setDropTarget(null);
      if (!id) return;
      e.preventDefault();
      const doc = lib.docs.find((d) => d.id === id);
      if (!doc || doc.projectId === target) return;
      lib.move(id, target).catch((err) => toast.error(err.message));
    },
  });

  const docItem = (d: DocumentSummary, sub: boolean) => {
    const ItemButton = sub ? SidebarMenuSubButton : SidebarMenuButton;
    const Item = sub ? SidebarMenuSubItem : SidebarMenuItem;
    return (
      <Item key={d.id}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <ItemButton
              asChild
              isActive={lib.current?.id === d.id}
              className={cn('w-full cursor-default text-left', !d.title && 'italic text-muted-foreground')}
            >
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_TYPE, d.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => openDoc(d.id)}
                title={`${d.title || 'Untitled'} · ${timeAgo(d.updatedAt)} · ${d.words.toLocaleString()} words`}
              >
                <span className="min-w-0 flex-1 truncate">{d.title || 'Untitled'}</span>
              </button>
            </ItemButton>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => onMove(d.id)}>Move to project…</ContextMenuItem>
            <ContextMenuItem variant="destructive" onSelect={() => lib.trash(d.id)}>
              Move to trash
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Item>
    );
  };

  return (
    <Sidebar>
      <SidebarHeader className="gap-2 pt-0">
        {/* Level with the top bar; on a Mac the window's buttons sit at its left. */}
        <div
          data-tauri-drag-region
          className={cn('flex h-12 shrink-0 items-center justify-between px-2', lib.backend.overlayTitleBar && 'pl-18')}
        >
          <Logo />
          <SidebarTrigger className="text-muted-foreground" />
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" className="flex-1 justify-start" onClick={() => newArticle()}>
            <FilePlusIcon /> New article
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={newProject} aria-label="New project">
                <FolderPlusIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New project</TooltipContent>
          </Tooltip>
        </div>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <SidebarInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="Search"
            aria-label="Search articles"
            className="pl-8"
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.projects.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Projects</SidebarGroupLabel>
            <SidebarMenu>
              {groups.projects.map(({ project: p, docs, total }) => {
                const open = !!q || !settings.collapsed.includes(p.id) || lib.current?.projectId === p.id;
                return (
                  <Collapsible
                    key={p.id}
                    asChild
                    open={open}
                    onOpenChange={(o) => toggle(p.id, o)}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          {...dropProps(p.id)}
                          className={cn('font-medium', dropTarget === p.id && 'bg-sidebar-accent ring-2 ring-ai/40')}
                        >
                          <ChevronRightIcon className="transition-transform group-data-[state=open]/collapsible:rotate-90" />
                          <FolderIcon className="text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <SidebarMenuBadge className="text-muted-foreground group-hover/menu-item:opacity-0">
                        {total}
                      </SidebarMenuBadge>
                      <SidebarMenuAction
                        showOnHover
                        className="right-7"
                        onClick={() => newArticle(p.id)}
                        title="New article in this project"
                      >
                        <PlusIcon />
                      </SidebarMenuAction>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuAction showOnHover title="Project options">
                            <MoreHorizontalIcon />
                          </SidebarMenuAction>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start">
                          <DropdownMenuItem onSelect={() => renameProject(p)}>Rename…</DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onSelect={() => deleteProject(p)}>
                            Delete…
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {docs.length ? (
                            docs.map((d) => docItem(d, true))
                          ) : (
                            <li className="px-2 py-1 text-xs text-muted-foreground">No articles yet — press +</li>
                          )}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {(groups.loose.length > 0 || (!q && groups.projects.length > 0)) && (
          <SidebarGroup>
            {groups.projects.length > 0 && (
              <SidebarGroupLabel
                {...dropProps(null)}
                className={cn(dropTarget === '' && 'bg-sidebar-accent ring-2 ring-ai/40')}
              >
                Articles
              </SidebarGroupLabel>
            )}
            <SidebarMenu>{groups.loose.map((d) => docItem(d, false))}</SidebarMenu>
          </SidebarGroup>
        )}

        {nothing && <p className="px-4 py-2 text-sm text-muted-foreground">Nothing matches.</p>}
      </SidebarContent>

      <SidebarFooter className="gap-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onTrash} className="text-muted-foreground">
              <Trash2Icon /> Trash
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <ModelStatus onOpen={onModels} />
      </SidebarFooter>
    </Sidebar>
  );
}
