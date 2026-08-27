// src/shared/music/analyzeSongChords.js
//
// OFFLINE chord analysis for a full song, read ahead of time.
// -------------------------------------------------------------------------
// This is a deliberately different approach from useDetectedChord.js (the
// live, real-time detector used while actually playing the keyboard).
// Live detection has to guess, note by note, whether something newly
// struck is "still part of the current chord" or "the start of the next
// one" - with only a small window into the past and none into the
// future. That constraint is the root cause of most of the residual
// noise measured in useDetectedChord.js (transitional blends between
// chords, ambiguous relative-chord readings with no way to disambiguate).
//
// Offline analysis has no such constraint: the entire note timeline is
// already known. This module exploits that in three ways a live detector
// fundamentally cannot:
//
// 1) BAR-ALIGNED WINDOWS instead of note-by-note buffering. Chords in
//    tonal music are overwhelmingly aligned to the bar (or a fixed
//    subdivision of it) - so instead of asking "what does the buffer
//    look like right now", this asks "what notes sound during this bar",
//    which is a far more stable, well-defined question.
//
// 2) DURATION-WEIGHTED pitch classes instead of a simple present/absent
//    buffer. A note that sounds for 3 of a bar's 4 beats should count
//    far more than a 16th-note passing tone that happens to fall in the
//    same bar - live detection has no clean way to express that; offline
//    analysis can just measure it directly.
//
// 3) STAFF/HAND AWARE filtering when the source data provides it (as the
//    canonical exported formats from this project's song pipeline do:
//    each note carries `staff`/`hand`). Instead of guessing a melody
//    register cutoff, real harmony-hand notes (staff 2 / "LH") can be
//    weighted far more heavily than the melody hand - directly avoiding
//    the "melody note briefly forms a coincidental extended chord"
//    failure mode that motivated melodyCutoffMidi in the live detector.
//
// This module does NOT replace useDetectedChord.js - that's still what
// should run while someone is actually playing live. This is for
// pre-analyzing a song's own chord chart once, ahead of time (e.g. to
// show a chord chart alongside playback), where the whole timeline is
// available up front.

import { detectChordFromMidis } from "./chordDetect";

/**
 * normalizeSongEvents(song) -> { bpm, events: [{ tBeat, durBeat, bar, notes: [{midi, tBeat, durBeat, staff}] }] }
 * -------------------------------------------------------------------------
 * Adapts the (at least) two schema variants seen in this project's
 * exported song files:
 *  - "music-seq@1"       : event.t / event.dur,      note.dur
 *  - "song-canonical@1"  : event.tBeat / event.durBeat, note.durBeat
 * Both nest notes under event.notes[] with a `midi` and a `staff` field;
 * this normalizer flattens everything to a single list of individual
 * note spans in beats, independent of which schema produced them.
 */
export function normalizeSongEvents(song) {
  const bpm =
    song?.meta?.time?.bpm ??
    song?.meta?.tempo?.bpm ??
    song?.time?.bpm ??
    120;

  const rawEvents = song?.events || [];
  const notes = [];

  for (const ev of rawEvents) {
    const evStart = ev.tBeat ?? ev.t ?? 0;
    const evDur = ev.durBeat ?? ev.dur ?? 0;
    for (const n of ev.notes || []) {
      if (!Number.isFinite(Number(n.midi))) continue;
      // A note's own durBeat/dur (when present) is authoritative over the
      // parent event's duration - some schemas put per-note duration
      // (ties, independent note lengths within a shared attack instant).
      const noteDur = n.durBeat ?? n.dur ?? evDur;
      const noteStart = evStart + (n.offsetBeat ?? 0);
      notes.push({
        midi: Math.trunc(Number(n.midi)),
        startBeat: noteStart,
        endBeat: noteStart + Math.max(0, Number(noteDur) || 0),
        staff: n.staff ?? null,
        hand: n.hand ?? null,
      });
    }
  }

  notes.sort((a, b) => a.startBeat - b.startBeat);
  return { bpm, notes };
}

/**
 * parseBeatsPerBar(timeSignature) -> number of beats per bar
 * -------------------------------------------------------------------------
 * "4/4" -> 4, "3/4" -> 3, "6/8" -> 3 (compound time: 6 eighth-notes group
 * as 2 dotted-quarter beats conventionally, but for chord-window sizing
 * purposes what matters is the numerator's note-grouping in beat units
 * matching this schema's `beatInBar`/`tBeat` convention, which is always
 * expressed as quarter-note-equivalent beats regardless of the written
 * denominator in every source file inspected - so this simply returns
 * the numerator, which matches "6/4" (Lucky Man's solo) and "4/4"/"3/4"
 * alike). Falls back to 4 if unparseable.
 */
function parseBeatsPerBar(timeSignature) {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(timeSignature || "").trim());
  if (!m) return 4;
  const beats = Number(m[1]);
  return Number.isFinite(beats) && beats > 0 ? beats : 4;
}

/**
 * detectWindowsPerBar(notes, opts) -> best windowsPerBar among candidates
 * -------------------------------------------------------------------------
 * Different songs change harmony at different rates within a bar - one
 * chord per bar (Passacaglia), two per bar (Canon in D's broken-chord
 * accompaniment), sometimes more. There's no reliable way to know this
 * ahead of time from metadata alone, so this tries each candidate
 * subdivision, runs the full per-bar analysis at that granularity, and
 * scores each by the fraction of windows that came back "strong" (a
 * confident match) and non-empty. The best-scoring candidate wins.
 *
 * Ties are broken toward FEWER windows per bar (coarser subdivision):
 * a finer subdivision can artificially inflate the strong-fraction score
 * by isolating single sustained notes into their own tiny window (easy
 * to match, but not meaningfully "a chord") - preferring the coarsest
 * candidate that still scores well avoids that bias.
 */
function detectWindowsPerBar(notes, opts) {
  const candidates = opts.windowsPerBarCandidates ?? [1, 2, 4];
  const beatsPerBar = opts.beatsPerBar ?? 4;

  let best = candidates[0];
  let bestScore = -1;

  for (const candidate of candidates) {
    const windows = buildBarWindows(notes, { ...opts, beatsPerBar, windowsPerBar: candidate });
    if (!windows.length) continue;

    let strongCount = 0;
    for (const window of windows) {
      const pcWeights = pitchClassWeightsInWindow(notes, window, opts);
      const totalWeight = [...pcWeights.values()].reduce((s, e) => s + e.weight, 0);
      if (!totalWeight) continue;
      const minPcWeightFraction = opts.minPcWeightFraction ?? 0.12;
      const qualifying = [...pcWeights.entries()].filter(
        ([, e]) => e.weight / totalWeight >= minPcWeightFraction,
      );
      if (!qualifying.length) continue;
      const representativeMidis = qualifying
        .map(([, e]) => e.bestMidi)
        .sort((a, b) => a - b);
      const detail = detectChordFromMidis(representativeMidis);
      if (detail.strong) strongCount++;
    }

    const score = strongCount / windows.length;
    // Strictly greater only - candidates are tried in ascending order, so
    // an equal score keeps the earlier (coarser) candidate, implementing
    // the tie-break toward fewer windows per bar described above.
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

/**
 * buildBarWindows(notes, opts) -> [{ bar, startBeat, endBeat }]
 * -------------------------------------------------------------------------
 * Derives one analysis window per bar (or per `beatsPerWindow` beats, if
 * the caller wants finer granularity than one chord per bar) purely from
 * each note's beat position and the resolved `beatsPerBar` - bar 1 is
 * anchored at beat 0, matching every source file inspected so far.
 * Deliberately does NOT rely on a source-provided bar/beatInBar field:
 * one library file (Take Five) has no such tagging at all, and deriving
 * bars this way works uniformly across every schema variant without a
 * fallback path.
 */
function buildBarWindows(notes, opts) {
  if (!notes.length) return [];

  const beatsPerBar = opts.beatsPerBar ?? 4;
  const windowsPerBar = opts.windowsPerBar ?? 1;
  const beatsPerWindow = beatsPerBar / windowsPerBar;

  const maxBeat = Math.max(...notes.map((n) => n.endBeat));
  const totalBars = Math.max(1, Math.ceil(maxBeat / beatsPerBar));

  const windows = [];
  for (let barIndex = 0; barIndex < totalBars; barIndex++) {
    const barStartBeat = barIndex * beatsPerBar;
    for (let w = 0; w < windowsPerBar; w++) {
      windows.push({
        bar: barIndex + 1,
        startBeat: barStartBeat + w * beatsPerWindow,
        endBeat: barStartBeat + (w + 1) * beatsPerWindow,
      });
    }
  }
  return windows;
}

/**
 * pitchClassWeightsInWindow(notes, window, opts) -> Map<pc, { weight, bestMidi }>
 * -------------------------------------------------------------------------
 * For every note overlapping this window, adds (overlap duration in
 * beats) * (staff weight) to that note's pitch class's running total.
 * `bestMidi` tracks the actual MIDI number of the highest-weighted
 * instance seen for that pitch class, so the final representative note
 * list preserves real octave/voicing information instead of guessing.
 */
function pitchClassWeightsInWindow(notes, window, opts) {
  const harmonyStaffWeight = opts.harmonyStaffWeight ?? 1.0;
  const melodyStaffWeight = opts.melodyStaffWeight ?? 0.15;
  // staff 2 / hand "LH" is this project's convention for the
  // bass/harmony hand; staff 1 / "RH" is melody. When staff info is
  // absent entirely, treat every note as harmony-weight (can't
  // distinguish, so don't discard anything).
  function staffWeight(note) {
    if (note.staff == null && note.hand == null) return harmonyStaffWeight;
    const isHarmonyHand =
      note.staff === 2 || note.hand === "LH" || note.hand === "lh";
    return isHarmonyHand ? harmonyStaffWeight : melodyStaffWeight;
  }

  const pcWeights = new Map(); // pc -> { weight, bestMidi, bestMidiWeight }

  for (const note of notes) {
    const overlapStart = Math.max(note.startBeat, window.startBeat);
    const overlapEnd = Math.min(note.endBeat, window.endBeat);
    const overlapBeats = overlapEnd - overlapStart;
    if (overlapBeats <= 0) continue;

    const weight = overlapBeats * staffWeight(note);
    const pc = ((note.midi % 12) + 12) % 12;

    const entry = pcWeights.get(pc) || { weight: 0, bestMidi: note.midi, bestMidiWeight: 0 };
    entry.weight += weight;
    if (weight > entry.bestMidiWeight) {
      entry.bestMidiWeight = weight;
      entry.bestMidi = note.midi;
    }
    pcWeights.set(pc, entry);
  }

  return pcWeights;
}

/**
 * analyzeSongChords(song, opts?) -> { bpm, beatsPerBar, windowsPerBar, timeline }
 * -------------------------------------------------------------------------
 * Produces one chord estimate per bar (by default) for the whole song,
 * using duration-weighted, staff-aware pitch-class content rather than
 * live note-buffer snapshots. `timeline` is the array of per-window
 * results: [{ bar, startBeat, endBeat, symbol, strong, pcs }].
 *
 * opts:
 * - windowsPerBar: chord estimates per bar. If omitted, auto-detected
 *   per song (see detectWindowsPerBar) - pass an explicit number to skip
 *   auto-detection and force a specific harmonic-rhythm granularity.
 * - windowsPerBarCandidates: candidates tried during auto-detection
 *   (default [1, 2, 4])
 * - beatsPerBar: beats per bar. If omitted, parsed from the song's own
 *   `time.timeSignature` (default 4/4 -> 4) - override only for a
 *   time-signature convention this schema doesn't already express
 *   correctly.
 * - minPcWeightFraction: a pitch class must account for at least this
 *   fraction of the window's total weight to be considered part of the
 *   chord, filtering out brief ornaments/passing tones (default 0.12)
 * - harmonyStaffWeight / melodyStaffWeight: relative weighting for
 *   staff 2/"LH" vs staff 1/"RH" notes (defaults 1.0 / 0.15). If a note
 *   has neither field, it's treated as harmony-weight.
 * - chordOpts: forwarded to detectChordFromMidis (e.g. { preferFlats: true })
 *
 * Returns one entry per window, always (even weak/uncertain ones, so the
 * caller can decide how to handle gaps rather than losing timing
 * information); `strong` indicates confidence exactly as in
 * chordDetect.js.
 */
export function analyzeSongChords(song, opts = {}) {
  const { bpm, notes } = normalizeSongEvents(song);

  const beatsPerBar =
    opts.beatsPerBar ?? parseBeatsPerBar(song?.time?.timeSignature);
  const resolvedOpts = { ...opts, beatsPerBar };

  const windowsPerBar =
    opts.windowsPerBar ?? detectWindowsPerBar(notes, resolvedOpts);

  const windows = buildBarWindows(notes, { ...resolvedOpts, windowsPerBar });
  const minPcWeightFraction = opts.minPcWeightFraction ?? 0.12;

  const results = [];
  for (const window of windows) {
    const pcWeights = pitchClassWeightsInWindow(notes, window, opts);
    const totalWeight = [...pcWeights.values()].reduce((s, e) => s + e.weight, 0);

    if (!totalWeight) {
      results.push({ ...window, symbol: "—", strong: false, pcs: [] });
      continue;
    }

    // Keep only pitch classes carrying a meaningful share of the
    // window's total weighted duration - drops fleeting ornaments while
    // keeping every note that's actually structural to the bar.
    const qualifying = [...pcWeights.entries()]
      .filter(([, e]) => e.weight / totalWeight >= minPcWeightFraction)
      .sort((a, b) => a[1].bestMidi - b[1].bestMidi);

    if (!qualifying.length) {
      results.push({ ...window, symbol: "—", strong: false, pcs: [] });
      continue;
    }

    const representativeMidis = qualifying.map(([, e]) => e.bestMidi).sort((a, b) => a - b);
    const detail = opts.chordOpts
      ? detectChordFromMidis(representativeMidis, opts.chordOpts)
      : detectChordFromMidis(representativeMidis);

    results.push({ ...window, symbol: detail.symbol, strong: detail.strong, pcs: detail.pcs });
  }

  return { bpm, beatsPerBar, windowsPerBar, timeline: results };
}

/**
 * mergeAdjacentSameChord(timeline) -> [{ bar/startBeat/endBeat merged, symbol, strong }]
 * -------------------------------------------------------------------------
 * Collapses consecutive windows sharing the same symbol into a single
 * span - useful when windowsPerBar > 1 and neighboring sub-bar windows
 * agree, or just to get a compact "chord changes here" list instead of
 * one entry per bar regardless of repeats.
 *
 * Takes the `timeline` array (i.e. `analyzeSongChords(song).timeline`,
 * not the whole return value).
 */
export function mergeAdjacentSameChord(timeline) {
  const merged = [];
  for (const entry of timeline) {
    const last = merged[merged.length - 1];
    if (last && last.symbol === entry.symbol) {
      last.endBeat = entry.endBeat;
      last.endBar = entry.bar;
    } else {
      merged.push({ ...entry, endBar: entry.bar });
    }
  }
  return merged;
}
