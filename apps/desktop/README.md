# apps/desktop

Clearpen for Mac and Windows: the writing app (`@clearpen/ui`) in a [Tauri 2](https://tauri.app) shell. This app only supplies a `Backend` (`src/desktop-backend.ts`): the library, images, save dialogs, the local model and the integrated terminal. Everything you see comes from `packages/ui`. What's built and what comes next is in [the plan](../../docs/plans/writing-app.md).

## What the shell adds

| | How | Where it's set |
|---|---|---|
| **Library** | One SQLite file, through Tauri's SQL plugin: `library.db` in the app's config folder — `~/Library/Application Support/app.clearpen.desktop/` on Mac, `%APPDATA%\app.clearpen.desktop\` on Windows. `@clearpen/db` brings its tables up to date on every launch. | `src/desktop-backend.ts` |
| **Images** | Pasted and dropped images are stored once, by content, in a `media` folder beside the library, and shown through Tauri's asset protocol. Articles refer to them as `media/<hash>.png`. | `src/desktop-backend.ts`, `tauri.conf.json` |
| **Saving files** | "Save as Markdown…" and "Save as web page…" ask where with the system's save dialog. | `src/desktop-backend.ts` |
| **Local models** | Requests to Ollama go through Tauri's HTTP plugin, so there is no CORS. They carry no `Origin` header, because Ollama turns away the app's Windows origin (`http://tauri.localhost`) with a 403. The same plugin reaches OpenRouter. | `src/desktop-backend.ts`, `src-tauri/Cargo.toml` |
| **API keys** | The OpenRouter key is kept in the operating system's credential store, under the service `app.clearpen.desktop` and the account `openrouter` — Keychain on Mac, Credential Manager on Windows, Secret Service on Linux — through the `keyring` crate. It never touches the library, a settings file or a log, and the window can read, write or delete only that one entry. | `src-tauri/src/lib.rs`, `packages/ui/src/backend.ts` |
| **Terminal** | A bottom panel of tabs, each a real shell: `portable-pty` opens a pseudo-terminal per tab, streams its bytes over a Tauri channel to xterm.js, and writes keystrokes back. **AI Runner** starts `opencode` in a folder the writer chooses. Closing a tab, or the window, ends its shell. | `src-tauri/src/terminal.rs`, `packages/ui/src/components/terminal-panel.tsx` |
| **Web apps** | Telegram, WhatsApp, X, Google and Wikipedia in child webviews (Tauri's multiwebview API), each with its own data directory, so a login survives a restart. No iframe; only http and https load. Google and Apple sign-in open in the system browser because they refuse to authorize inside embedded webviews. | `src-tauri/src/webapps.rs`, `packages/ui/src/components/webapps-view.tsx` |
| **Event log** | `command.executed`, `article.written`, `terminal.opened`, `webapp.navigated` and notifications go through a `tokio::sync::broadcast` hub, then into the `interactions` table. The window shows `notification.received` in the bell. | `src-tauri/src/events.rs`, `packages/ui/src/events.tsx`, `packages/db/src/schema.ts` |
| **File explorer** | A read-only Finder-style view: `fs_list` reads a folder; `fs_search` uses the `ignore` crate's parallel walker over the current folder, skips dependency trees, and returns at most 200 paths within 2.2 s. Folder sizes are lazy, cached for two minutes and streamed as each finishes; `fs_open` and `fs_reveal` use the system. Cleanup scans Home for the 100 largest files (read-only). No index, no writes. | `src-tauri/src/files.rs`, `packages/ui/src/components/files-view.tsx` |
| **First-run setup** | With no Ollama or no model, the app links to ollama.com in the browser (Tauri's opener plugin) and downloads the model through Ollama with its progress. It reads the computer's memory (a `total_memory` command, with the `sysinfo` crate) to offer Qwen3 8B, or Qwen3 4B on 8 GB. | `src-tauri/src/lib.rs`, `packages/ui/src/setup.tsx` |
| **Never lose a word** | Changes waiting to be saved are written before the window closes. | `src/desktop-backend.ts` (`beforeClose`) |
| **Permissions** | The window may open its database, read and write its `media` folder, write a file the writer picked in a save dialog, reach model hosts over HTTP and HTTPS (Ollama on `127.0.0.1:11434` / `localhost:11434`, and OpenRouter), and open web and mail links (an article's links, `https://ollama.com/*`, `https://www.tradingview.com/*` for the full chart behind a ticker's price tag) in the browser — nothing else. Redirects are checked against that list too. | `src-tauri/capabilities/default.json`, `tauri.conf.json` |
| **Content Security Policy** | Scripts only from the app itself and TradingView's widget host (the ticker tag an investment note shows beside each ticker, loaded only when such a note is open); images only from the app's own folder and TradingView's symbol logos; frames only from that widget host; network only through Tauri's IPC and to that host. Images from the web don't load. | `tauri.conf.json` → `app.security` |

The app folder's name comes from the bundle identifier, `app.clearpen.desktop`. **Don't change it:** a new identifier moves where everyone's library lives.

macOS 13.3 or later is required. The engine uses regular-expression lookbehind, which WebKit has supported only since Safari 16.4.

## Develop

You need [Rust](https://rustup.rs) 1.90 or later, plus Xcode Command Line Tools on Mac or the [Microsoft C++ Build Tools and WebView2](https://tauri.app/start/prerequisites/) on Windows.

```bash
pnpm install
pnpm --filter @clearpen/desktop tauri dev
```

The window loads the Vite dev server on port 1420 and reloads as you edit.

To work on the interface without Tauri, run `pnpm --filter @clearpen/desktop dev` and open http://localhost:1420 in a browser. The browser saves its SQLite library and images in IndexedDB. See [self-hosting](../web/README.md) to serve the production web build.

## Build an installer

```bash
pnpm --filter @clearpen/desktop tauri build
```

Installers land in `src-tauri/target/release/bundle/`: `macos/Clearpen.app` and `dmg/Clearpen_<version>_<arch>.dmg` on Mac, or an `nsis/…-setup.exe` and an `msi/…​.msi` on Windows. The first build compiles every Rust dependency and takes a few minutes. Later builds take about a minute.

If the `.dmg` step fails on your Mac with `hdiutil: couldn't unmount … Resource busy` (something holds the temporary disk image open), build just the app and make the image yourself:

```bash
pnpm --filter @clearpen/desktop tauri build --bundles app
mkdir -p /tmp/clearpen-dmg && cp -R src-tauri/target/release/bundle/macos/Clearpen.app /tmp/clearpen-dmg/ && ln -sf /Applications /tmp/clearpen-dmg/Applications
hdiutil create -volname Clearpen -srcfolder /tmp/clearpen-dmg -ov -format UDZO src-tauri/target/release/bundle/dmg/Clearpen.dmg
```

For one Mac app that runs on both Apple silicon and Intel, install both Rust targets with rustup and build with `--target universal-apple-darwin`. The release workflow does this.

## Release

1. Set `version` in `apps/desktop/package.json`. Tauri reads it from there.
2. Tag the commit `desktop-v<version>`, for example `desktop-v0.1.0`, and push the tag.
3. [The Desktop workflow](../../.github/workflows/desktop.yml) builds the universal Mac app (`.dmg`) and the Windows installers (`.exe` and `.msi`). It attaches them to a **draft** pre-release. Try them, then publish the release.

The workflow refuses a tag that doesn't match the version. Running it by hand from the Actions tab only builds, and keeps the installers as workflow artifacts.

## Signing

Builds are **unsigned** for now, so people see warnings when they install:

- **Mac:** the app is ad-hoc signed (`signingIdentity: "-"`), which Apple silicon requires before an app can run. The first time someone opens it, macOS says it can't check the app. They then go to System Settings → Privacy & Security → Open Anyway.
- **Windows:** SmartScreen says "Windows protected your PC". They choose More info → Run anyway.

**To sign for Mac**, you need the Apple Developer Program ($99 a year):

1. Create a *Developer ID Application* certificate and export it from Keychain Access as a `.p12`.
2. Add these repository secrets:
   - `APPLE_CERTIFICATE`: the `.p12`, base64-encoded (`base64 -i cert.p12 | pbcopy`).
   - `APPLE_CERTIFICATE_PASSWORD`.
   - `APPLE_SIGNING_IDENTITY`: for example `Developer ID Application: Your Name (TEAMID)`.
   - For notarization: `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password) and `APPLE_TEAM_ID`.
3. Uncomment the matching lines in the workflow. The signing identity from the secret replaces the ad-hoc one; Tauri then signs, notarizes and staples the app.

**To sign for Windows**, use a code-signing certificate (OV or EV) or Azure Trusted Signing. Configure it under `bundle.windows` in `tauri.conf.json`: `certificateThumbprint`, or a `signCommand` for cloud signing. See [Tauri's Windows signing guide](https://tauri.app/distribute/sign/windows/).

Certificates, passwords and keys go in CI secrets only, never in the repository.

## Updates

The app doesn't update itself yet. To turn updates on:

1. Generate an update key: `pnpm --filter @clearpen/desktop tauri signer generate -w ~/.tauri/clearpen.key`. Keep the private key and its password safe. **Losing them means existing installs can never update again.**
2. Add the updater plugin (`pnpm --filter @clearpen/desktop tauri add updater`). Then:
   - put the public key and an update URL in `tauri.conf.json` under `plugins.updater`;
   - set `bundle.createUpdaterArtifacts` to `true`.
3. Add `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as secrets, and uncomment them in the workflow. Set `uploadUpdaterJson: true` on the tauri-action step.

That step publishes a `latest.json` with each GitHub release, and the app can check it. Later, Clearpen Cloud can serve the same file.

## Before the first public release

- [x] Final product name and bundle identifier: Clearpen, `app.clearpen.desktop`
- [ ] Mac signing and notarization; Windows signing
- [ ] Update keys, and the updater turned on
- [x] `LICENSE`: AGPL-3.0-or-later
