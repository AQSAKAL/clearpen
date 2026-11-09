// The library: projects, articles, their versions, images and settings.
// Explicit queries per operation (no ORM relations), validated here so every
// backend stores the same thing. Deletes are tombstones until purged.

import { type Brief, countWords, type Meta, normaliseMeta, normaliseSources } from '@clearpen/core';
import { and, asc, count, desc, eq, isNotNull, isNull, lte, or, type SQL, sql } from 'drizzle-orm';
import { connect, type Db, type SqlDriver } from './driver.ts';
import { now, uuidv7 } from './ids.ts';
import { migrate } from './migrate.ts';
import { documents, media, projects, schedules, settings, versions } from './schema.ts';

export class LibraryError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

/** How often a project's recurring article appears. */
export type Cadence = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface Schedule {
  id: string;
  projectId: string;
  cadence: Cadence;
  /** When the next article is due, in milliseconds. */
  nextAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentSummary {
  id: string;
  projectId: string | null;
  title: string;
  words: number;
  excerpt: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Document extends DocumentSummary {
  content: string;
  brief: Brief;
  meta: Meta | null;
}

export interface NewDocument {
  title?: string;
  content?: string;
  brief?: Brief;
  projectId?: string | null;
}

export interface DocumentPatch extends NewDocument {
  meta?: Meta | null;
}

export interface Saved {
  id: string;
  updatedAt: number;
  words: number;
  excerpt: string;
}

export interface VersionSummary {
  id: string;
  label: string;
  words: number;
  createdAt: number;
}

export interface Version extends VersionSummary {
  title: string;
  content: string;
}

export interface MediaRecord {
  id: string;
  sha256: string;
  type: string;
  size: number;
  name: string;
}

export interface Library {
  projects: {
    list(): Promise<Project[]>;
    create(name: string): Promise<Project>;
    rename(id: string, name: string): Promise<Project>;
    /** Removes a project. Its articles stay, outside any project. */
    remove(id: string): Promise<{ moved: number }>;
  };
  documents: {
    /** Articles not in the trash, most recently changed first. */
    list(): Promise<DocumentSummary[]>;
    /** Articles whose title or text contains `query`. */
    search(query: string): Promise<DocumentSummary[]>;
    get(id: string): Promise<Document | null>;
    create(fields?: NewDocument): Promise<Document>;
    update(id: string, patch: DocumentPatch): Promise<Saved>;
    trash(id: string): Promise<void>;
    trashed(): Promise<DocumentSummary[]>;
    restore(id: string): Promise<void>;
    /** Deletes a trashed article and its versions for good. */
    purge(id: string): Promise<void>;
  };
  versions: {
    list(documentId: string): Promise<VersionSummary[]>;
    get(documentId: string, id: string): Promise<Version | null>;
    /** Saves a snapshot of the article as it is now, unless it matches the last one. */
    save(documentId: string, label?: string): Promise<VersionSummary & { unchanged?: boolean }>;
  };
  schedules: {
    /** The active recurring-writing schedules, soonest first. */
    list(): Promise<Schedule[]>;
    /** A project's schedule, if it has one. */
    get(projectId: string): Promise<Schedule | null>;
    /**
     * Sets a project's rhythm. The first time, it also creates this period's
     * article straight away, so one is waiting; changing the rhythm keeps the
     * articles already made and makes no new one now. A `brief` (the kind of
     * piece the writer usually writes) starts every article it makes.
     */
    set(
      projectId: string,
      cadence: Cadence,
      brief?: Brief,
    ): Promise<{ schedule: Schedule; document?: DocumentSummary }>;
    /** Stops the rhythm. The articles it made stay in the project. */
    remove(projectId: string): Promise<void>;
    /** Creates the articles whose period has turned, and moves their schedules on. */
    run(at?: number): Promise<DocumentSummary[]>;
  };
  media: {
    get(sha256: string): Promise<MediaRecord | null>;
    /** Records an image; an image already in the library is returned as it is. */
    record(image: Omit<MediaRecord, 'id'>): Promise<MediaRecord>;
  };
  settings: {
    all(): Promise<Record<string, unknown>>;
    get<T = unknown>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
  };
}

export const MAX_VERSIONS = 60;
export const MAX_CONTENT = 2_000_000;

const s = (v: unknown, n: number) => String(v ?? '').slice(0, n);

const clean = {
  title: (v: unknown) => s(String(v ?? '').replace(/\s*\n\s*/g, ' '), 300),
  content(v: unknown): string {
    const text = String(v ?? '');
    if (text.length > MAX_CONTENT) throw new LibraryError('That article is too large.', 413);
    return text;
  },
  brief(v: unknown): Brief {
    const b = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const out: Brief = {
      topic: s(b.topic, 500),
      audience: s(b.audience, 300),
      angle: s(b.angle, 500),
      tone: s(b.tone, 100),
      length: s(b.length, 10),
      notes: s(b.notes, 20000),
    };
    if (b.genre) out.genre = s(b.genre, 40);
    if (b.mode) out.mode = s(b.mode, 40);
    // Where the author is in a guided template: the template and the frame to fill next.
    const g = b.guide && typeof b.guide === 'object' ? (b.guide as Record<string, unknown>) : null;
    if (g && typeof g.template === 'string' && g.template && Number.isInteger(g.step) && (g.step as number) >= 0)
      out.guide = { template: s(g.template, 40), step: g.step as number };
    // Pages the writer saved with the article, as Markdown.
    const sources = normaliseSources(b.sources);
    if (sources.length) out.sources = sources;
    return out;
  },
  meta: (v: unknown): Meta | null => (v && typeof v === 'object' ? normaliseMeta(v) : null),
  projectName(v: unknown): string {
    const name = String(v ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    if (!name) throw new LibraryError('Give the project a name.');
    return name;
  },
};

/** A URL-safe version of a title or name. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/** The opening of an article's text, for the library list. */
export function excerpt(content: string): string {
  const body = String(content)
    .split('\n')
    .filter((l) => l.trim() && !/^#{1,6}\s/.test(l))
    .join(' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[*_`>#[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return body.length > 140 ? `${body.slice(0, 138).replace(/\s+\S*$/, '')}…` : body;
}

const summaryColumns = {
  id: documents.id,
  projectId: documents.projectId,
  title: documents.title,
  words: documents.words,
  excerpt: documents.excerpt,
  createdAt: documents.createdAt,
  updatedAt: documents.updatedAt,
  deletedAt: documents.deletedAt,
};

const projectColumns = {
  id: projects.id,
  name: projects.name,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
};

const scheduleColumns = {
  id: schedules.id,
  projectId: schedules.projectId,
  cadence: schedules.cadence,
  nextAt: schedules.nextAt,
  createdAt: schedules.createdAt,
  updatedAt: schedules.updatedAt,
};

const CADENCES: readonly Cadence[] = ['daily', 'weekly', 'biweekly', 'monthly'];

function cadenceOf(v: unknown): Cadence {
  const c = String(v ?? '');
  if (!CADENCES.includes(c as Cadence)) throw new LibraryError('Choose how often the article should appear.');
  return c as Cadence;
}

/**
 * The next time a rhythm falls due, from `from`. Articles arrive at the start
 * of their period (local midnight), so "every day" means the morning, not the
 * hour the schedule happened to be set. A month keeps the day of the month,
 * clamped to a shorter month (31 January → 28 February).
 */
export function nextOccurrence(from: number, cadence: Cadence): number {
  const d = new Date(from);
  if (cadence === 'monthly') {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  } else {
    d.setDate(d.getDate() + (cadence === 'daily' ? 1 : cadence === 'weekly' ? 7 : 14));
  }
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** The article's title for a period: the date, or the week or month it belongs to. */
export function titleFor(cadence: Cadence, at: number): string {
  const d = new Date(at);
  const month = MONTHS[d.getMonth()]!;
  if (cadence === 'monthly') return `${month} ${d.getFullYear()}`;
  if (cadence === 'daily') return `${month} ${d.getDate()}, ${d.getFullYear()}`;
  return `Week of ${month} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Opens a library on `driver`, bringing its tables up to date first. */
export async function openLibrary(driver: SqlDriver): Promise<Library> {
  await migrate(driver);
  return createLibrary(connect(driver));
}

export function createLibrary(db: Db): Library {
  const live = isNull(documents.deletedAt);

  async function project(id: string): Promise<Project> {
    const [p] = await db
      .select(projectColumns)
      .from(projects)
      .where(and(eq(projects.id, id), isNull(projects.deletedAt)));
    if (!p) throw new LibraryError('No such project.', 404);
    return p;
  }

  async function projectId(v: unknown): Promise<string | null> {
    if (v === null || v === undefined || v === '') return null;
    return (await project(String(v))).id;
  }

  async function doc(id: string): Promise<Document> {
    const [d] = await db.select().from(documents).where(eq(documents.id, id));
    if (!d) throw new LibraryError('No such article.', 404);
    return toDocument(d);
  }

  const toDocument = (d: typeof documents.$inferSelect): Document => ({
    id: d.id,
    projectId: d.projectId,
    title: d.title,
    words: d.words,
    excerpt: d.excerpt,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    deletedAt: d.deletedAt,
    content: d.content,
    brief: d.brief,
    meta: d.meta,
  });

  async function mediaBySha(sha256: string): Promise<MediaRecord | null> {
    const [m] = await db
      .select({ id: media.id, sha256: media.sha256, type: media.type, size: media.size, name: media.name })
      .from(media)
      .where(eq(media.sha256, sha256));
    return m ?? null;
  }

  const listWhere = (where: SQL | undefined, order = desc(documents.updatedAt)) =>
    db.select(summaryColumns).from(documents).where(where).orderBy(order);

  /** The one write path for a new article: the UI and the schedules both use it. */
  async function createDoc(fields: NewDocument = {}): Promise<Document> {
    const at = now();
    const title = clean.title(fields.title);
    const content = clean.content(fields.content);
    const row = {
      id: uuidv7(at),
      projectId: await projectId(fields.projectId),
      title,
      slug: slugify(title),
      content,
      brief: clean.brief(fields.brief),
      meta: null,
      words: countWords(content),
      excerpt: excerpt(content),
      createdAt: at,
      updatedAt: at,
    };
    await db.insert(documents).values(row);
    return { ...row, deletedAt: null };
  }

  /** A project's live schedule, newest first (there is one at a time). */
  async function activeSchedule(projectId: string): Promise<Schedule | null> {
    const [s] = await db
      .select(scheduleColumns)
      .from(schedules)
      .where(and(eq(schedules.projectId, projectId), isNull(schedules.deletedAt)))
      .orderBy(desc(schedules.createdAt))
      .limit(1);
    return s ?? null;
  }

  return {
    projects: {
      list: () =>
        db
          .select(projectColumns)
          .from(projects)
          .where(isNull(projects.deletedAt))
          .orderBy(sql`${projects.name} collate nocase`),

      async create(name) {
        const at = now();
        const p = { id: uuidv7(at), name: clean.projectName(name), createdAt: at, updatedAt: at };
        await db.insert(projects).values({ ...p, slug: slugify(p.name) });
        return p;
      },

      async rename(id, name) {
        const p = await project(id);
        const renamed = { ...p, name: clean.projectName(name), updatedAt: now() };
        await db
          .update(projects)
          .set({ name: renamed.name, slug: slugify(renamed.name), updatedAt: renamed.updatedAt })
          .where(eq(projects.id, id));
        return renamed;
      },

      async remove(id) {
        await project(id);
        const at = now();
        const [{ n } = { n: 0 }] = await db
          .select({ n: count() })
          .from(documents)
          .where(and(eq(documents.projectId, id), live));
        // Trashed articles leave too, so restoring one never points at a deleted project.
        await db.update(documents).set({ projectId: null, updatedAt: at }).where(eq(documents.projectId, id));
        // A deleted project has no rhythm to keep.
        await db
          .update(schedules)
          .set({ deletedAt: at, updatedAt: at })
          .where(and(eq(schedules.projectId, id), isNull(schedules.deletedAt)));
        await db.update(projects).set({ deletedAt: at, updatedAt: at }).where(eq(projects.id, id));
        return { moved: n };
      },
    },

    documents: {
      list: () => listWhere(live),

      search(query) {
        const q = String(query).trim();
        if (!q) return listWhere(live);
        const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        const matches = or(
          sql`${documents.title} LIKE ${pattern} ESCAPE '\\'`,
          sql`${documents.content} LIKE ${pattern} ESCAPE '\\'`,
        );
        return listWhere(and(live, matches));
      },

      async get(id) {
        const [d] = await db.select().from(documents).where(eq(documents.id, id));
        return d ? toDocument(d) : null;
      },

      create: (fields = {}) => createDoc(fields),

      async update(id, patch) {
        const current = await doc(id);
        const set: Partial<typeof documents.$inferInsert> = { updatedAt: now() };
        if ('title' in patch) {
          set.title = clean.title(patch.title);
          set.slug = slugify(set.title);
        }
        if ('content' in patch) {
          set.content = clean.content(patch.content);
          set.words = countWords(set.content);
          set.excerpt = excerpt(set.content);
        }
        if ('brief' in patch) set.brief = clean.brief(patch.brief);
        if ('meta' in patch) set.meta = clean.meta(patch.meta);
        if ('projectId' in patch) set.projectId = await projectId(patch.projectId);
        await db.update(documents).set(set).where(eq(documents.id, id));
        return {
          id,
          updatedAt: set.updatedAt!,
          words: set.words ?? current.words,
          excerpt: set.excerpt ?? current.excerpt,
        };
      },

      async trash(id) {
        await doc(id);
        const at = now();
        await db.update(documents).set({ deletedAt: at, updatedAt: at }).where(eq(documents.id, id));
      },

      trashed: () => listWhere(isNotNull(documents.deletedAt), desc(documents.deletedAt)),

      async restore(id) {
        await doc(id);
        await db.update(documents).set({ deletedAt: null, updatedAt: now() }).where(eq(documents.id, id));
      },

      async purge(id) {
        const d = await doc(id);
        if (d.deletedAt === null) throw new LibraryError('Move the article to the trash first.', 409);
        await db.delete(versions).where(eq(versions.documentId, id));
        await db.delete(documents).where(eq(documents.id, id));
      },
    },

    versions: {
      list: (documentId) =>
        db
          .select({ id: versions.id, label: versions.label, words: versions.words, createdAt: versions.createdAt })
          .from(versions)
          .where(and(eq(versions.documentId, documentId), isNull(versions.deletedAt)))
          .orderBy(desc(versions.createdAt)),

      async get(documentId, id) {
        const [v] = await db
          .select({
            id: versions.id,
            label: versions.label,
            words: versions.words,
            createdAt: versions.createdAt,
            title: versions.title,
            content: versions.content,
          })
          .from(versions)
          .where(and(eq(versions.documentId, documentId), eq(versions.id, id)));
        return v ?? null;
      },

      async save(documentId, label = '') {
        const d = await doc(documentId);
        const [last] = await db
          .select()
          .from(versions)
          .where(eq(versions.documentId, documentId))
          .orderBy(desc(versions.createdAt))
          .limit(1);
        if (last && last.content === d.content && last.title === d.title) {
          return { id: last.id, label: last.label, words: last.words, createdAt: last.createdAt, unchanged: true };
        }
        const at = now();
        const v = { id: uuidv7(at), label: s(label, 80), words: countWords(d.content), createdAt: at };
        await db.insert(versions).values({ ...v, documentId, title: d.title, content: d.content, updatedAt: at });
        // Thin out the oldest automatic versions first, never the one just saved.
        const all = await db
          .select({ id: versions.id, label: versions.label })
          .from(versions)
          .where(eq(versions.documentId, documentId))
          .orderBy(asc(versions.createdAt));
        const older = all.slice(0, -1);
        for (let extra = all.length - MAX_VERSIONS; extra > 0; extra--) {
          const i = older.findIndex((x) => !x.label);
          const [gone] = older.splice(i === -1 ? 0 : i, 1);
          if (gone) await db.delete(versions).where(eq(versions.id, gone.id));
        }
        return v;
      },
    },

    schedules: {
      list: () =>
        db.select(scheduleColumns).from(schedules).where(isNull(schedules.deletedAt)).orderBy(asc(schedules.nextAt)),

      get: activeSchedule,

      async set(projectId, cadence, brief) {
        const p = await project(projectId);
        const how = cadenceOf(cadence);
        const at = now();
        const existing = await activeSchedule(p.id);
        const nextAt = nextOccurrence(at, how);
        if (existing) {
          await db.update(schedules).set({ cadence: how, nextAt, updatedAt: at }).where(eq(schedules.id, existing.id));
          return { schedule: { ...existing, cadence: how, nextAt, updatedAt: at } };
        }
        // The first article is made now, so one is waiting to be written.
        const document = await createDoc({
          projectId: p.id,
          title: titleFor(how, at),
          ...(brief ? { brief } : {}),
        });
        const schedule: Schedule = {
          id: uuidv7(at),
          projectId: p.id,
          cadence: how,
          nextAt,
          createdAt: at,
          updatedAt: at,
        };
        await db.insert(schedules).values(schedule);
        return { schedule, document };
      },

      async remove(projectId) {
        const at = now();
        await db
          .update(schedules)
          .set({ deletedAt: at, updatedAt: at })
          .where(and(eq(schedules.projectId, projectId), isNull(schedules.deletedAt)));
      },

      async run(at = now()) {
        const due = await db
          .select(scheduleColumns)
          .from(schedules)
          .innerJoin(projects, eq(projects.id, schedules.projectId))
          .where(and(isNull(schedules.deletedAt), isNull(projects.deletedAt), lte(schedules.nextAt, at)));
        const made: DocumentSummary[] = [];
        for (const s of due) {
          made.push(await createDoc({ projectId: s.projectId, title: titleFor(s.cadence, at) }));
          // Move past the periods that went by while the app was closed; the
          // writer gets one article to catch up with, not a backlog.
          let next = nextOccurrence(s.nextAt, s.cadence);
          for (let i = 0; next <= at && i < 1000; i++) next = nextOccurrence(next, s.cadence);
          await db.update(schedules).set({ nextAt: next, updatedAt: at }).where(eq(schedules.id, s.id));
        }
        return made;
      },
    },

    media: {
      get: mediaBySha,

      async record(image) {
        const known = await mediaBySha(image.sha256);
        if (known) return known;
        const at = now();
        const m = { id: uuidv7(at), ...image };
        await db.insert(media).values({ ...m, createdAt: at, updatedAt: at });
        return m;
      },
    },

    settings: {
      async all() {
        const rows = await db.select({ key: settings.key, value: settings.value }).from(settings);
        return Object.fromEntries(rows.map((r) => [r.key, r.value]));
      },

      async get<T>(key: string) {
        const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
        return row?.value as T | undefined;
      },

      async set(key, value) {
        const at = now();
        await db
          .insert(settings)
          .values({ key, value, updatedAt: at })
          .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: at } });
      },
    },
  };
}
