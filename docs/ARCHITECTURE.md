# Margin — architecture

*Proposal, 26 October 2026. Status: for review.*
✅ = decided · 🟡 = recommended, needs sign-off

## What we're building

An open-source writing app that:

- runs on **Mac and Windows** (Linux comes free) and **in the browser**;
- **works offline** — writing, AI help and checks all run on your machine by default;
- can be **self-hosted** — `docker compose up` gives a team or a single writer a server with Postgres;
- has a **hosted cloud version, Margin Cloud**, run by the project owner — sync, a web editor, and hosting for published sites;
- **publishes to your own site** — a project like *example.com* becomes a website, hosted by Margin Cloud on your own domain, or deployed anywhere else.

Principles that every decision below follows:

1. **You write; Margin edits and helps you think.** The AI never writes the article from scratch — no drafted sections, paragraphs, openings or conclusions. It edits what the author wrote (improve, tighten, simplify, change tone, fix) as pinpoint changes they accept or reject; it outlines logic and argument (headings, notes, the steps of a section, evidence to find, objections, questions); and it checks facts and reasoning. Requests for new writing are declined in code, not just in the prompt. The one exception is the **next logical sentence** ✅: when the author finishes a sentence and pauses, Margin first checks whether the paragraph has made its point — a judge quotes the sentences that state it, support it and draw its meaning, and code decides. If it has, Margin says so ("¶ point made · Tab for new paragraph") and suggests nothing; if not, it may suggest the one sentence that supplies the missing part — never word by word, one sentence at a time, shown in grey, used only if accepted. After a suggestion is taken, Margin waits for a sentence of the author's own before suggesting again, so Tab can never write a paragraph.
2. **Your words are yours.** Local by default; nothing leaves the machine unless you configure it to; everything exports to plain Markdown at any time.
3. **Never lose a word.** Durable storage on a real disk, versions, a trash, automatic backups.
4. **AI proposes; you decide.** Pinpoint edits you accept or reject, checks that say where their knowledge came from, arithmetic done by code — never by the model.
5. **Write each feature once.** One codebase runs in all three places.

## Four ways to run it

| | Desktop app | Self-hosted server | Margin Cloud ✅ | Web app |
|---|---|---|---|---|
| Who runs it | you | you | the project owner | — |
| Shell | Tauri 2 ✅ | Node (Hono) in Docker | the same server, plus cloud services | Browser |
| Data | **SQLite file** on disk 🟡 | **Postgres 16+** ✅ | Postgres ✅ | via a server |
| AI | Ollama on the machine, or any configured provider | the server's Ollama or API keys | your own key, or managed models | through the server |
| Publishing | to any target | to any target | **hosts your site on your domain** | — |
| Offline | yes, fully | — | — | v2 (local cache + outbox) |
| Accounts | none (sign in to sync) | yes | yes | yes |

The self-hosted server and Margin Cloud run **the same open-source server**. The cloud adds services only a hosted product needs — tenancy and quotas, billing, site hosting, custom domains, managed AI — which live in their own private repository and plug into the server through defined interfaces.

## Storage

**Self-hosted: Postgres ✅.** Concurrent users, real backups (`pg_dump`), full-text search, `pgvector` later for "search my notes by meaning".

**Desktop: one SQLite file 🟡** — e.g. `~/Library/Application Support/Margin/library.db`, accessed through Tauri's SQL plugin (Rust, `sqlx`).

Why not Postgres on the desktop too? We looked at PGlite (Postgres compiled to WebAssembly). Inside a Tauri app it can only store data in the webview's IndexedDB, not a file. That storage has been reported to [not survive app updates in Tauri](https://releases.powersync.com/announcements/ann_mPwGQpcccCyvL), and PGlite is still [marked alpha](https://github.com/electric-sql/pglite). A writing app can't risk its only copy of someone's work on that. Running real Postgres beside the app would add a background process and 40+ MB. SQLite is a single durable file, battle-tested, and easy to back up or move.

**One data layer, two dialects.** We use Drizzle ORM: `pg-core` schema for the server, `sqlite-core` for desktop (through Drizzle's proxy driver to the Tauri SQL plugin — a [proven pattern](https://dev.to/huakun/drizzle-sqlite-in-tauri-app-kif)). To keep the two honest:

- portable column types only — ids as text UUIDs, times as integer milliseconds, structured fields as JSON text;
- repository functions with explicit queries (no ORM nested-relation magic, which [misbehaves over the proxy](https://dev.to/meddjelaili/building-a-tauri-v2-drizzle-sqlite-app-starter-template-15bm));
- **one test suite runs every repository function against both** — SQLite, and Postgres via PGlite in Node (where PGlite is a perfect fit: a real Postgres for tests, no server needed).

**Portability.** *Export everything* writes a folder of Markdown files with front matter, plus media. Desktop also keeps a daily backup there by default.

### Schema (v1) — ready for sync from day one

Every row has a UUIDv7 id (time-ordered), `created_at`, `updated_at`, `deleted_at` (tombstone, so deletes sync), and `rev` (a change counter the server assigns for sync).

| Table | Holds |
|---|---|
| `users`, `workspaces`, `memberships` | server only: who can see what (owner, editor, viewer) |
| `projects` | name, slug, publishing settings (JSON) |
| `documents` | title, slug, **content as Markdown**, brief, outline, meta, `status` (draft / published / scheduled), `published_at`, `project_id` |
| `versions` | snapshots of a document (label, title, content, words) |
| `media` | images: sha-256, type, size, storage key — deduplicated by content |
| `ai_profiles` | providers and which model plays which role (see AI) |
| `publish_targets`, `deploys` | where a project publishes, and each deploy's result |

Markdown stays the document format: portable, diff-friendly, ideal for AI. If we add real-time co-editing, a Yjs document per article syncs the same text through CodeMirror without changing the format.

## Code layout

A TypeScript monorepo (pnpm workspaces):

```
apps/
  desktop/    Tauri 2 shell — window, menus, auto-update, keychain, SQL, HTTP to Ollama
  server/     Hono API — auth, Postgres, AI proxy, scheduled publishing; serves the web build
  web/        Vite build of the UI for browsers
packages/
  core/       pure logic: checks, diff, integrity, analysis, Markdown, prompts, anchoring,
              streaming JSON, the LLM client and AI tasks (review, check, edit, think)
  db/         Drizzle schemas (pg + sqlite), migrations, repositories, shared tests
  editor/     the CodeMirror 6 layer: ghost text, tracked changes, margin notes, images
  ui/         the app in React + Tailwind + shadcn/ui ✅
  publish/    static site generator, themes, deploy adapters
```

The UI talks to **one `Backend` interface** with two implementations:

- **`LocalBackend`** (desktop): `core` and `db` run inside the app; AI requests go out through Tauri's HTTP plugin.
- **`RemoteBackend`** (web): the same calls over HTTP to `apps/server`, which runs the same `core` and `db` against Postgres.

So a feature like *fact-check a selection* is written once in `core` and appears everywhere. Almost everything in today's prototype (`checks.js`, `diff.js`, `integrity.js`, `analysis.js`, `markdown.js`, prompts, anchoring) moves into `packages/core` as it is, with its 38 tests.

**UI stack:** React 19, Vite, Tailwind CSS v4, shadcn/ui (Radix underneath) for every control, TanStack Router and Query, CodeMirror 6 for the editor (shadcn has no editor; CodeMirror works fine inside React).

**The editor keeps the keyboard.** Tab never leaves the editor. It accepts the suggestion or hint that's showing; the "¶ point made" hint inserts a paragraph break in place of the trailing space. Otherwise Tab indents a list item (Shift-Tab outdents), and otherwise it does nothing. Esc then Tab within 1.5 s moves focus on, so keyboard users are never trapped. The reference is the prototype's `margin/editor-src/index.js`: the `aiKeys` Tab binding, `inListItem` and `escapedJustNow`.

## AI

- **Providers:** Ollama (default, local) · any OpenAI-compatible endpoint (LM Studio, llama.cpp, vLLM, hosted) · Anthropic.
- **Roles, each its own model** (none of them writes the author's prose):
  - *quick*: autocomplete, edits, checks;
  - *coach*: outlines and section plans — the argument, never the prose;
  - *checker*: fact-checking, where a larger or hosted model helps most.
- **Keys:** the OS keychain on desktop; encrypted server secrets when self-hosted. Never stored in plain text, never in exports.
- **Transparency:** the UI shows where each request goes (this Mac / your server / a named provider).
- **Rules kept from the prototype:**
  - edits are pinpoint operations, never whole-passage rewrites;
  - numbers are checked by code;
  - fact-check corrections are confirmed by a second, neutral question before they're shown.

## Publishing

A **project is a publication**. Its settings hold:

- domain and site title;
- theme;
- which articles are live, and their slugs;
- SEO fields (generated today by *Publish*);
- RSS and sitemap.

Margin builds a static site — fast, cheap to host, secure — and publishes it to a target. **Margin Cloud is the default target** ✅. The others stay available, so open-source users never depend on the cloud:

- GitHub Pages or Cloudflare Pages (git push or API);
- Netlify (API);
- your own server (SFTP/rsync);
- a plain folder.

Drafts stay private. Scheduled posts go out from the cloud or a self-hosted server, or the next time the desktop app is open. Export to Ghost or WordPress comes later.

## Margin Cloud: hosting your site on your domain

### Connecting a domain

What a writer sees, in project settings → **Domain**:

1. **Instant address.** Every site gets `yourname.<cloud-domain>` the moment it's first published.
2. **Add a domain.** You type `example.com`. Margin shows exactly three DNS records to add at your registrar, with copy buttons:
   - `A  @  →  <our IPv4>` (and an `AAAA` record for IPv6) — works at **every** registrar, including GoDaddy and Namecheap;
   - `CNAME  www  →  sites.<cloud-domain>`;
   - `TXT  _margin  →  <token>` — proves the domain is yours.
3. **Live status.** The page checks DNS by itself and moves through *waiting for DNS* → *verified* → *secured with HTTPS*. Each step says what is wrong if it stalls ("your A record still points to 192.0.2.10, your old host").
4. **Done, with redirects handled:**
   - you choose `example.com` or `www.example.com` as the main address, and the other permanently redirects (301) to it, keeping the path;
   - `http://` redirects to `https://`, and HSTS is switched on once certificates are stable;
   - the `<cloud-domain>` address redirects to your domain, and every page names one canonical URL, so search engines see one site;
   - changing an article's slug adds a 301 from the old URL automatically;
   - moving from another blog: import a list of old → new paths and they all redirect.

Removing the domain stops serving it and releases its certificate.

### How it's served

```
reader → edge (Caddy, on-demand HTTPS) → site router → object storage (static builds)
                                            ↑
                                Postgres: host → site → live build
```

- **HTTPS for any domain.**
  - The edge runs Caddy with [on-demand TLS](https://caddyserver.com/on-demand-tls): it fetches a Let's Encrypt certificate the first time a domain is visited.
  - Before issuing, Caddy asks our *ask* endpoint whether the domain belongs to a verified site. Only verified domains get certificates, so nobody can make us issue certificates for domains they don't own.
  - Bare domains work because they point at our fixed IP with an A record.
- **Atomic publishing.**
  - Each publish uploads a complete static build to object storage (S3-compatible — Hetzner Object Storage): `sites/<site>/builds/<build>/…`.
  - When the upload finishes, one database row switches the live build. Readers never see a half-published site, and **rollback is one click**.
- **Speed.** Builds are immutable, so the edge and any CDN cache them forever and purge on publish.
- **Why not Cloudflare for SaaS?** It's cheap ($0.10 per hostname after 100) and global, but [bare domains need its Enterprise plan](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/). On self-serve plans, `example.com` would only work at registrars with special apex records. Our own edge works everywhere. A CDN can sit in front later.
- **Start small.**
  - One server with a fixed IP, plus object storage, serves thousands of static sites (see Deployment).
  - Add a CDN or a second region when traffic needs it.
  - The *ask* endpoint and the site router stay the same.

### The cloud account

- **Sign-in and sync.** Sign up on the web, or sign in from the desktop app: your library syncs (see Sync), and you can write in the browser on any machine.
- **AI.** Bring your own key, or use managed models, metered by plan. Local models keep working on the desktop, free.
- **Billing.** Stripe. Plans are a business decision for later, but the system supports a free tier (instant address) and paid features (custom domain, storage, managed AI).
- **Trust and safety.** Hosting other people's writing needs terms of service, a content policy, an abuse and DMCA contact, and the ability to suspend a site. A privacy policy and a data-processing agreement are needed before EU customers.
- **Backups.** Point-in-time Postgres backups, with versioning on object storage.

### Deployment: your Hetzner server ✅

The whole cloud starts on one Hetzner server, run with Docker Compose — the same images self-hosters use, plus the private cloud services:

| Service | Role |
|---|---|
| `caddy` | HTTPS for the app, the API and every custom domain (on-demand TLS); HTTP→HTTPS and apex/www redirects |
| `server` | the Margin API and web app (Node, Hono) |
| `worker` | builds and publishes sites, runs scheduled posts, checks DNS for domains waiting to connect |
| `router` | maps a request's host to its site's live build and serves it from object storage, with a local cache |
| `postgres` | all data; WAL archiving for point-in-time recovery |

Around it, all at Hetzner:

- **A Floating IP** (or a failover IP, on a dedicated server) is the address customers point their domains at. It can move to a new or bigger server in seconds without anyone changing their DNS. This is the one thing to set up before the first customer adds a domain. IPv6 gets the same treatment.
- **Hetzner Object Storage** (S3-compatible) holds site builds, images and Postgres backups. A **Storage Box** keeps a second, independent backup copy.
- **A Hetzner Cloud Firewall** opens only ports 80 and 443 (and SSH from your IP).
- **The EU location** keeps customer data in the EU, which helps with GDPR and is worth saying on the pricing page.

**Managed AI on Hetzner**:
- start with hosted model APIs, metered per plan;
- move to a Hetzner GPU server running Ollama or vLLM when usage justifies it. The provider layer makes that a configuration change.

**Growing past one server:**
1. Move Postgres to its own machine.
2. Run two app servers behind a Hetzner Load Balancer.
3. Put a CDN in front of the router for readers far from Europe.

None of these steps changes the code or customers' DNS.

## Auth (self-hosted)

[better-auth](https://www.better-auth.com) with email and password plus passkeys, and optional OAuth. Sessions live in Postgres. Roles are owner, editor and viewer per workspace. The desktop app has no login — until you connect it to a server.

## Sync (designed now; built right after the server — the cloud depends on it)

Desktop ↔ your server: local changes go into an outbox and are pushed through the API; pulls fetch everything with `rev` greater than the last one seen. A text conflict starts as *keep both* (a "conflicted copy", like Dropbox); real-time co-editing upgrades the document to Yjs. Electric's sync engine was considered, but it [syncs reads only](https://github.com/electric-sql/pglite) — writes go through your own API anyway — so a small protocol of our own is simpler.

## Open source

- **License 🟡: AGPL-3.0 for the open code, with a contributor licence agreement (CLA).**
  - **Why AGPL:** anyone who runs a modified Margin as a service must share their changes, so a closed copy can't compete with Margin Cloud. MIT would maximise adoption but allow exactly that.
  - **Why the CLA matters for the cloud:** you own your own code. Once others contribute, though, the cloud must either follow the AGPL for their code too, or hold the rights a CLA grants. Cloud-only services (billing, tenancy, hosting, domains) stay in a private repository and talk to the open server through interfaces. This is the open-core model Cal.com and Plausible use.
  - Have a lawyer look at the licence and CLA before the public launch.
- **Quality bar:** GitHub with CI (typecheck, lint, unit, Playwright end-to-end), conventional commits, and a `CONTRIBUTING.md`.
- **Releases:** signed releases need an Apple Developer account ($99/year, for notarization) and a Windows code-signing certificate.

## Plan

| Phase | Delivers |
|---|---|
| 0 | This document, signed off |
| 1 | Monorepo scaffold; `packages/core` ported to TypeScript with all tests |
| 2 | `packages/db`: both schemas, migrations, repositories, dual-dialect test suite |
| 3 | `packages/ui` in shadcn: shell, library with projects, editor, margin notes, selection toolbar, Assist |
| 4 | `apps/server` (Hono, Postgres, auth) and `apps/web` with Docker Compose |
| 5 | `apps/desktop` (Tauri): SQLite, keychain, Ollama, menus, auto-update, installers. *Started early: the shell, its permissions and the unsigned Mac/Windows release workflow exist — see `apps/desktop/README.md`.* |
| 6 | Publishing v1: static site generator, themes, folder and GitHub/Cloudflare Pages targets |
| 7 | Sync between desktop and a server (self-hosted or cloud) |
| 8 | Margin Cloud: accounts, site hosting, custom domains with automatic HTTPS and redirects, billing |
| 9 | Offline web app; real-time co-editing if wanted |

## Decisions needing sign-off

1. **Desktop storage:** SQLite file 🟡 (alternative: PGlite in the webview — one dialect, but its data isn't a file and may not survive updates).
2. **Accounts:** schema ready for teams; v1 ships for single writers who can invite others later 🟡.
3. **Custom domains:** our own edge with on-demand HTTPS, so bare domains work at every registrar 🟡 (alternative: Cloudflare for SaaS — cheaper and global, but bare domains need its Enterprise plan).
4. **License:** AGPL-3.0 + CLA, with cloud-only services in a private repository 🟡 (alternative: MIT).
5. **Names:**
   - the product name — "Margin" is a common word, so check the GitHub org, domain and trademark;
   - the cloud domain that hosts sites (`<name>.<cloud-domain>`).
