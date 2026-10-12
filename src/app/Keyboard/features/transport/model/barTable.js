import { beatsPerBarQuarter, parseTimeSignatureStr } from "../../../shared/music/timeSignature";
import { resolveTimeSignatureAt } from "../../playback-engine/model/resolveTimeSignatureAt";

const MAX_BARS = 5000;

// Battute del brano eseguito, in quarti: [{ index, label, startBeat, endBeat }].
// Usa la tabella `bars` della partitura (battute scritte, ritornelli già
// espansi, etichetta = numero stampato sullo spartito); per i brani senza
// tabella (import MIDI) le ricava dal metro, dall'inizio fino all'ultima nota.
export function buildBarTable(song) {
  const bars = Array.isArray(song?.bars) ? song.bars : [];
  if (bars.length) {
    return bars.map((bar, index) => ({
      index,
      label: bar.label ?? String(index + 1),
      startBeat: bar.startBeat,
      endBeat: bar.startBeat + bar.lengthBeats,
    }));
  }

  const events = Array.isArray(song?.events) ? song.events : [];
  const total =
    Number(song?.meta?.stats?.durationBeats) ||
    events.reduce((max, ev) => Math.max(max, (Number(ev.tBeat) || 0) + (Number(ev.durBeat) || 0)), 0);
  const out = [];
  let t = 0;
  while (t < total - 1e-6 && out.length < MAX_BARS) {
    const ts = parseTimeSignatureStr(resolveTimeSignatureAt(t, song?.time));
    const length = beatsPerBarQuarter(ts.num, ts.den);
    if (!(length > 0)) break;
    out.push({ index: out.length, label: String(out.length + 1), startBeat: t, endBeat: t + length });
    t += length;
  }
  return out;
}

// Indice della battuta che contiene l'istante t (in quarti); 0 se prima dell'inizio.
export function barIndexAt(barTable, t) {
  if (!barTable?.length) return 0;
  let lo = 0;
  let hi = barTable.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (barTable[mid].startBeat <= t + 1e-6) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
