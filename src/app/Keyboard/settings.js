"use client";

// Single source of truth for every configurable parameter currently used
// by R04's playback stack (song-agnostic - see
// features/playback-engine/hooks/usePlaySong.js). Consumed two ways:
//   1. features/settings/components/SettingsPanel.js displays it (read-only)
//   2. Page.js, usePlaySong.js, and pianoEngine.js import values from
//      here instead of declaring their own local constants
//
// Each entry has `value` (what's actually used) plus display metadata
// (label/unit/description) so the panel can render generically without a
// hardcoded row per setting.

export const SETTINGS = {
  bpm: {
    value: 100,
    label: "BPM (valore iniziale)",
    unit: "",
    description:
      "Seme iniziale, sovrascritto dal tempo autentico del brano appena caricato (seq.time.bpm) — da lì in poi lo slider Tempo è quello che conta, finché non cambi brano.",
  },
  bpmMin: {
    value: 30,
    label: "BPM minimo",
    unit: "",
    description: "Estremo inferiore dello slider Tempo.",
  },
  bpmMax: {
    value: 260,
    label: "BPM massimo",
    unit: "",
    description: "Estremo superiore dello slider Tempo.",
  },
  sustainMs: {
    value: 1200,
    label: "Sustain",
    unit: "ms",
    description:
      "Per quanto suona ogni nota, indipendente dalla durata scritta nella trascrizione.",
  },
  minNoteMs: {
    value: 150,
    label: "Sustain minimo",
    unit: "ms",
    description: "Limite di sicurezza inferiore applicato a sustainMs.",
  },
  maxNoteMs: {
    value: 20000,
    label: "Sustain massimo",
    unit: "ms",
    description: "Limite di sicurezza superiore applicato a sustainMs.",
  },
  chordHeadroom: {
    value: 0.95,
    label: "Chord headroom",
    unit: "",
    description:
      "Bilanciamento accordi: ogni nota scala per headroom / \u221a(numero note nell'accordo).",
  },
  bassScale: {
    value: 0.85,
    label: "Bass scale",
    unit: "",
    min: 0,
    max: 1.5,
    step: 0.01,
    description: "Volume relativo della nota più bassa di ogni accordo (il basso).",
  },
  rhScale: {
    value: 1.0,
    label: "RH scale",
    unit: "",
    min: 0,
    max: 1.5,
    step: 0.01,
    description: "Volume relativo delle note non-basso dell'accordo.",
  },
  accentsEnabled: {
    value: true,
    label: "Accenti",
    unit: "",
    description:
      "Se attivo, i beat forti/medi/deboli della battuta suonano con velocity e durata diverse (vedi accentAmount).",
  },
  accentAmount: {
    value: 0.5,
    label: "Accent amount",
    unit: "",
    description:
      "Quanto contrasto tra beat forti e deboli, da 0 (nessuno) a 0.5 (massimo).",
  },
  masterGain: {
    value: 1,
    label: "Master gain",
    unit: "",
    description: "Guadagno generale passato al motore audio.",
  },
  sampleBasePath: {
    value: "/samples/piano",
    label: "Sample path",
    unit: "",
    description: "Cartella dei campioni .wav usati da createSampleEngine.",
  },
  sampleExt: {
    value: "wav",
    label: "Sample extension",
    unit: "",
    description: "Estensione dei file campione.",
  },
  maxVoices: {
    value: 32,
    label: "Max voices",
    unit: "",
    description:
      "Numero massimo di voci simultanee prima del voice-stealing (vedi audio-engine/synthEngine.js e sampleEngine.js).",
  },
  metronomeOn: {
    value: false,
    label: "Metronome",
    unit: "",
    description:
      "Se attivo, un click segue il beat del brano corrente, accentato forte/medio/debole come le note.",
  },
  metroLevel: {
    value: 0.5,
    label: "Metro level",
    unit: "",
    description: "Volume del click del metronomo (0-1).",
  },
  loop: {
    value: false,
    label: "Loop",
    unit: "",
    description: "Se attivo, il brano ricomincia da capo alla fine invece di fermarsi.",
  },
};

export default SETTINGS;
