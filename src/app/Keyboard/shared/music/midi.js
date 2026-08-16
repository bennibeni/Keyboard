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
