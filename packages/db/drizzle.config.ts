import { defineConfig } from 'drizzle-kit';

// `pnpm --filter @clearpen/db generate` writes a migration for schema changes,
// then embeds the SQL in src/migrations.ts so the app can run it offline.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './migrations',
});
