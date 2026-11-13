// @clearpen/ui — Clearpen's interface. Mount `<App backend={…} />` with a Backend
// for the platform, and import '@clearpen/ui/styles.css' once.

import './fonts.ts';

export { App } from './app.tsx';
export type {
  AI,
  AppEvent,
  Backend,
  EventInput,
  EventsService,
  FetchedPage,
  FileEntry,
  FilePlace,
  FilePlaces,
  FilesService,
  FolderSize,
  LargeFiles,
  ModelChoice,
  SecretName,
  Secrets,
  StoredImage,
  TerminalOpenOptions,
  TerminalService,
  TerminalSession,
  WebAppBounds,
  WebAppsService,
} from './backend.ts';
export { localAI } from './local-ai.ts';
export { pageFetcher } from './sources.ts';
