// The library on Node's built-in SQLite (tests, scripts and a future Node
// server), through the same driver interface the desktop app gives the Tauri
// SQL plugin. Import it as `@margin/db/node`; it isn't for browsers.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SqlDriver } from './driver.ts';

export function nodeDriver(path = ':memory:'): SqlDriver & { close(): void } {
  const db = new DatabaseSync(path);
  const values = (params: unknown[]) => params as SQLInputValue[];
  return {
    async run(sql, params) {
      db.prepare(sql).run(...values(params));
    },
    async all(sql, params) {
      return db.prepare(sql).all(...values(params)) as Record<string, unknown>[];
    },
    async exec(sql) {
      db.exec(sql);
    },
    close: () => db.close(),
  };
}
