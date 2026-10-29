// The open article's sources: web pages fetched once and kept as Markdown, or
// text the writer pastes. A suggestion or a fact-check draws on the passages
// of them that bear on what is being written — never the whole page.

import { countWords, MAX_SOURCES } from '@clearpen/core';
import { RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useLibrary } from '../library.tsx';
import { useSourceActions } from '../source-actions.ts';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Label } from './ui/label.tsx';
import { Textarea } from './ui/textarea.tsx';

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export function Sources() {
  const { backend } = useLibrary();
  const { sources, busy, full, addPage: add, addText: paste, refresh, remove } = useSourceActions();
  const [url, setUrl] = useState('');
  const [pasting, setPasting] = useState(!backend.fetchPage);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');

  async function addPage(e: FormEvent) {
    e.preventDefault();
    if (await add(url)) setUrl('');
  }

  function addText(e: FormEvent) {
    e.preventDefault();
    if (paste(pasteTitle, pasteText)) {
      setPasteTitle('');
      setPasteText('');
    }
  }

  return (
    // One column no wider than the panel: a grid track otherwise grows to fit a long title, and takes the buttons out of view.
    <div className="grid grid-cols-1 gap-6 text-sm">
      <p className="text-muted-foreground">
        Pages and notes Clearpen may draw on when it suggests a sentence or checks a fact — only the passages that bear
        on what you’re writing.{' '}
        {backend.fetchPage
          ? 'A page is fetched once, when you add it, and kept with this article.'
          : 'Paste a page’s text: Clearpen can’t fetch pages here.'}
      </p>

      {backend.fetchPage && !pasting && (
        // No browser validation: "example.com/page" is fine here, and gets its https://.
        <form className="grid grid-cols-1 gap-1.5" noValidate onSubmit={(e) => void addPage(e)}>
          <Label htmlFor="source-url" className="font-medium">
            Add a web page
          </Label>
          <div className="flex gap-2">
            <Input
              id="source-url"
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={!!busy || full}
            />
            <Button type="submit" size="sm" disabled={!url.trim() || !!busy || full}>
              {busy && !sources.some((s) => s.url === busy) ? 'Fetching…' : 'Add'}
            </Button>
          </div>
          <div>
            <Button type="button" size="xs" variant="link" className="px-0" onClick={() => setPasting(true)}>
              Paste text instead
            </Button>
          </div>
        </form>
      )}

      {pasting && (
        <form className="grid grid-cols-1 gap-1.5" onSubmit={addText}>
          <Label htmlFor="source-text" className="font-medium">
            Paste a source
          </Label>
          <Input
            aria-label="Its title"
            placeholder="Its title"
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            disabled={full}
          />
          <Textarea
            id="source-text"
            placeholder="The page’s text, or your notes"
            rows={6}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            disabled={full}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!pasteText.trim() || full}>
              Add
            </Button>
            {backend.fetchPage && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setPasting(false)}>
                Add a web page instead
              </Button>
            )}
          </div>
        </form>
      )}

      {full && <p className="text-muted-foreground">That’s {MAX_SOURCES} sources — remove one to add another.</p>}

      {sources.length > 0 && (
        <ul className="grid grid-cols-1 gap-2" aria-label="Sources">
          {sources.map((s) => (
            <li key={s.id} className="flex min-w-0 items-start gap-2 rounded-md border bg-card px-3 py-2">
              <div className="min-w-0 flex-1">
                {s.url ? (
                  <button
                    type="button"
                    className="line-clamp-2 w-full text-left font-medium break-words hover:underline"
                    title={s.url}
                    onClick={() => void backend.openLink(s.url)}
                  >
                    {s.title}
                  </button>
                ) : (
                  <p className="line-clamp-2 font-medium break-words">{s.title}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {s.url ? `${host(s.url)} · ` : 'Pasted · '}
                  {countWords(s.markdown).toLocaleString()} words
                </p>
              </div>
              {s.url && backend.fetchPage && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Refresh ${s.title}`}
                  title="Fetch it again"
                  disabled={!!busy}
                  onClick={() => void refresh(s)}
                >
                  <RefreshCwIcon className={busy === s.url ? 'animate-spin' : undefined} />
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${s.title}`}
                title="Remove"
                onClick={() => remove(s)}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
