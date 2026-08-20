export function clamp(x, a, b) {
  const n = Number(x);
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}

// Converts a bpm value into milliseconds-per-beat, clamped to a sane bpm
// range. Both runScheduledPlayback.js and createMetronomeBeatLoop.js
// independently repeated this exact expression (60000 / clamp(bpm, 1,
// 300)) at every tempo recalibration point - extracted here as the
// single source of truth so the two schedulers can't drift apart on
// what "a valid bpm" means. Not the same thing as beatsToMs below (which
// takes an arbitrary beat count and doesn't clamp bpm) - this is
// specifically "how long is ONE beat", the quantity both schedulers'
// origin/wall-clock timing models are built on.
export function msPerBeat(bpm, min = 1, max = 300) {
  return 60000 / clamp(bpm, min, max);
}

export function beatsToMs(beats, bpm) {
  return (60000 / (Number(bpm) || 120)) * (Number(beats) || 0);
}

export function semitoneRate(delta) {
  return Math.pow(2, delta / 12);
}

export function modPos(x, m) {
  if (!Number.isFinite(x) || !Number.isFinite(m) || m <= 0) return 0;
  const r = x % m;
  return r < 0 ? r + m : r;
}

export function quantize(x, step) {
  const s = Number(step) || 1;
  if (!Number.isFinite(x) || s <= 0) return x;
  return Math.round(x / s) * s;
}

export function isClose(a, b, eps = 1e-6) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

export function fmtBeat(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

export function clampNum(x, a, b, fallback) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : fallback;
}
