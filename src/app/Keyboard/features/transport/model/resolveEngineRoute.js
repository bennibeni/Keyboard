"use client";

// Route decision: which audio engine + which waveform to use for a given
// song. Reintroduces R02's resolvePlaybackRoute.js (title/metadata hint
// matching -> piano samples vs synth) - @app/audio-engine's README
// explicitly says the shared package does NOT do this routing/fallback
// ("Nessun routing/fallback automatico tra sample e synth... la gestione
// resta compito del chiamante"), so it lives here, at the R06 route level,
// not inside the package.
//
// Two independent ways a song ends up on synth instead of piano:
//   1. AUTOMATIC: title/metadata text matches a hint keyword (moog, synth,
//      organ, lead, portamento, glide) - same word list R02 used.
//   2. MANUAL OVERRIDE (ENGINE_OVERRIDES below): the song's catalog id is
//      listed explicitly, regardless of what its metadata says. Works in
//      BOTH directions - force a hint-less song onto synth, or force a
//      hint-matched song back onto piano - so routing isn't only ever
//      "songs that obviously need it".
//
// routingEnabled=false bypasses both mechanisms - every song plays piano
// samples, full stop. This is the app-wide kill switch (see
// SETTINGS.engineRoutingEnabled), for A/B'ing "is the synth actually
// better here" without editing this file.

const HINT_KEYWORDS = [
  "moog",
  "synth",
  "lead",
  "organ",
  "portamento",
  "glide",
  "vintage moog",
  "lead-expressive",
];

// songId -> { engine: "synth", waveform, presetLabel? } | { engine: "piano" }
// `presetLabel` is display-only (e.g. for a future diagnostics/UI readout) -
// createSynthEngine itself only understands `waveform`, it has no named-
// preset concept (see audio-engine/README.md's "Cosa NON fa" section).
// Deliberately NOT re-adding fake presets to the shared package - just
// picking a waveform per song at this routing layer instead.
export const ENGINE_OVERRIDES = {
  "lucky-man-vintage-moog-pro": {
    engine: "synth",
    waveform: "sawtooth",
    presetLabel: "vintage-moog",
  },
  "highway-star": {
    engine: "synth",
    waveform: "square",
    presetLabel: "rock-organ",
  },
};

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function collectRouteHintText(seq) {
  const parts = Array.isArray(seq?.meta?.parts) ? seq.meta.parts : [];
  return [
    seq?.meta?.title,
    seq?.meta?.source?.family,
    seq?.meta?.source?.format,
    seq?.meta?.source?.file,
    seq?.meta?.instrument?.name,
    seq?.meta?.instrument?.family,
    ...parts.map((p) => p?.name).filter(Boolean),
  ]
    .filter(Boolean)
    .join(" ");
}

function hintMatchesSynth(seq) {
  const text = normalizeText(collectRouteHintText(seq));
  if (!text) return false;
  return HINT_KEYWORDS.some((kw) => text.includes(kw));
}

// songId: SONG_CATALOG id (Page.js's `selectedId`) - needed for
// ENGINE_OVERRIDES lookup since the canonical seq itself doesn't carry the
// catalog id. routingEnabled: SETTINGS.engineRoutingEnabled.value.
export function resolveEngineRoute(seq, { songId = null, routingEnabled = true } = {}) {
  if (!routingEnabled) {
    return {
      engine: "piano",
      waveform: null,
      reason: "Routing disabilitato - piano samples per tutti i brani.",
    };
  }

  const override = songId != null ? ENGINE_OVERRIDES[songId] : null;
  if (override) {
    return {
      engine: override.engine,
      waveform: override.waveform ?? null,
      reason: `Override esplicito per "${songId}"${
        override.presetLabel ? ` (${override.presetLabel})` : ""
      }.`,
    };
  }

  if (hintMatchesSynth(seq)) {
    return {
      engine: "synth",
      waveform: "sawtooth",
      reason: "Metadati del brano suggeriscono un timbro sintetico/organo.",
    };
  }

  return {
    engine: "piano",
    waveform: null,
    reason: "Nessun hint sintetico - piano samples.",
  };
}

export default resolveEngineRoute;
