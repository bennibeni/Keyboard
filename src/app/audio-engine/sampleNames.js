const PC_TO_SHARP_NAME = [
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

function mod12(x) {
  return ((x % 12) + 12) % 12;
}

// e.g. 60 -> "C4", 61 -> "C#4"
export function midiToNoteName(midi) {
  const n = Number(midi);
  const pc = mod12(n);
  const oct = Math.floor(n / 12) - 1;
  return `${PC_TO_SHARP_NAME[pc]}${oct}`;
}

// e.g. 60 -> "C4", 61 -> "Cs4" - matches the file-naming convention used
// by existing sample sets (# is not a valid filename character).
export function midiToSampleKey(midi) {
  return midiToNoteName(midi).replace("#", "s");
}
