import { clamp, isClose, modPos, quantize } from "../../../shared/music/math";
import {
  beatsPerBarQuarter,
  parseTimeSignatureStr,
} from "../../../shared/music/timeSignature";

export function accentKindFor(timeSignatureStr, posInBarQuarter) {
  const ts = parseTimeSignatureStr(timeSignatureStr);
  const bpb = beatsPerBarQuarter(ts.num, ts.den);
  const p = modPos(Number(posInBarQuarter) || 0, bpb);

  if (isClose(p, 0)) return "strong";

  // Compound meters: any signature grouped in 3s (num % 3 === 0, num > 3)
  // gets a "medium" accent at each group boundary except the first (which
  // is already "strong" from the isClose(p, 0) check above). This covers
  // 6/8, 9/8, 12/8 (the original case here) as well as 6/4, 9/4, 12/4 and
  // 6/16, 9/16, 12/16 - one rule instead of a parallel case per
  // denominator, since the underlying grouping logic doesn't actually
  // depend on which denominator is used, only the group SIZE does.
  //
  // group is the group size in quarter-note units: e.g. for 6/8, three
  // eighth notes = a dotted quarter = 1.5 quarter-units (matches what was
  // previously hardcoded here); for 6/4, three quarter notes = 3
  // quarter-units. Derived as 12/den rather than hand-picked per meter:
  // beatsPerBarQuarter(num, den) = num * (4/den), and a group is 1/3 of
  // that when there are num/3 groups, so group = num*(4/den) / (num/3)
  // = 12/den.
  if (ts.num % 3 === 0 && ts.num > 3) {
    const group = 12 / ts.den;
    const groups = ts.num / 3;
    for (let k = 1; k < groups; k++) {
      if (isClose(p, k * group)) return "medium";
    }
    return "weak";
  }
  if (ts.num === 4 && ts.den === 4) return isClose(p, 2) ? "medium" : "weak";
  if (ts.num === 3 && ts.den === 4) return isClose(p, 1) ? "medium" : "weak";
  if (ts.num === 2 && ts.den === 4) return "weak";
  if (ts.num === 5 && ts.den === 4) return isClose(p, 3) ? "medium" : "weak";
  if (ts.num === 7 && ts.den === 8) return isClose(p, 1) || isClose(p, 2) ? "medium" : "weak";
  return "weak";
}

export function accentParams(kind, amount) {
  const a = clamp(amount, 0, 0.5);
  const base = {
    strong: { velMul: 1.35, stopMul: 1.2, fadeMs: 0 },
    medium: { velMul: 1.0, stopMul: 1.0, fadeMs: 0 },
    weak: { velMul: 0.65, stopMul: 0.75, fadeMs: 40 },
  }[kind] ?? { velMul: 1.0, stopMul: 1.0, fadeMs: 0 };

  const mix = (x) => 1 + a * (x - 1);
  const avgVel = mix(1.35) * 0.25 + mix(1.0) * 0.25 + mix(0.65) * 0.5;

  return {
    velMul: mix(base.velMul),
    stopMul: mix(base.stopMul),
    fadeMs: base.fadeMs,
    velNorm: avgVel > 0 ? 1 / avgVel : 1,
  };
}

export function posInBarQuarter(tBeats, timeSignatureStr, quant = 0.5) {
  const ts = parseTimeSignatureStr(timeSignatureStr);
  const bpb = beatsPerBarQuarter(ts.num, ts.den);
  const p = modPos(Number(tBeats) || 0, bpb);
  return quantize(p, quant);
}

export function deriveAccentForEvent({
  tBeats,
  timeSignatureStr,
  accentAmount = 0.5,
  accentsEnabled = true,
  quant,
}) {
  const ts = parseTimeSignatureStr(timeSignatureStr);
  const q = quant ?? (ts.den === 8 ? 0.5 : 1.0);
  const posQ = posInBarQuarter(tBeats, ts.str, q);
  const kind = accentsEnabled ? accentKindFor(ts.str, posQ) : "medium";
  return { kind, ...accentParams(kind, accentAmount) };
}
