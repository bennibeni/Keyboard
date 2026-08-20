"use client";

// Minimal pub/sub snapshot store, compatible with React's
// useSyncExternalStore (subscribe(fn) + getSnapshot()). Deliberately has
// no domain knowledge - MetronomeService (and anything else that needs
// this shape later) owns what a "snapshot" actually contains; this just
// owns publishing it to subscribers.
export function createPubSubStore(initialSnapshot) {
  const listeners = new Set();
  let snapshot = initialSnapshot;

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function getSnapshot() {
    return snapshot;
  }

  // Replaces the snapshot wholesale and notifies subscribers. The caller
  // decides how to build the next snapshot (e.g. from its own instance
  // fields) - this store doesn't merge/patch on its own, to avoid
  // silently masking bugs where a caller forgets to include a field.
  function setSnapshot(next) {
    snapshot = next;
    listeners.forEach((fn) => fn());
  }

  return { subscribe, getSnapshot, setSnapshot };
}

export default createPubSubStore;
