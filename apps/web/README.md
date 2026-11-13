# Self-host Clearpen

From the repository root, install with `pnpm install --frozen-lockfile`, then run `pnpm build:web`. Serve the contents of `apps/desktop/dist/` from an HTTPS static host, at the root or in a subdirectory. To try the production build locally, run `pnpm --filter @clearpen/desktop exec vite preview`. The browser and Tauri load the same React app.

Each browser profile keeps its articles, projects, sources, versions, settings, and attached images in IndexedDB for this origin. No account is required. Changing the origin, clearing site data, or leaving private browsing changes which library is available. There is no automatic sync with a desktop library. After the first online visit finishes caching the app, the production build can reopen offline for writing and export. Network-backed tools still require a connection.

**Files** indexes the folder chosen by the visitor. Browse, sort, search and find its largest files locally. Opening a file downloads a copy. To see filesystem changes, choose the folder again. Web apps open in their own tabs and use the browser's existing logins.

AI editing uses the browser's WebGPU model, Ollama with an allowed origin, or an OpenRouter key entered for this session. URL sources and feeds can be read directly when their host permits browser requests. A source's text can also be pasted.

If your deployment already has a web terminal or an opencode web interface, set `VITE_TERMINAL_URL` or `VITE_OPENCODE_URL` when building. Clearpen opens these services in a separate tab. Access to each service is controlled by its operator. The static app itself serves no shell or host filesystem.
