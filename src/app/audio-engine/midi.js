export function midiToFrequency(midiNote) {
  const n = Number(midiNote);
  if (!Number.isFinite(n)) return 0;
  return 440 * Math.pow(2, (n - 69) / 12);
}

// Playback-rate multiplier to pitch-shift a sample recorded at
// `sampleMidi` up/down to sound like `targetMidi` (delta = targetMidi -
// sampleMidi). Used by sampleEngine.js when no exact-pitch sample exists.
export function semitoneRate(semitoneDelta) {
  const n = Number(semitoneDelta);
  if (!Number.isFinite(n)) return 1;
  return Math.pow(2, n / 12);
}
