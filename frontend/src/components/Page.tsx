import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Downloads from '@/components/Downloads.tsx';
import GitHubStats from '@/components/GitHubStats.tsx';

const VERSION = '0.1.0';
const RELEASES = 'https://github.com/AQSAKAL/clearpen/releases/latest';

const downloads = {
  mac: [
    { label: 'Apple Silicon (arm64) — DMG', file: `Clearpen_${VERSION}_aarch64.dmg` },
    { label: 'Intel (x64) — DMG', file: `Clearpen_${VERSION}_x64.dmg` },
  ],
  windows: [
    { label: 'Installer (x64) — MSI', file: `Clearpen_${VERSION}_x64_en-US.msi` },
    { label: 'Installer (x64) — NSIS', file: `Clearpen_${VERSION}_x64-setup.exe` },
  ],
  linux: [
    { label: 'AppImage (x64)', file: `Clearpen_${VERSION}_amd64.AppImage` },
    { label: 'Debian (x64) — DEB', file: `Clearpen_${VERSION}_amd64.deb` },
  ],
};

const features = [
  { title: 'One sentence, only when a paragraph needs it', desc: 'Finish a sentence and pause. If the paragraph needs a point, the one sentence that supplies it appears in grey.' },
  { title: 'Small, marked changes instead of a rewrite', desc: 'Only the words that change are marked, each with its own accept and reject.' },
  { title: 'A review that shows its working', desc: 'Table totals, percentages, contradictions. Arithmetic by code, never by a model.' },
  { title: 'Modes, and guided writing', desc: 'Article, guide, paper, business case, investment note — or write to think.' },
  { title: 'Insights', desc: 'Reading level, the mode, the terms the draft defines, and the Skeleton.' },
  { title: 'A quiet place to write', desc: 'Plain Markdown, projects, search, trash, versions, export.' },
];

export default function Page() {
  return (
    <div className="min-h-svh">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2 font-serif text-xl font-semibold">
            <img src="/favicon.svg" alt="Clearpen" className="h-7 w-7" />
            Clearpen
          </a>
          <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#downloads" className="hover:text-foreground">Download</a>
            <a href="#modes" className="hover:text-foreground">Modes</a>
            <a href="https://github.com/AQSAKAL/clearpen" target="_blank" rel="noopener" className="hover:text-foreground">GitHub</a>
          </nav>
          <Button asChild size="sm">
            <a href="#downloads">Download</a>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-12 overflow-hidden rounded-xl border shadow-sm">
          <video
            src="/promo.mp4"
            poster="/poster.png"
            autoPlay
            muted
            loop
            playsInline
            className="w-full"
          />
        </div>
        <Badge variant="secondary" className="mb-6">Open-source</Badge>
        <h1 className="font-serif text-5xl font-medium leading-tight md:text-7xl">
          Writing that's truly yours,<br />
          <span className="italic text-primary">with AI that helps.</span>
        </h1>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <a href="#downloads">Download for your platform</a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#how">How it works</a>
          </Button>
        </div>
        <p className="mt-10 font-mono text-sm text-muted-foreground">¶ point made · Tab for new paragraph</p>
      </section>

      {/* How it works */}
      <section id="how" className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-serif text-3xl font-medium md:text-4xl">One sentence, only when a paragraph needs it</h2>
          <p className="mt-4 max-w-3xl text-muted-foreground">
            Finish a sentence and pause. Clearpen checks whether the paragraph has made its
            point, given a reason and said why it matters. If something is missing, the one
            sentence that supplies it appears in grey: <strong>Tab</strong> keeps it, typing
            ignores it. When a paragraph is complete you see <em>¶ point made</em> instead.
            <strong>⌘J</strong> asks right away.
          </p>
        </div>
      </section>

      {/* Screenshots */}
      <section className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-serif text-3xl font-medium md:text-4xl">See it in action</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { light: 'next-sentence-light.png', dark: 'next-sentence-dark.png', caption: 'One sentence, only when a paragraph needs it' },
              { light: 'pinpoint-edits-light.png', dark: 'pinpoint-edits-dark.png', caption: 'Small, marked changes instead of a rewrite' },
              { light: 'review-light.png', dark: 'review-dark.png', caption: 'A review that shows its working' },
            ].map((s) => (
              <figure key={s.light} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <picture>
                  <source media="(prefers-color-scheme: dark)" srcSet={`/screenshots/${s.dark}`} />
                  <img src={`/screenshots/${s.light}`} alt={s.caption} className="w-full" loading="lazy" />
                </picture>
                <figcaption className="p-3 text-sm text-muted-foreground">{s.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-serif text-3xl font-medium md:text-4xl">Small, marked changes instead of a rewrite</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title}>
              <CardHeader>
                <CardTitle className="text-lg">{f.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{f.desc}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Downloads */}
      <section id="downloads" className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Downloads />
        </div>
      </section>

      {/* Modes */}
      <section id="modes" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-serif text-3xl font-medium md:text-4xl">Modes, and guided writing</h2>
        <p className="mt-4 max-w-3xl text-muted-foreground">
          A mode is a preset: which checks run, who the review reads for, and which aids are
          on. An article, a technical guide, a scientific paper, a business case, an
          investment note — or write to think with Clear out ideas, Reflect, and Work a
          problem.
        </p>
      </section>

      {/* GitHub */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-serif text-3xl font-medium md:text-4xl">Open source on GitHub</h2>
        <p className="mt-2 text-muted-foreground">Star the repo, report issues, or build from source.</p>
        <div className="mt-6">
          <GitHubStats />
        </div>
      </section>

      <Separator />

      {/* Footer */}
      <footer className="mx-auto max-w-6xl px-6 py-10 text-center text-sm text-muted-foreground">
        <p>Clearpen — open source, AGPL-3.0.</p>
        <p className="mt-1">
          <a className="underline" href={RELEASES} target="_blank" rel="noopener">GitHub</a>
          {' · '}
          <a className="underline" href="#downloads">Download</a>
        </p>
      </footer>
    </div>
  );
}
