// Note che suonano (comprese quelle tenute) a un dato istante, per i pentagrammi compatti.
// Calcolo puro: nessuna dipendenza da React o dall'audio.

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const IT = { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };
// Grafia di ripiego (con diesis) quando il brano non ha `spelling`
const SHARP_SPELLING = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// "Eb4" / "F#3" / "C4" -> { letter, alter, octave }, solo se corrisponde davvero al MIDI
// (dopo una trasposizione la grafia salvata nel brano non vale più).
function parseSpelling(spelling, midi) {
  const m = /^([A-G])(#{1,2}|b{1,2})?(-?\d+)$/.exec(String(spelling || ""));
  if (!m) return null;
  const alter = m[2] ? (m[2][0] === "#" ? m[2].length : -m[2].length) : 0;
  const octave = Number(m[3]);
  if ((octave + 1) * 12 + LETTER_PC[m[1]] + alter !== midi) return null;
  return { letter: m[1], alter, octave };
}

export function spellMidi(midi, spelling) {
  const parsed = parseSpelling(spelling, midi);
  if (parsed) return parsed;
  const name = SHARP_SPELLING[((midi % 12) + 12) % 12];
  return { letter: name[0], alter: name.length > 1 ? 1 : 0, octave: Math.floor(midi / 12) - 1 };
}

// Indice diatonico assoluto (Do0 = 0): un passo = una riga o uno spazio del pentagramma.
export function diatonicStep({ letter, octave }) {
  return octave * 7 + LETTERS.indexOf(letter);
}

export function noteLabel({ letter, alter }, octave) {
  const acc = alter > 0 ? "♯".repeat(alter) : alter < 0 ? "♭".repeat(-alter) : "";
  return `${IT[letter]}${acc}${octave}`;
}

// Timeline per nota con la grafia: [{ midi, start, end, spelling }]
export function buildSpelledTimeline(events) {
  const out = [];
  for (const event of Array.isArray(events) ? events : []) {
    const t0 = Number(event?.tBeat ?? event?.t ?? 0);
    const evDur = Number(event?.durBeat ?? 0);
    for (const note of Array.isArray(event?.notes) ? event.notes : []) {
      const midi = Number(note?.midi);
      if (!Number.isFinite(midi)) continue;
      const start = t0 + Number(note?.offsetBeat ?? 0);
      const dur = Number(note?.durBeat ?? evDur);
      out.push({ midi, start, end: start + (Number.isFinite(dur) ? dur : 0), spelling: note?.meta?.spelling });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// Note attive all'istante t, una per altezza, ordinate dal basso: [{ midi, spelling }]
export function activeNotesAt(timeline, t) {
  const eps = 1e-6;
  const byMidi = new Map();
  for (const n of timeline) {
    if (n.start > t + eps) break;
    if (n.end > t + eps && !byMidi.has(n.midi)) byMidi.set(n.midi, n);
  }
  return [...byMidi.values()].sort((a, b) => a.midi - b.midi);
}

// Divisione per registro, come in R25: basso sotto il Do4, violino dal Do4 incluso.
export const SPLIT_MIDI = 60;
