"use client";

import { createSampleEngine, createSynthEngine } from "@app/audio-engine";
import { SETTINGS } from "../../../settings";

// Generic sample-based engine, shared by whatever song currently routes to
// "piano" (see model/resolveEngineRoute.js) - nothing here is specific to
// any one piece. maxVoices=32 gives headroom for real chords up to 7
// simultaneous notes plus overlap between events.
let _pianoEngine = null;
function getPianoEngineSingleton() {
  if (!_pianoEngine) {
    _pianoEngine = createSampleEngine({
      sampleBasePath: SETTINGS.sampleBasePath.value,
      ext: SETTINGS.sampleExt.value,
      maxVoices: SETTINGS.maxVoices.value,
    });
  }
  return _pianoEngine;
}

// One synth instance PER WAVEFORM, not per song - two songs routed to the
// same waveform (e.g. two square-wave organ pieces) share one engine
// instance instead of each getting a fresh one, same singleton-for-the-
// app-lifetime pattern as the piano engine above.
const _synthEngines = new Map();
function getSynthEngineSingleton(waveform) {
  const key = waveform || "sawtooth";
  if (!_synthEngines.has(key)) {
    _synthEngines.set(
      key,
      createSynthEngine({ waveform: key, maxVoices: SETTINGS.maxVoices.value }),
    );
  }
  return _synthEngines.get(key);
}

// Back-compat named export - existing callers that just want "the piano
// engine" (e.g. anything not routing-aware) keep working unchanged.
export function getPianoEngine() {
  return getPianoEngineSingleton();
}

// route: result of resolveEngineRoute() - { engine: "piano" | "synth", waveform }.
// Returns an engine implementing the same {unlock, now, setMasterGain,
// playNote, stopNote, stopAll, dispose} shape either way - createSynthEngine
// just doesn't have `preload` (sample-only concept), so callers must guard
// that call (see usePlaySong.js's `typeof engine.preload === "function"`).
export function getEngineForRoute(route) {
  if (route?.engine === "synth") return getSynthEngineSingleton(route.waveform);
  return getPianoEngineSingleton();
}

export default getPianoEngine;
