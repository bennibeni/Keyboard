import { clamp } from "./math";

export function parseTimeSignatureStr(ts) {
  const s = String(ts || "").trim();
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return { num: 4, den: 4, str: "4/4" };
  const num = clamp(Number(m[1]), 1, 32);
  const den = clamp(Number(m[2]), 1, 32);
  return { num, den, str: `${num}/${den}` };
}

export function beatsPerBarQuarter(num, den) {
  const d = Number(den);
  const n = Number(num);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 4;
  return Math.max(0.25, n * (4 / d));
}
