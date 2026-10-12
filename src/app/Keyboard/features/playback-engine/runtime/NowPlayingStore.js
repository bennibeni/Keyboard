"use client";

import { createPubSubStore } from "../../../shared/state/createPubSubStore";

// ---------------------------------------------------------------------------
// PATTERN: Observer (pub/sub) - consolidated onto createPubSubStore.js,
// the same shared utility MetronomeService.js already uses, instead of
// hand-rolling an equivalent listeners/snapshot implementation. Before
// this change, this class duplicated createPubSubStore's exact shape
// (a Set of listener functions + a plain snapshot object, notified on
// every write) with its own code - same pattern, two implementations.
//
// Public API (subscribe, getSnapshot, commitStep, reset) is unchanged -
// every consumer (useNowPlaying.js, usePlaySong.js, useMetronomeClick.js)
// keeps working exactly as before.
// ---------------------------------------------------------------------------
const EMPTY_FINGERS = Object.freeze({});

class NowPlayingStore {
  constructor() {
    this._store = createPubSubStore({ tBeat: 0, activeMidis: [], fingers: EMPTY_FINGERS });
    this.subscribe = this._store.subscribe;
    this.getSnapshot = this._store.getSnapshot;
  }

  // Called once per event from runScheduledPlayback's onStep - event-rate,
  // not frame-rate. This matches how R02's own FallingNotesPanel actually
  // updates in practice (via the runtime store's nowPlaying channel, also
  // only written from onStep/commitStep), not continuous interpolation
  // between events.
  // fingers: { [midi]: { finger: 1..5, hand: "RH" | "LH" | null } } per le
  // note dell'evento che hanno una diteggiatura nella partitura.
  commitStep({ tBeat, activeMidis, fingers = EMPTY_FINGERS }) {
    this._store.setSnapshot({
      tBeat: Number(tBeat) || 0,
      activeMidis: Array.isArray(activeMidis) ? activeMidis : [],
      fingers: fingers && typeof fingers === "object" ? fingers : EMPTY_FINGERS,
    });
  }

  reset() {
    this._store.setSnapshot({ tBeat: 0, activeMidis: [], fingers: EMPTY_FINGERS });
  }
}

let _instance = null;
export function getNowPlayingStore() {
  if (!_instance) _instance = new NowPlayingStore();
  return _instance;
}

export default getNowPlayingStore;
