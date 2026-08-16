"use client";

import { createSampleEngine } from "@app/audio-engine";
import { SETTINGS } from "../../../settings";

// Generic sample-based engine, shared by whatever song is currently
// playing (see hooks/usePlaySong.js) - nothing here is specific to any
// one piece. maxVoices=32 gives headroom for real chords up to 7
// simultaneous notes (Canon in D's final chord) plus overlap between
// events; sampleBasePath/ext point at where the .wav files actually live
// in the real app (public/samples/piano/*.wav by default, same convention
// R02's piano-engine uses).
let _engine = null;
export function getPianoEngine() {
  if (!_engine) {
    _engine = createSampleEngine({
      sampleBasePath: SETTINGS.sampleBasePath.value,
      ext: SETTINGS.sampleExt.value,
      maxVoices: SETTINGS.maxVoices.value,
    });
  }
  return _engine;
}

export default getPianoEngine;
