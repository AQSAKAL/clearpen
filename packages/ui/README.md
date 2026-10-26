# @clearpen/ui

Clearpen's interface in React and [shadcn/ui](https://ui.shadcn.com). Mount `<App backend={…} />` and import `@clearpen/ui/styles.css` once.

The UI talks to the outside world only through the `Backend` interface (`src/backend.ts`): the library, images, saving files and the model's status. The desktop app implements it with Tauri; tests implement it in memory (`test/memory-backend.ts`).

- **Components** in `src/components/ui` come from the shadcn CLI (`components.json`, style `radix-nova`). Add more with `pnpm dlx shadcn@latest add <name>` in this folder. Biome leaves that folder alone.
- **Theme:** Clearpen's paper-and-ink palette lives in `src/styles.css`, mapped onto shadcn's tokens; dark mode is the `dark` class on `<html>`.
- **Settings** — theme, fonts, the open article, collapsed projects — are kept in the library, not in browser storage.
