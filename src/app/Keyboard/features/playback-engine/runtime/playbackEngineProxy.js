"use client";

import { getEngineForRoute } from "./pianoEngine";
import { SETTINGS } from "../../../settings";

// ---------------------------------------------------------------------------
// PATTERN: Proxy (with defaulting) - same shape as
// features/keyboard/runtime/keyboardEngineProxy.js, extended here to the
// playback engine used by usePlaySong.js.
//
// Real subject: whatever getEngineForRoute(route) returns - either the
// piano sample engine or a per-waveform synth engine singleton (see
// pianoEngine.js, which already plays an Adapter role by giving both the
// same {unlock, now, setMasterGain, playNote, stopNote, stopAll, dispose}
// shape). One gap survives that unification: only the sample engine has
// `preload` (a synth has nothing to fetch/decode) - before this Proxy,
// usePlaySong.js had to feature-detect that itself
// (`typeof engine.preload === "function"`), and separately imported
// SETTINGS.masterGain just to forward it into setMasterGain().
//
// Proxy: this module. It:
//   1. Forwards every call through to the real engine unchanged (a genuine
//      proxy, not a reimplementation).
//   2. Normalizes the preload() gap: a synth route gets a no-op preload
//      instead of the caller needing to feature-detect - callers can
//      always `await engine.preload(midis)` safely.
//   3. Defaults setMasterGain's gain value from SETTINGS.masterGain when
//      the caller doesn't pass one explicitly, so usePlaySong.js no longer
//      needs to know that setting exists just to relay it.
//
// The DI escape hatch in usePlaySong.js (an explicit `engine` override for
// tests/alternate engines) deliberately bypasses this Proxy entirely - a
// test-supplied engine is used exactly as given, no defaulting injected.
// ---------------------------------------------------------------------------
export function getPlaybackEngineProxy(route) {
  const engine = getEngineForRoute(route);

  return {
    async unlock() {
      return engine.unlock();
    },

    now() {
      return engine.now();
    },

    // gain omitted -> defaults from SETTINGS.masterGain, same defaulting
    // role keyboardEngineProxy plays for keyVelocity/keyReleaseMs.
    setMasterGain(gain) {
      engine.setMasterGain(gain ?? SETTINGS.masterGain.value);
    },

    // Always resolves to a function from the caller's point of view - a
    // synth-routed engine simply has nothing to preload.
    async preload(midis) {
      if (typeof engine.preload === "function") {
        return engine.preload(midis);
      }
      return [];
    },

    async playNote(midi, options = {}) {
      return engine.playNote(midi, options);
    },

    stopNote(voiceId, releaseMs) {
      engine.stopNote(voiceId, releaseMs);
    },

    stopAll(releaseMs) {
      engine.stopAll(releaseMs);
    },

    dispose() {
      engine.dispose();
    },
  };
}

export default getPlaybackEngineProxy;
