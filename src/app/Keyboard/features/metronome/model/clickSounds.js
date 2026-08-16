// Pitch/velocity per accent kind - strong beats ring out higher and
// louder, weak beats are quieter and lower, mirroring the same
// strong/medium/weak distinction already used for note accenting (see
// features/playback-engine/model/accents.js) instead of R03's simpler binary
// strong/not-strong split.
//
// Pulled out of MetronomeService so "what the click sounds like" (pure
// data) is separate from "how ticks get scheduled and published" (the
// service) - changing the click's timbre/pitch shouldn't require
// touching the pub/sub or audio-engine wiring at all.
const CLICK_BY_KIND = {
  strong: { midi: 84, velocity: 1, durationMs: 55 }, // C6
  medium: { midi: 79, velocity: 0.75, durationMs: 50 }, // G5
  weak: { midi: 72, velocity: 0.55, durationMs: 45 }, // C5
};

export function clickParamsForKind(kind) {
  return CLICK_BY_KIND[kind] || CLICK_BY_KIND.weak;
}

export default clickParamsForKind;
