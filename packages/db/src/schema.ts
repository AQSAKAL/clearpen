// The library's tables, in SQLite. Portable on purpose, so the Postgres
// version (with the server) is a translation: ids are UUIDv7 text, times are
// integer milliseconds, structured fields are JSON text. Every syncable row
// carries created/updated/deleted times (deletes are tombstones) and `rev`,
// the change counter a server will assign once sync exists.

import type { Brief, Meta } from '@clearpen/core';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const stamps = {
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  rev: integer('rev').notNull().default(0),
};

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  /** How the project publishes (phase 6). */
  publishing: text('publishing', { mode: 'json' }).$type<Record<string, unknown>>(),
  ...stamps,
});

/**
 * Recurring writing: one rhythm per project. Clearpen keeps an article ready
 * for the current period, and makes the next one when the period turns.
 */
export const schedules = sqliteTable(
  'schedules',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    /** How often a new article appears. */
    cadence: text('cadence', { enum: ['daily', 'weekly', 'biweekly', 'monthly'] }).notNull(),
    /** When the next article is due, in milliseconds. */
    nextAt: integer('next_at').notNull(),
    ...stamps,
  },
  (t) => [index('schedules_project').on(t.projectId), index('schedules_next').on(t.nextAt)],
);

export const documents = sqliteTable(
  'documents',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id'),
    title: text('title').notNull().default(''),
    slug: text('slug').notNull().default(''),
    /** The article, as Markdown. */
    content: text('content').notNull().default(''),
    brief: text('brief', { mode: 'json' }).$type<Brief>().notNull(),
    meta: text('meta', { mode: 'json' }).$type<Meta>(),
    status: text('status', { enum: ['draft', 'published', 'scheduled'] })
      .notNull()
      .default('draft'),
    publishedAt: integer('published_at'),
    // Kept on save so the library list never reads every article.
    words: integer('words').notNull().default(0),
    excerpt: text('excerpt').notNull().default(''),
    ...stamps,
  },
  (t) => [index('documents_project').on(t.projectId), index('documents_updated').on(t.updatedAt)],
);

export const versions = sqliteTable(
  'versions',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id').notNull(),
    label: text('label').notNull().default(''),
    title: text('title').notNull(),
    content: text('content').notNull(),
    words: integer('words').notNull(),
    ...stamps,
  },
  (t) => [index('versions_document').on(t.documentId, t.createdAt)],
);

export const media = sqliteTable('media', {
  id: text('id').primaryKey(),
  /** Images are stored once, by content. */
  sha256: text('sha256').notNull().unique(),
  type: text('type').notNull(),
  size: integer('size').notNull(),
  /** The file under the library's media folder: `<sha256 prefix>.<ext>`. */
  name: text('name').notNull(),
  ...stamps,
});

/** Preferences and app state, one JSON value per key. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * The interaction log: one append-only row per event from the app's event hub.
 * `data` is the event's free-form JSON (for a notification, its title, body and
 * severity). A later small model reads this to learn what to surface.
 */
export const interactions = sqliteTable(
  'interactions',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    source: text('source').notNull(),
    /** Milliseconds since the Unix epoch. */
    at: integer('at').notNull(),
    data: text('data', { mode: 'json' }),
  },
  (t) => [index('interactions_at').on(t.at), index('interactions_kind').on(t.kind, t.at)],
);
