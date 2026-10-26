# @clearpen/db

Clearpen's library: projects, articles, versions, images and settings, as repositories over SQLite. The same code runs in the desktop app (the Tauri SQL plugin), in tests (Node's built-in SQLite, `@clearpen/db/node`) and in the browser preview (SQLite in WebAssembly). Each passes a small `SqlDriver`, and `openLibrary(driver)` brings the tables up to date and returns the `Library`.

- **Portable on purpose:** UUIDv7 ids, times in milliseconds, JSON as text, and tombstones (`deleted_at`) instead of deletes. The Postgres schema for the server is a translation.
- **One statement per write.** The Tauri plugin runs each call on a pooled connection, so a transaction can't span calls. Each migration runs as one script, in a transaction of its own.
- **Changing the schema:** edit `src/schema.ts`, then run `pnpm --filter @clearpen/db generate`. That writes the SQL to `migrations/` and embeds it in `src/migrations.ts`, so the app can run it offline.
