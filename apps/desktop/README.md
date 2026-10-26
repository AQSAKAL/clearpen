# apps/desktop

Margin for Mac and Windows: the app in a [Tauri 2](https://tauri.app) shell. For now the window shows a check screen. It proves the app's parts work together on the computer: the engine, a local model and the library file. The editor replaces it in phase 3 (see [the architecture](../../docs/ARCHITECTURE.md)).

## What the shell adds

| | How | Where it's set |
|---|---|---|
| **Library** | One SQLite file, through Tauri's SQL plugin: `library.db` in the app's config folder — `~/Library/Application Support/app.margin.desktop/` on Mac, `%APPDATA%\app.margin.desktop\` on Windows. | `src-tauri/src/lib.rs` |
| **Local models** | Requests to Ollama go through Tauri's HTTP plugin, so there is no CORS. They carry no `Origin` header, because Ollama turns away the app's Windows origin (`http://tauri.localhost`) with a 403. | `src/main.ts`, `src-tauri/Cargo.toml` |
| **Permissions** | The window may open its database and reach Ollama on `127.0.0.1:11434` / `localhost:11434` — nothing else. Redirects are checked against that list too. | `src-tauri/capabilities/default.json`, `tauri.conf.json` |
| **Content Security Policy** | Scripts only from the app itself; network only through Tauri's IPC. | `tauri.conf.json` → `app.security` |

The app folder's name comes from the bundle identifier (`app.margin.desktop`). **Choose the final identifier before the first public release.** Changing it later moves where everyone's library lives.

macOS 13.3 or later is required. The engine uses regular-expression lookbehind, which WebKit has supported only since Safari 16.4.

## Develop

You need [Rust](https://rustup.rs) 1.90 or later, plus Xcode Command Line Tools on Mac or the [Microsoft C++ Build Tools and WebView2](https://tauri.app/start/prerequisites/) on Windows.

```bash
pnpm install
pnpm --filter @margin/desktop tauri dev
```

The window loads the Vite dev server on port 1420 and reloads as you edit `src/`.

## Build an installer

```bash
pnpm --filter @margin/desktop tauri build
```

Installers land in `src-tauri/target/release/bundle/`: `macos/Margin.app` and `dmg/Margin_<version>_<arch>.dmg` on Mac, or an `nsis/…-setup.exe` and an `msi/…​.msi` on Windows. The first build compiles every Rust dependency and takes a few minutes. Later builds take about a minute.

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

1. Generate an update key: `pnpm --filter @margin/desktop tauri signer generate -w ~/.tauri/margin.key`. Keep the private key and its password safe. **Losing them means existing installs can never update again.**
2. Add the updater plugin (`pnpm --filter @margin/desktop tauri add updater`). Then:
   - put the public key and an update URL in `tauri.conf.json` under `plugins.updater`;
   - set `bundle.createUpdaterArtifacts` to `true`.
3. Add `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as secrets, and uncomment them in the workflow. Set `uploadUpdaterJson: true` on the tauri-action step.

That step publishes a `latest.json` with each GitHub release, and the app can check it. Later, Margin Cloud can serve the same file.

## Before the first public release

- [ ] Final product name and bundle identifier
- [ ] Mac signing and notarization; Windows signing
- [ ] Update keys, and the updater turned on
- [ ] `LICENSE`, after the legal review
