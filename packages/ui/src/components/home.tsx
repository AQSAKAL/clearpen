import { CalendarClockIcon, FilePlusIcon, FolderIcon, FolderPlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAsk } from '../ask.tsx';
import { timeAgo } from '../lib/time.ts';
import { cn } from '../lib/utils.ts';
import { useLibrary } from '../library.tsx';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.tsx';

export function HomeView() {
  const lib = useLibrary();
  const { prompt } = useAsk();

  const report = (error: unknown) => toast.error(error instanceof Error ? error.message : String(error));
  const openDoc = (id: string) => lib.open(id).catch(report);
  const newArticle = () => lib.create().catch(report);

  const newProject = async () => {
    const name = await prompt({
      title: 'New project',
      description: 'A project groups articles — a blog, a book, a series.',
      placeholder: 'Project name',
      action: 'Create',
    });
    if (!name) return;
    try {
      const p = await lib.createProject(name);
      await lib.create({ projectId: p.id });
    } catch (error) {
      report(error);
    }
  };

  const docsByProject = (projectId: string) =>
    lib.docs.filter((d) => d.projectId === projectId).sort((a, b) => b.updatedAt - a.updatedAt);

  const recent = [...lib.docs].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  const projectName = (id: string | null) => lib.projects.find((p) => p.id === id)?.name ?? 'Loose article';

  return (
    <div className="workspace-page min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl font-medium md:text-5xl">Your library</h1>
            <p className="mt-2 text-muted-foreground">Your projects and recent articles.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={newProject}>
              <FolderPlusIcon /> New project
            </Button>
            <Button onClick={newArticle}>
              <FilePlusIcon /> New article
            </Button>
          </div>
        </div>

        {/* Folders */}
        <section className="mt-10">
          <h2 className="font-serif text-2xl font-medium">Projects</h2>
          {lib.projects.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No projects yet. Create one to group your articles.</p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {lib.projects.map((p) => {
                const docs = docsByProject(p.id);
                return (
                  <Card key={p.id} className="flex flex-col">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <FolderIcon className="text-muted-foreground" />
                        {p.name}
                        {lib.scheduleFor(p.id) && (
                          <CalendarClockIcon className="size-4 text-muted-foreground" aria-label="Scheduled writing" />
                        )}
                      </CardTitle>
                      <CardDescription>
                        {docs.length} article{docs.length === 1 ? '' : 's'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                      {docs.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No articles yet.</p>
                      ) : (
                        <ul className="space-y-3">
                          {docs.slice(0, 5).map((d) => (
                            <li key={d.id}>
                              <button
                                type="button"
                                onClick={() => void openDoc(d.id)}
                                className="block w-full text-left"
                              >
                                <div className="text-sm font-medium hover:underline">{d.title || 'Untitled'}</div>
                                {d.excerpt && (
                                  <div className="line-clamp-2 text-xs text-muted-foreground">{d.excerpt}</div>
                                )}
                                <div className="text-[11px] text-muted-foreground/70">{timeAgo(d.updatedAt)}</div>
                              </button>
                            </li>
                          ))}
                          {docs.length > 5 && (
                            <li className="text-xs text-muted-foreground">+{docs.length - 5} more</li>
                          )}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent articles */}
        <section className="mt-12">
          <h2 className="font-serif text-2xl font-medium">Recent articles</h2>
          {recent.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No articles yet — create one to start.</p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {recent.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => void openDoc(d.id)}
                  className={cn(
                    'rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent/40',
                  )}
                >
                  <div className="font-serif text-base font-medium">{d.title || 'Untitled'}</div>
                  {d.excerpt && <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{d.excerpt}</p>}
                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground/70">
                    <span>{projectName(d.projectId)}</span>
                    <span>{timeAgo(d.updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
