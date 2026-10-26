import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Browsers fire "selectionchange" after the current task; happy-dom fires it
// at once, which re-enters CodeMirror in the middle of an update. Deliver it
// the way a browser does.
// (happy-dom re-dispatches an event internally, so each is deferred once.)
const proto = Object.getPrototypeOf(document) as Document;
const dispatch = proto.dispatchEvent;
const deferred = new WeakSet<Event>();
proto.dispatchEvent = function (this: Document, event: Event) {
  if (event.type !== 'selectionchange' || deferred.has(event)) return dispatch.call(this, event);
  deferred.add(event);
  setTimeout(() => dispatch.call(this, event));
  return true;
};

afterEach(() => {
  cleanup();
  window.location.hash = '';
});
