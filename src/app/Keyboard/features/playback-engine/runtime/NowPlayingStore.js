"use client";

class NowPlayingStore {
  constructor() {
    this.listeners = new Set();
    this._snapshot = { tBeat: 0, activeMidis: [] };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getSnapshot() {
    return this._snapshot;
  }

  // Called once per event from runScheduledPlayback's onStep - event-rate,
  // not frame-rate. This matches how R02's own FallingNotesPanel actually
  // updates in practice (via the runtime store's nowPlaying channel, also
  // only written from onStep/commitStep), not continuous interpolation
  // between events.
  commitStep({ tBeat, activeMidis }) {
    this._snapshot = {
      tBeat: Number(tBeat) || 0,
      activeMidis: Array.isArray(activeMidis) ? activeMidis : [],
    };
    this.listeners.forEach((l) => l());
  }

  reset() {
    this._snapshot = { tBeat: 0, activeMidis: [] };
    this.listeners.forEach((l) => l());
  }
}

let _instance = null;
export function getNowPlayingStore() {
  if (!_instance) _instance = new NowPlayingStore();
  return _instance;
}

export default getNowPlayingStore;
