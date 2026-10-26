import type { SqlDriver } from './driver.ts';
import { MIGRATIONS, type Migration } from './migrations.ts';

/**
 * Brings the library up to date. Each migration runs as one script inside a
 * transaction, together with the row that records it, so a migration is
 * either applied and recorded or not applied at all.
 */
export async function migrate(driver: SqlDriver, migrations: Migration[] = MIGRATIONS): Promise<string[]> {
  await driver.exec(
    'CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)',
  );
  const done = new Set((await driver.all('SELECT id FROM migrations', [])).map((r) => String(r.id)));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    if (!/^[\w-]+$/.test(m.id)) throw new Error(`Bad migration id: ${m.id}`);
    const body = m.sql.split('--> statement-breakpoint').join('\n');
    try {
      await driver.exec(
        `BEGIN;\n${body}\nINSERT INTO migrations (id, applied_at) VALUES ('${m.id}', ${Date.now()});\nCOMMIT;`,
      );
    } catch (err) {
      await driver.exec('ROLLBACK').catch(() => {});
      throw err;
    }
    applied.push(m.id);
  }
  return applied;
}
