const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

function midiPc(midi) {
  return ((Math.round(Number(midi)) % 12) + 12) % 12;
}

// Canonical mod12 for pitch-class arithmetic (chord detection needs this
// for plain integers, not just MIDI note numbers - e.g. root - bass).
export function mod12(x) {
  const n = Math.round(Number(x));
  if (!Number.isFinite(n)) return 0;
  return ((n % 12) + 12) % 12;
}

const NOTE_NAMES_FLAT = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

// Sharp/flat pitch-class spelling, used by chord symbol rendering
// (chordDetect.js). NOTE_NAMES above stays the single source of truth for
// sharp spelling; these just index into it (or its flat counterpart).
export function pcToNameSharp(pc) {
  if (!Number.isFinite(Number(pc))) return "—";
  return NOTE_NAMES[mod12(pc)];
}

export function pcToNameFlat(pc) {
  if (!Number.isFinite(Number(pc))) return "—";
  return NOTE_NAMES_FLAT[mod12(pc)];
}

export function isBlackMidi(midi) {
  return BLACK_PCS.has(midiPc(midi));
}

export function midiToNoteName(midi) {
  const n = Math.round(Number(midi));
  if (!Number.isFinite(n)) return "—";
  const octave = Math.floor(n / 12) - 1;
  return `${NOTE_NAMES[midiPc(n)]}${octave}`;
}

/**
 * Deduplicate, round, and sort an array or Set of MIDI values.
 * Accepts both Array and Set inputs; non-finite values are dropped.
 */
/**
 * Unique, sorted pitch classes (0..11) present in a list of MIDI numbers.
 * Used by chordDetect.js's root search.
 */
export function pcsFromMidis(midis) {
  const xs = Array.isArray(midis) ? midis : [];
  const pcs = new Set();
  for (const m of xs) {
    if (!Number.isFinite(Number(m))) continue;
    pcs.add(midiPc(m));
  }
  return Array.from(pcs).sort((a, b) => a - b);
}

export function normalizeMidis(raw) {
  const arr = raw instanceof Set ? [...raw] : Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();

  for (const value of arr) {
    const midi = Math.round(Number(value));
    if (!Number.isFinite(midi) || seen.has(midi)) continue;
    seen.add(midi);
    out.push(midi);
  }

  out.sort((a, b) => a - b);
  return out;
}
