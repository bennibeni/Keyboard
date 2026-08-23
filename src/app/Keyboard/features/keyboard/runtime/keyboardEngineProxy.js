"use client";

import { getKeyboardInstrument } from "./keyboardInstrument";
import { SETTINGS } from "../../../settings";

// ---------------------------------------------------------------------------
// PATTERN: Proxy (with defaulting) - same shape as R15's
// PianoKeyboardProxy.js.
//
// Real subject: the createSampleEngine() instance returned by
// getKeyboardInstrument() (features/keyboard/runtime/keyboardInstrument.js).
// It only knows raw audio operations - playNote(midi, {velocity}),
// stopNote(voiceId, releaseMs), unlock(), preload(midis) - and has no
// opinion about what a good default velocity or release time is for a
// live-played key (as opposed to, say, a scheduled song note).
//
// Proxy: this module. Callers (usePlayableKeyboard.js) never touch
// getKeyboardInstrument() directly anymore - they go through
// getKeyboardEngineProxy(), which:
//   1. Forwards every call to the real engine (it doesn't reimplement
//      audio logic itself - a genuine proxy, not a reimplementation).
//   2. Injects defaults pulled from SETTINGS (keyVelocity, keyReleaseMs,
//      keyLateVoiceGraceMs, keyLateVoiceReleaseMs) so those numbers live
//      in one place instead of being hardcoded inline at every call site,
//      same role R15's PianoKeyboardProxy plays for sampleBasePath/ext/
//      stopAfterMs/volume.
//   3. Lets a specific call override any default via its own `overrides`
//      argument, without the caller needing to know the engine's raw
//      parameter names.
//
// Exactly like R15's version, this is a *hybrid*: for the audio calls it
// behaves like a textbook Proxy (same effective operation, defaults +
// pass-through); `noteOnLate`'s grace-period scheduling is closer to a
// small Adapter/convenience wrapper than a pure proxy operation, since it
// changes *when* the real call happens, not just *what defaults* it gets.
//
// engineOverride is the same DI escape hatch usePlaySong.js already
// exposes for the playback engine: optional (defaults to null), so every
// existing caller keeps getting the real getKeyboardInstrument() engine
// with zero changes, and only a caller that explicitly wants a different
// engine (a test double, an alternate input device) needs to know this
// parameter exists at all.
// ---------------------------------------------------------------------------
function createKeyboardEngineProxy(engineOverride = null) {
  const engine = engineOverride ?? getKeyboardInstrument();

  return {
    async unlock() {
      return engine.unlock();
    },

    async preload(midis) {
      return engine.preload(midis);
    },

    now() {
      return engine.now();
    },

    // Forwards to engine.playNote, defaulting velocity from SETTINGS
    // instead of requiring every caller to know/repeat the "live key
    // press" velocity.
    async noteOn(midi, overrides = {}) {
      await engine.unlock();
      const velocity = overrides.velocity ?? SETTINGS.keyVelocity.value;
      return engine.playNote(midi, { velocity });
    },

    // Forwards to engine.stopNote, defaulting the release time.
    noteOff(voiceId, overrides = {}) {
      if (voiceId == null) return;
      const releaseMs = overrides.releaseMs ?? SETTINGS.keyReleaseMs.value;
      engine.stopNote(voiceId, releaseMs);
    },

    // Handles the "key released while the sample was still decoding"
    // case (see usePlayableKeyboard.js's `entry.released` check): rather
    // than stop-in-the-same-instant (an audible chop), let it sound
    // briefly first. Grace/release durations both default from SETTINGS.
    noteOffLate(voiceId, overrides = {}) {
      if (voiceId == null) return;
      const graceMs = overrides.graceMs ?? SETTINGS.keyLateVoiceGraceMs.value;
      const releaseMs =
        overrides.releaseMs ?? SETTINGS.keyLateVoiceReleaseMs.value;
      window.setTimeout(() => engine.stopNote(voiceId, releaseMs), graceMs);
    },

    panic() {
      engine.stopAll(15);
    },
  };
}

let _proxyInstance = null;

// engineOverride (optional): when provided, returns a FRESH, non-cached
// proxy around that engine instead of touching the production singleton
// at all - same reasoning as usePlaySong.js's engine override. This keeps
// a test-supplied engine from ever being cached as `_proxyInstance` (which
// would leak a mock into every later call in production/other tests) and
// keeps the normal, no-argument call path exactly as fast/cached as
// before.
export function getKeyboardEngineProxy(engineOverride = null) {
  if (engineOverride) {
    return createKeyboardEngineProxy(engineOverride);
  }
  if (!_proxyInstance) _proxyInstance = createKeyboardEngineProxy();
  return _proxyInstance;
}

export default getKeyboardEngineProxy;
