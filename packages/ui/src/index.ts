// @clearpen/ui — Clearpen's interface. Mount `<App backend={…} />` with a Backend
// for the platform, and import '@clearpen/ui/styles.css' once.

import './fonts.ts';

export { App } from './app.tsx';
export type { AI, Backend, ModelChoice, StoredImage } from './backend.ts';
export { localAI } from './local-ai.ts';
