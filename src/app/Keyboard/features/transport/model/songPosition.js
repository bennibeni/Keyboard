import { beatsPerBarQuarter, parseTimeSignatureStr } from "../../../shared/music/timeSignature";
import { resolveTimeSignatureAt } from "../../playback-engine/model/resolveTimeSignatureAt";

// Ultimo evento che inizia entro t (ricerca binaria: gli eventi sono ordinati per tBeat).
export function findEventAt(events, t) {
  if (!Array.isArray(events) || events.length === 0) return null;
  let lo = 0;
  let hi = events.length - 1;
  if (Number(events[0]?.tBeat) > t + 1e-6) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (Number(events[mid]?.tBeat) <= t + 1e-6) lo = mid;
    else hi = mid - 1;
  }
  return events[lo];
}

// Battuta e tempo (1-based) all'istante t, in quarti dall'inizio del brano eseguito.
// Usa la battuta scritta (event.meta.bar / beatInBar, dai brani MusicXML) quando c'è;
// altrimenti (MIDI, brani senza tabella `bars`) la ricava dal metro.
// Il "tempo" conta le unità del metro: quarti in 4/4, crome in 6/8.
export function songPositionAt(events, time, t) {
  const tb = Math.max(0, Number(t) || 0);
  const ts = parseTimeSignatureStr(resolveTimeSignatureAt(tb, time));
  const unit = 4 / ts.den;
  const ev = findEventAt(events, tb);
  const bar = Number(ev?.meta?.bar);
  const beatInBar = Number(ev?.meta?.beatInBar);
  if (ev && Number.isFinite(bar) && Number.isFinite(beatInBar)) {
    const inBar = beatInBar + (tb - Number(ev.tBeat));
    return { bar, beat: Math.floor(inBar / unit + 1e-6) + 1 };
  }
  const bpb = beatsPerBarQuarter(ts.num, ts.den);
  const index = Math.floor(tb / bpb + 1e-6);
  return { bar: index + 1, beat: Math.floor((tb - index * bpb) / unit + 1e-6) + 1 };
}
