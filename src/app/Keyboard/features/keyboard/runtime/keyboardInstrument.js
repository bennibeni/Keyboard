"use client";

import { createSampleEngine } from "@app/audio-engine";
import { SETTINGS } from "../../../settings";

let instrument = null;

export function getKeyboardInstrument() {
  if (!instrument) {
    instrument = createSampleEngine({
      sampleBasePath: SETTINGS.sampleBasePath.value,
      ext: SETTINGS.sampleExt.value,
      maxVoices: SETTINGS.maxVoices.value,
      minMidi: 21,
      maxMidi: 108,
    });
    instrument.setMasterGain(SETTINGS.masterGain.value);
  }
  return instrument;
}

export default getKeyboardInstrument;
