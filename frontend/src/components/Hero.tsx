import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <Badge variant="secondary" className="mb-6">Open-source writing app</Badge>
      <h1 className="font-serif text-5xl font-medium leading-tight md:text-7xl">
        You write.<br />
        <span className="italic text-primary">Clearpen edits.</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
        A calm page where every word is yours, and the AI works beside you. It marks small
        edits you accept or reject, checks your facts, logic and numbers, and offers one
        sentence only when a paragraph needs it. Runs on your own computer, offline.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button size="lg">Download</Button>
        <Button size="lg" variant="outline">How it works</Button>
      </div>
      <p className="mt-10 font-mono text-sm text-muted-foreground">¶ point made · Tab for new paragraph</p>

      <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { title: 'Pinpoint edits', desc: 'Only the words that change are marked, each with its own accept and reject.' },
          { title: 'Checks that show their working', desc: 'Arithmetic done by code, never by a model.' },
          { title: 'Your words stay yours', desc: 'Local by default. Exports to plain Markdown.' },
          { title: 'Never lose a word', desc: 'Versions, trash, automatic backups.' },
        ].map((f) => (
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
  );
}
