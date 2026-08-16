import { clamp } from "../../../shared/music/math";

export function clamp01(x) {
  const n = Number(x);
  return Number.isFinite(n) ? clamp(n, 0, 1) : 0;
}

export function knob01ToDb(level01, minDb, maxDb) {
  return minDb + clamp01(level01) * (maxDb - minDb);
}

export function dbToGain(db) {
  const n = Number(db);
  return Number.isFinite(n) ? Math.pow(10, n / 20) : 0;
}

export function knob01ToGain(level01, minDb, maxDb) {
  return dbToGain(knob01ToDb(level01, minDb, maxDb));
}
