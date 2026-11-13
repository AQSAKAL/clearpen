import { useSyncExternalStore } from 'react';

// Portals stay mounted through their exit animation. Keep the native child out of
// the way until the last menu, sheet or dialog is actually gone.
const overlays =
  '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"], [data-slot="tooltip-content"]';
const covered = () => document.querySelector(overlays) !== null;
const neverCovered = () => false;
const noop = () => () => {};

function subscribe(update: () => void) {
  const observer = new MutationObserver(update);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

export function useWebAppOverlay(native: boolean) {
  return useSyncExternalStore(native ? subscribe : noop, native ? covered : neverCovered, neverCovered);
}
