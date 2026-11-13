import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import {
  connect,
  createLibrary,
  excerpt,
  type Library,
  MAX_VERSIONS,
  MIGRATIONS,
  migrate,
  nextOccurrence,
  openLibrary,
  slugify,
  titleFor,
  uuidv7,
} from '../src/index.ts';
import { nodeDriver } from '../src/node.ts';

const open = () => openLibrary(nodeDriver());

async function rejects(p: Promise<unknown>, status: number) {
  await assert.rejects(p, (err: { status?: number }) => err.status === status);
}

test('migrations apply once and survive reopening the file', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'clearpen-db-')), 'library.db');
  const first = nodeDriver(file);
  const lib = await openLibrary(first);
  await lib.documents.create({ title: 'Kept' });
  first.close();

  const again = nodeDriver(file);
  assert.deepEqual(await migrate(again), []);
  const reopened = await openLibrary(again);
  assert.deepEqual(
    (await reopened.documents.list()).map((d) => d.title),
    ['Kept'],
  );
  again.close();
});

test('a library made before schedules gains the table when reopened', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'clearpen-db-')), 'library.db');
  const old = nodeDriver(file);
  // The schema as it shipped before schedules existed.
  await migrate(
    old,
    MIGRATIONS.filter((m) => m.id === '0000_init'),
  );
  const before = createLibrary(connect(old));
  const project = await before.projects.create('Older blog');
  old.close();

  const upgraded = nodeDriver(file);
  const lib = await openLibrary(upgraded);
  const { schedule, document } = await lib.schedules.set(project.id, 'weekly');
  assert.equal(schedule.projectId, project.id);
  assert.equal(document?.projectId, project.id);
  assert.equal((await lib.schedules.list()).length, 1);
  upgraded.close();
});

test('UUIDv7 ids sort by creation time', () => {
  const a = uuidv7(1_700_000_000_000);
  const b = uuidv7(1_700_000_000_001);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(a < b);
});

test('articles: create, save, list newest first', async () => {
  const lib = await open();
  const a = await lib.documents.create({ title: 'First\nline', content: '# Heading\n\nSome **bold** words here.' });
  assert.equal(a.title, 'First line');
  assert.equal(a.words, 5);
  assert.equal(a.excerpt, 'Some bold words here.');
  const b = await lib.documents.create({ title: 'Second' });
  assert.deepEqual(
    (await lib.documents.list()).map((d) => d.id),
    [b.id, a.id],
  );

  const saved = await lib.documents.update(a.id, { content: 'Now four words here.' });
  assert.equal(saved.words, 4);
  assert.equal(saved.excerpt, 'Now four words here.');
  assert.deepEqual(
    (await lib.documents.list()).map((d) => d.id),
    [a.id, b.id],
  );
  const got = await lib.documents.get(a.id);
  assert.equal(got?.content, 'Now four words here.');
  assert.deepEqual(got?.brief, { topic: '', audience: '', angle: '', tone: '', length: '', notes: '' });

  await lib.documents.update(a.id, { brief: { topic: 'Inboxes', notes: 'x'.repeat(30000) } });
  assert.equal((await lib.documents.get(a.id))?.brief.notes?.length, 20000);
  await rejects(lib.documents.update(a.id, { content: 'x'.repeat(2_000_001) }), 413);
  await rejects(lib.documents.update('nope', { title: 'x' }), 404);
});

test('the brief keeps its mode and its place in a guided template, and drops what it does not know', async () => {
  const lib = await open();
  const a = await lib.documents.create({
    brief: { mode: 'reflect', genre: 'article', guide: { template: 'reflect', step: 1 }, bogus: 1 } as never,
  });
  assert.deepEqual(a.brief, {
    topic: '',
    audience: '',
    angle: '',
    tone: '',
    length: '',
    notes: '',
    genre: 'article',
    mode: 'reflect',
    guide: { template: 'reflect', step: 1 },
  });
  await lib.documents.update(a.id, { brief: { ...a.brief, guide: { template: 'reflect', step: -1 } } });
  assert.equal((await lib.documents.get(a.id))?.brief.guide, undefined);
  await lib.documents.update(a.id, { brief: { mode: 'clear' } });
  assert.equal((await lib.documents.get(a.id))?.brief.genre, undefined, 'the brief is replaced, not merged');
});

test('search looks in titles and text, and treats % and _ literally', async () => {
  const lib = await open();
  const a = await lib.documents.create({ title: 'Shared inbox', content: 'Tickets fell by 25%.' });
  const b = await lib.documents.create({ title: 'Pricing', content: 'Why the inbox costs less.' });
  await lib.documents.create({ title: 'Other', content: 'Nothing here.' });
  const ids = async (q: string) => (await lib.documents.search(q)).map((d) => d.id).sort();
  assert.deepEqual(await ids('INBOX'), [a.id, b.id].sort());
  assert.deepEqual(await ids('25%'), [a.id]);
  assert.deepEqual(await ids('%'), [a.id]);
  assert.deepEqual(await ids('_'), []);
});

test('trash, restore and purge', async () => {
  const lib = await open();
  const a = await lib.documents.create({ title: 'Draft' });
  await rejects(lib.documents.purge(a.id), 409);
  await lib.documents.trash(a.id);
  assert.deepEqual(await lib.documents.list(), []);
  assert.deepEqual(
    (await lib.documents.trashed()).map((d) => d.id),
    [a.id],
  );
  await lib.documents.restore(a.id);
  assert.equal((await lib.documents.list())[0]?.id, a.id);

  await lib.versions.save(a.id, 'Before');
  await lib.documents.trash(a.id);
  await lib.documents.purge(a.id);
  assert.equal(await lib.documents.get(a.id), null);
  assert.deepEqual(await lib.versions.list(a.id), []);
});

test('projects: names, moving articles, removing a project keeps its articles', async () => {
  const lib = await open();
  const blog = await lib.projects.create('  my   Blog ');
  assert.equal(blog.name, 'my Blog');
  const book = await lib.projects.create('Atlas book');
  assert.deepEqual(
    (await lib.projects.list()).map((p) => p.name),
    ['Atlas book', 'my Blog'],
  );
  await rejects(lib.projects.create('   '), 400);
  await rejects(lib.documents.create({ projectId: 'missing' }), 404);

  const a = await lib.documents.create({ title: 'Post', projectId: blog.id });
  const b = await lib.documents.create({ title: 'Chapter', projectId: blog.id });
  await lib.documents.update(b.id, { projectId: book.id });
  assert.equal((await lib.documents.get(b.id))?.projectId, book.id);

  assert.equal((await lib.projects.rename(blog.id, 'Notes')).name, 'Notes');
  assert.deepEqual(await lib.projects.remove(blog.id), { moved: 1 });
  assert.equal((await lib.documents.get(a.id))?.projectId, null);
  assert.deepEqual(
    (await lib.projects.list()).map((p) => p.name),
    ['Atlas book'],
  );
  await rejects(lib.projects.rename(blog.id, 'Again'), 404);
});

test('versions: snapshots, unchanged, and thinning that spares labels and the newest', async () => {
  const lib: Library = await open();
  const d = await lib.documents.create({ title: 'T', content: 'one' });
  const first = await lib.versions.save(d.id, 'Saved by you');
  assert.equal(first.words, 1);
  assert.equal((await lib.versions.save(d.id)).unchanged, true);

  for (let i = 0; i < MAX_VERSIONS + 1; i++) {
    await lib.documents.update(d.id, { content: `text ${i}` });
    await lib.versions.save(d.id);
  }
  const all = await lib.versions.list(d.id);
  assert.equal(all.length, MAX_VERSIONS);
  assert.equal(all.at(-1)?.label, 'Saved by you');
  const newest = await lib.versions.get(d.id, all[0]!.id);
  assert.equal(newest?.content, `text ${MAX_VERSIONS}`);
  // The two oldest automatic versions went first.
  assert.ok(!(await Promise.all(all.map((v) => lib.versions.get(d.id, v.id)))).some((v) => v?.content === 'text 0'));
});

test('schedules pre-create an article, turn over on time, and stop when deleted', async () => {
  const lib = await open();
  const blog = await lib.projects.create('Blog');
  const first = await lib.schedules.set(blog.id, 'weekly');
  assert.equal(first.schedule.cadence, 'weekly');
  assert.equal(first.schedule.projectId, blog.id);
  // The first article is waiting right away, inside the project.
  assert.ok(first.document);
  assert.equal(first.document.projectId, blog.id);
  assert.equal((await lib.documents.list()).length, 1);
  assert.deepEqual(await lib.schedules.list(), [first.schedule]);
  assert.deepEqual(await lib.schedules.get(blog.id), first.schedule);

  // Nothing is due before the next period.
  assert.deepEqual(await lib.schedules.run(first.schedule.nextAt - 1), []);

  // The period turns: one article appears and the schedule moves on.
  const made = await lib.schedules.run(first.schedule.nextAt);
  assert.equal(made.length, 1);
  assert.equal(made[0]?.projectId, blog.id);
  assert.equal((await lib.documents.list()).length, 2);
  const after = await lib.schedules.get(blog.id);
  assert.ok(after);
  assert.ok(after.nextAt > first.schedule.nextAt);

  // Changing the rhythm keeps the articles already made and makes no new one.
  const changed = await lib.schedules.set(blog.id, 'daily');
  assert.equal(changed.document, undefined);
  assert.equal(changed.schedule.cadence, 'daily');
  assert.equal((await lib.documents.list()).length, 2);

  // Deleting the schedule stops the rhythm; the articles stay.
  await lib.schedules.remove(blog.id);
  assert.equal(await lib.schedules.get(blog.id), null);
  assert.deepEqual(await lib.schedules.list(), []);
  assert.equal((await lib.documents.list()).length, 2);
  assert.deepEqual(await lib.schedules.run(first.schedule.nextAt), []);

  await rejects(lib.schedules.set(blog.id, 'hourly' as never), 400);
  await rejects(lib.schedules.set('missing', 'weekly'), 404);
});

test('a long absence creates one catch-up article, not a backlog', async () => {
  const lib = await open();
  const blog = await lib.projects.create('Journal');
  const { schedule } = await lib.schedules.set(blog.id, 'daily');
  const later = schedule.nextAt + 10 * 24 * 60 * 60 * 1000;
  const made = await lib.schedules.run(later);
  assert.equal(made.length, 1);
  const after = await lib.schedules.get(blog.id);
  assert.ok(after);
  assert.ok(after.nextAt > later);
  assert.ok(after.nextAt - later <= 24 * 60 * 60 * 1000, 'the next article is a day away');
  assert.equal((await lib.documents.list()).length, 2);
});

test('removing a project deletes its schedule but keeps its articles', async () => {
  const lib = await open();
  const blog = await lib.projects.create('Blog');
  const { document } = await lib.schedules.set(blog.id, 'monthly');
  assert.ok(document);
  await lib.projects.remove(blog.id);
  assert.equal(await lib.schedules.get(blog.id), null);
  const kept = await lib.documents.get(document.id);
  assert.ok(kept);
  assert.equal(kept.projectId, null);
});

test('rhythms follow the calendar, and the titles name their period', () => {
  const at = new Date(2026, 10, 9, 9, 30).getTime();
  const day = new Date(nextOccurrence(at, 'daily'));
  // Articles arrive at the start of the day, not the hour it was set.
  assert.deepEqual([day.getMonth(), day.getDate(), day.getHours()], [10, 10, 0]);
  const week = new Date(nextOccurrence(at, 'weekly'));
  assert.deepEqual([week.getMonth(), week.getDate()], [10, 16]);
  const twoWeeks = new Date(nextOccurrence(at, 'biweekly'));
  assert.deepEqual([twoWeeks.getMonth(), twoWeeks.getDate()], [10, 23]);

  // A month keeps the day of the month, clamped to a shorter one.
  const jan31 = new Date(2026, 0, 31, 9).getTime();
  const feb = new Date(nextOccurrence(jan31, 'monthly'));
  assert.deepEqual([feb.getMonth(), feb.getDate()], [1, 28]);
  const mar31 = new Date(2026, 2, 31, 9).getTime();
  const apr = new Date(nextOccurrence(mar31, 'monthly'));
  assert.deepEqual([apr.getMonth(), apr.getDate()], [3, 30]);

  assert.equal(titleFor('daily', at), 'November 9, 2026');
  assert.equal(titleFor('weekly', at), 'Week of November 9, 2026');
  assert.equal(titleFor('biweekly', at), 'Week of November 9, 2026');
  assert.equal(titleFor('monthly', at), 'November 2026');
});

test('media is stored once per image', async () => {
  const lib = await open();
  const img = { sha256: 'ab'.repeat(32), type: 'image/png', size: 10, name: `${'ab'.repeat(12)}.png` };
  const a = await lib.media.record(img);
  const b = await lib.media.record({ ...img, size: 99 });
  assert.equal(a.id, b.id);
  assert.equal(b.size, 10);
  assert.equal(await lib.media.get('cd'.repeat(32)), null);
});

test('settings keep JSON values', async () => {
  const lib = await open();
  await lib.settings.set('theme', 'dark');
  await lib.settings.set('models', { quick: 'qwen3:8b', coach: null });
  await lib.settings.set('theme', 'system');
  assert.equal(await lib.settings.get('theme'), 'system');
  assert.deepEqual(await lib.settings.all(), { theme: 'system', models: { quick: 'qwen3:8b', coach: null } });
  assert.equal(await lib.settings.get('missing'), undefined);
});

test('the interaction log appends once, newest first, and prunes', async () => {
  const lib = await open();
  const at = Date.now();
  await lib.interactions.add({
    id: 'ev_1',
    kind: 'command.executed',
    source: 'ui',
    at,
    data: { command: 'review' },
  });
  // The same event arriving twice (a replayed channel) is one row.
  await lib.interactions.add({
    id: 'ev_1',
    kind: 'command.executed',
    source: 'ui',
    at,
    data: { command: 'review' },
  });
  await lib.interactions.add({
    id: 'ev_2',
    kind: 'notification.received',
    source: 'app',
    at: at + 1,
    data: { title: 'Model ready' },
  });
  const rows = await lib.interactions.recent();
  assert.deepEqual(
    rows.map((row) => row.id),
    ['ev_2', 'ev_1'],
  );
  assert.deepEqual(rows[1]?.data, { command: 'review' });
  await lib.interactions.prune(at);
  assert.deepEqual(
    (await lib.interactions.recent()).map((row) => row.id),
    ['ev_2'],
  );
});

test('excerpts and slugs', () => {
  assert.equal(excerpt('# Title\n\n![chart](media/ab.png)\n\n> A *quoted* line.'), 'A quoted line.');
  assert.ok(excerpt('word '.repeat(60)).endsWith('…'));
  assert.equal(slugify('Ça va? Shared inbox — 2026!'), 'ca-va-shared-inbox-2026');
});
