import { useEffect, useRef, useState } from 'react';
import { useLibrary } from '../library.tsx';
import { usePage } from '../editor-ref.tsx';

interface Node { index: number; text: string; role: string }

const COLORS: Record<string, string> = {
  point: '#2563eb',
  support: '#16a34a',
  meaning: '#9333ea',
  other: '#9ca3af',
};

export function ThoughtTree() {
  const { backend } = useLibrary();
  const page = usePage();
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState({ x: 100, y: 100 });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        const ed = page.editor.current;
        if (!ed) return;
        const sel = ed.getSelection();
        const pos = sel.from;
        const text = ed.getText();
        const rect = (ed as any).coordsAt?.(pos);
        if (rect) setPos({ x: rect.left, y: rect.bottom + 8 });
        setOpen(true);
        setLoading(true);
        setNodes([]);
        backend.ai
          .thoughtTree({ before: text.slice(0, pos) })
          .then((r) => setNodes(r.sentences))
          .catch(() => setNodes([]))
          .finally(() => setLoading(false));
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, backend, open]);

  if (!open) return null;
  return (
    <div
      ref={panelRef}
      className="fixed z-50 w-72 rounded-lg border bg-background p-3 shadow-lg text-xs"
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">Thought tree</span>
        <button className="text-muted-foreground" onClick={() => setOpen(false)}>×</button>
      </div>
      {loading && <div className="text-muted-foreground">Thinking…</div>}
      {!loading && nodes.length === 0 && <div className="text-muted-foreground">No sentences here.</div>}
      <svg width="100%" height={nodes.length * 34 + 10} className="overflow-visible">
        {nodes.map((n, i) => {
          const y = i * 34 + 16;
          return (
            <g key={n.index}>
              {i > 0 && <line x1={12} y1={y - 20} x2={12} y2={y - 6} stroke="#d1d5db" strokeWidth={1} />}
              <circle cx={12} cy={y} r={6} fill={COLORS[n.role] || '#9ca3af'} />
              <text x={24} y={y + 3} fill="currentColor" fontSize={11}>
                {n.role} · {n.text.slice(0, 40)}{n.text.length > 40 ? '…' : ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
