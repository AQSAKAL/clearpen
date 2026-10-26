// Margin's window: the library on the left, the page on the right. Loads the
// settings and the library, opens the right article, and runs the commands
// from the ⋯ menu and the keyboard.

import type { Version } from '@margin/db';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AIProvider } from './ai.tsx';
import { AskProvider } from './ask.tsx';
import { Autocomplete } from './autocomplete.tsx';
import type { Backend } from './backend.ts';
import { ArticleEditor, type Counts, countsOf } from './components/article-editor.tsx';
import { AssistPanel, type AssistTab } from './components/assist-panel.tsx';
import { FontsDialog } from './components/fonts-dialog.tsx';
import { HistoryDialog } from './components/history-dialog.tsx';
import { useHighlights } from './components/insights.tsx';
import { LibrarySidebar, Logo } from './components/library-sidebar.tsx';
import { MarginNotes } from './components/margin-notes.tsx';
import { ModelsDialog } from './components/models-dialog.tsx';
import { MoveDialog } from './components/move-dialog.tsx';
import { Reader } from './components/reader.tsx';
import { SelectionToolbar } from './components/selection-toolbar.tsx';
import { ShortcutsDialog } from './components/shortcuts-dialog.tsx';
import { type Command, TopBar } from './components/top-bar.tsx';
import { TrashDialog } from './components/trash-dialog.tsx';
import { SidebarInset, SidebarProvider } from './components/ui/sidebar.tsx';
import { Toaster } from './components/ui/sonner.tsx';
import { TooltipProvider } from './components/ui/tooltip.tsx';
import { EditorRefProvider, usePage } from './editor-ref.tsx';
import { applyFonts } from './fonts.ts';
import { copyMarkdown, copyRichText, documentOf, fileName, markdownOf } from './lib/export.ts';
import { cn } from './lib/utils.ts';
import { LibraryProvider, useLibrary } from './library.tsx';
import { NotesProvider } from './notes.tsx';
import { useReviewActions } from './review-actions.ts';
import { loadSettings, type Settings, SettingsProvider, useSettings } from './settings.tsx';
import { StatusProvider } from './status.tsx';
import { ThemeProvider } from './theme.tsx';
import { WELCOME_TITLE, welcomeText } from './welcome.ts';

/** A version is saved this often while an article is open, if its text changed. */
export const AUTO_VERSION_MS = 10 * 60 * 1000;

/** Room for the page (700), the gap and the margin column (300), with padding. */
const MARGIN_ROOM_PX = 1090;
/** Wide enough for the Assist panel to sit beside the page rather than over it. */
const PANEL_INLINE_QUERY = '(min-width: 1280px)';

/** Is `ref`'s element at least `px` wide? Follows it as the window and panels resize. */
function useWide(ref: React.RefObject<HTMLElement | null>, px: number): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => entry && setWide(entry.contentRect.width >= px));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, px]);
  return wide;
}

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : true,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const q = window.matchMedia(query);
    const update = () => setMatch(q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, [query]);
  return match;
}

const hashId = () => /^#\/([\w-]+)$/.exec(window.location.hash)?.[1] ?? null;

export function App({ backend }: { backend: Backend }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSettings(backend)
      .then(setSettings)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [backend]);

  if (error) return <Failure message={error} />;
  if (!settings) return <div className="h-full bg-background" />;
  return (
    <SettingsProvider backend={backend} initial={settings}>
      <Shell backend={backend} />
    </SettingsProvider>
  );
}

function Failure({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center bg-background p-8">
      <div className="max-w-md text-center">
        <Logo className="mb-4 justify-center" />
        <p className="font-medium">Margin couldn’t open your library.</p>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function Shell({ backend }: { backend: Backend }) {
  const { settings, set } = useSettings();
  useEffect(() => applyFonts(settings.fonts), [settings.fonts]);
  const onTheme = useCallback((t: Settings['theme']) => set('theme', t), [set]);
  const onOpen = useCallback(
    (id: string) => {
      set('last', id);
      if (hashId() !== id) window.history.replaceState(null, '', `#/${id}`);
    },
    [set],
  );

  // The models chosen last time; the dialog changes them later. With
  // next-sentence suggestions on, the writing model loads now, so the first
  // suggestion doesn't wait for it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, at launch.
  useEffect(() => backend.ai.setModels(settings.models, { preload: settings.autocomplete }), [backend]);

  return (
    <ThemeProvider theme={settings.theme} onChange={onTheme}>
      <TooltipProvider delayDuration={400}>
        <StatusProvider>
          <AIProvider>
            <AskProvider>
              <LibraryProvider backend={backend} onOpen={onOpen}>
                <EditorRefProvider>
                  <NotesProvider mod={backend.platform === 'mac' ? '⌘' : 'Ctrl+'}>
                    <Workspace />
                  </NotesProvider>
                </EditorRefProvider>
              </LibraryProvider>
            </AskProvider>
          </AIProvider>
        </StatusProvider>
        <Toaster position="top-center" />
      </TooltipProvider>
    </ThemeProvider>
  );
}

function Workspace() {
  const lib = useLibrary();
  const { backend, current } = lib;
  const { settings, set } = useSettings();
  const page = usePage();
  const editor = page.editor;
  const [ready, setReady] = useState(false);
  const [counts, setCounts] = useState<Counts>({ words: 0, minutes: 1 });
  const [reading, setReading] = useState<{ title: string; content: string } | null>(null);
  const [focus, setFocus] = useState(false);
  const [dialog, setDialog] = useState<'history' | 'fonts' | 'shortcuts' | 'trash' | 'models' | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [panel, setPanel] = useState<AssistTab | null>(null);
  const mod = backend.platform === 'mac' ? '⌘' : 'Ctrl+';
  const scroller = useRef<HTMLDivElement>(null);
  const notesInMargin = useWide(scroller, MARGIN_ROOM_PX);
  const panelInline = useMedia(PANEL_INLINE_QUERY);
  const highlight = useHighlights();
  // Notes go in the margin when there's room, otherwise in the Assist panel.
  const openNotes = useCallback(() => {
    if (!notesInMargin) setPanel('notes');
  }, [notesInMargin]);
  const { review, check } = useReviewActions(openNotes);

  // A click on a noted passage shows its note, wherever the notes are.
  useEffect(() => page.on('note', (id) => id && openNotes()), [page, openNotes]);
  const libRef = useRef(lib);
  libRef.current = lib;

  // Open the article in the address, else the last one, else the newest; a
  // first launch gets the welcome article. Once, even where React mounts twice.
  const booted = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, on launch.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      await lib.refresh();
      const docs = await backend.library.documents.list();
      const want = [hashId(), settings.last].find((id) => id && docs.some((d) => d.id === id));
      if (want) await lib.open(want);
      else if (docs[0]) await lib.open(docs[0].id);
      else if (!settings.welcomed) {
        set('welcomed', true);
        await lib.create({ title: WELCOME_TITLE, content: welcomeText(backend.platform === 'mac' ? '⌘' : 'Ctrl+') });
      } else await lib.create();
      setReady(true);
    })().catch((err) => toast.error(`Couldn’t open the library: ${err.message ?? err}`));
  }, []);

  // Following #/<id> links and the back button.
  useEffect(() => {
    const onHash = () => {
      const id = hashId();
      if (id && id !== libRef.current.current?.id) libRef.current.open(id).catch(() => {});
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Never lose the last few keystrokes: save before the window goes away.
  useEffect(() => {
    const flush = () => void libRef.current.flush();
    window.addEventListener('pagehide', flush);
    const stop = backend.beforeClose?.(() => libRef.current.flush());
    return () => {
      window.removeEventListener('pagehide', flush);
      stop?.();
    };
  }, [backend]);

  // A version every ten minutes; the library skips it if nothing changed.
  useEffect(() => {
    const t = setInterval(async () => {
      const id = libRef.current.current?.id;
      if (!id) return;
      await libRef.current.flush();
      await backend.library.versions.save(id, '').catch(() => {});
    }, AUTO_VERSION_MS);
    return () => clearInterval(t);
  }, [backend]);

  // Focus mode carries over when another article opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: loading an article resets the editor's focus mode, so re-apply it.
  useEffect(() => {
    editor.current?.setFocus(focus);
  }, [focus, current?.id, editor]);

  const text = () => editor.current?.getText() ?? current?.content ?? '';
  const title = () => page.title.current.trim();

  const saveVersion = useCallback(
    async (label: string) => {
      const id = libRef.current.current?.id;
      if (!id) return;
      await libRef.current.flush();
      const v = await backend.library.versions.save(id, label);
      toast(v.unchanged ? 'No changes since the last version' : 'Version saved');
    },
    [backend],
  );

  const toggleReader = useCallback(() => {
    setReading((r) => {
      if (r) return null;
      const doc = libRef.current.current;
      return { title: page.title.current.trim(), content: editor.current?.getText() ?? doc?.content ?? '' };
    });
  }, [editor, page]);

  async function restoreVersion(v: Version) {
    const ed = editor.current;
    if (!ed || !current) return;
    await saveVersion('Before restoring an older version');
    // An edit like any other, so ⌘Z takes it back.
    ed.replace(0, ed.length(), v.content);
    page.setTitle.current?.(v.title);
    await lib.flush();
    setDialog(null);
    toast('Version restored — the one before it was saved too');
  }

  async function run(c: Command) {
    try {
      switch (c) {
        case 'review':
          review();
          break;
        case 'assist':
          setPanel((p) => (p ? null : notesInMargin ? 'insights' : 'notes'));
          break;
        case 'insights':
          setPanel('insights');
          break;
        case 'autocomplete':
          set('autocomplete', !settings.autocomplete);
          toast(settings.autocomplete ? 'Next-sentence suggestions off' : 'Next-sentence suggestions on');
          break;
        case 'focus':
          setFocus((f) => !f);
          toast(focus ? 'Focus mode off' : 'Focus mode — only your paragraph stays bright');
          break;
        case 'reader':
          toggleReader();
          break;
        case 'fonts':
          setDialog('fonts');
          break;
        case 'version':
          await saveVersion('Saved by you');
          break;
        case 'history':
          setDialog('history');
          break;
        case 'copy-md':
          await copyMarkdown(title(), text());
          toast('Copied as Markdown');
          break;
        case 'copy-rich':
          await copyRichText(title(), text(), backend);
          toast('Copied — paste into Google Docs, Medium or WordPress');
          break;
        case 'save-md':
          if (await backend.files.save(fileName(title(), 'md'), markdownOf(title(), text()), 'text/markdown'))
            toast('Saved as Markdown');
          break;
        case 'save-html':
          if (
            await backend.files.save(fileName(title(), 'html'), await documentOf(title(), text(), backend), 'text/html')
          )
            toast('Saved as a web page');
          break;
        case 'shortcuts':
          setDialog('shortcuts');
          break;
        case 'move':
          if (current) setMoving(current.id);
          break;
        case 'trash':
          if (current) {
            const t = title();
            await lib.trash(current.id);
            toast(`Moved “${t || 'Untitled'}” to the trash`, {
              action: { label: 'Open trash', onClick: () => setDialog('trash') },
            });
          }
          break;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }
  const runRef = useRef(run);
  runRef.current = run;

  // Shortcuts that work anywhere in the window. ⌘\ belongs to the sidebar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const modKey = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (modKey && !e.shiftKey && key === 's') {
        e.preventDefault();
        void runRef.current('version');
      } else if (modKey && !e.shiftKey && key === '.') {
        e.preventDefault();
        void runRef.current('focus');
      } else if (modKey && e.shiftKey && key === 'p') {
        e.preventDefault();
        toggleReader();
      } else if (modKey && e.shiftKey && key === 'e') {
        e.preventDefault();
        void runRef.current('review');
      } else if (modKey && e.shiftKey && key === 'a') {
        e.preventDefault();
        void runRef.current('assist');
      } else if (e.key === 'Escape' && !e.defaultPrevented && document.querySelector('[data-reading]')) {
        if (!document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) toggleReader();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleReader]);

  const onCounts = useCallback((c: Counts) => setCounts(c), []);

  return (
    <SidebarProvider open={settings.libraryOpen} onOpenChange={(o) => set('libraryOpen', o)}>
      <LibrarySidebar onMove={setMoving} onTrash={() => setDialog('trash')} onModels={() => setDialog('models')} />
      <SidebarInset className="h-svh min-w-0 overflow-hidden">
        <TopBar
          counts={counts}
          reading={!!reading}
          focus={focus}
          autocomplete={settings.autocomplete}
          mod={mod}
          onCommand={run}
        />
        <div className="flex min-h-0 flex-1">
          <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto" data-reading={reading ? '' : undefined}>
            <div className={cn('flex justify-center gap-9 px-2', reading && 'hidden')} aria-hidden={!!reading}>
              <div className="w-full min-w-0 max-w-[700px]">
                <ArticleEditor onCounts={onCounts} />
              </div>
              {notesInMargin && <MarginNotes />}
            </div>
            {reading && (
              <Reader
                title={reading.title}
                content={reading.content}
                counts={countsOf(reading.content)}
                onExit={toggleReader}
              />
            )}
            {!ready && <div className="sr-only">Opening your library…</div>}
          </div>
          {panelInline && (
            <AssistPanel inline tab={panel} onTab={setPanel} notesInMargin={notesInMargin} highlight={highlight} />
          )}
        </div>
      </SidebarInset>
      {!panelInline && (
        <AssistPanel inline={false} tab={panel} onTab={setPanel} notesInMargin={notesInMargin} highlight={highlight} />
      )}
      <HistoryDialog
        open={dialog === 'history'}
        onOpenChange={(o) => setDialog(o ? 'history' : null)}
        onRestore={restoreVersion}
      />
      <FontsDialog open={dialog === 'fonts'} onOpenChange={(o) => setDialog(o ? 'fonts' : null)} />
      <ShortcutsDialog
        open={dialog === 'shortcuts'}
        onOpenChange={(o) => setDialog(o ? 'shortcuts' : null)}
        mod={mod}
      />
      <TrashDialog open={dialog === 'trash'} onOpenChange={(o) => setDialog(o ? 'trash' : null)} />
      <MoveDialog docId={moving} onOpenChange={(o) => !o && setMoving(null)} />
      <ModelsDialog open={dialog === 'models'} onOpenChange={(o) => setDialog(o ? 'models' : null)} />
      {!reading && <SelectionToolbar mod={mod} check={check} />}
      <Autocomplete />
    </SidebarProvider>
  );
}
