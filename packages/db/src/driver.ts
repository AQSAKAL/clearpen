// How the library reaches SQLite. The desktop app passes the Tauri SQL
// plugin; tests pass Node's built-in SQLite. Both go through Drizzle's proxy
// driver, so the code under test is the code that ships.
//
// The Tauri plugin runs each call on a connection pool, so a transaction
// can't span calls: every write here is one statement, and a migration is one
// script.

import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema.ts';

export interface SqlDriver {
  /** Runs one statement that returns no rows. */
  run(sql: string, params: unknown[]): Promise<void>;
  /** Runs one query; rows come back as objects in column order. */
  all(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>;
  /** Runs a script of several statements without parameters, on one connection. */
  exec(sql: string): Promise<void>;
}

export type Db = SqliteRemoteDatabase<typeof schema>;

export function connect(driver: SqlDriver): Db {
  return drizzle(
    async (sql, params, method) => {
      if (method === 'run') {
        await driver.run(sql, params);
        return { rows: [] };
      }
      const rows = (await driver.all(sql, params)).map((r) => Object.values(r));
      return { rows: method === 'get' ? (rows[0] ?? []) : rows };
    },
    { schema },
  );
}
