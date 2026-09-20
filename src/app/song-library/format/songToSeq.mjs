// Adattatore da "song-canonical@2" al formato "grezzo" che
// normalizeMusicSeqToCanonical (song-canonical@1) già sa consumare.
//
// Serve a NON toccare il player: il resto dell'app continua a ricevere gli
// stessi eventi di prima ({ tBeat, durBeat, notes[] }), costruiti a partire
// dalla tabella di note del file v2.
//
// Regole:
//  - le note con stesso `t` e stesso `grp` (default 0) formano un evento;
//  - durBeat dell'evento = durata massima delle sue note;
//  - bar/beatInBar si ricavano dalla tabella `bars` (se presente);
//  - hand/finger/spelling/part viaggiano in `note.meta` (il normalizzatore
//    li conserva senza che nessun consumatore attuale ne sia influenzato).

import { decodeNotes } from "./songSchema.mjs";

export function songToSeq(song) {
  const notes = decodeNotes(song.notes);
  notes.forEach((n, i) => {
    n.__i = i;
  });
  notes.sort(
    (a, b) => a.t - b.t || (a.grp ?? 0) - (b.grp ?? 0) || a.__i - b.__i,
  );

  const bars = song.bars ?? [];
  let barIdx = 0;
  const barFor = (t) => {
    while (barIdx + 1 < bars.length && bars[barIdx + 1][0] <= t + 1e-9) barIdx += 1;
    while (barIdx > 0 && bars[barIdx][0] > t + 1e-9) barIdx -= 1;
    return bars[barIdx] ?? null;
  };

  const events = [];
  let current = null;
  for (const n of notes) {
    const key = `${n.t}|${n.grp ?? 0}`;
    if (!current || current.key !== key) {
      const bar = barFor(n.t);
      const label = bar ? Number.parseInt(bar[2], 10) : NaN;
      current = {
        key,
        ev: {
          tBeat: n.t,
          durBeat: 0,
          ...(bar
            ? {
                bar: Number.isFinite(label) ? label : bars.indexOf(bar) + 1,
                beatInBar: Math.round((n.t - bar[0]) * 1e6) / 1e6,
              }
            : {}),
          notes: [],
        },
      };
      events.push(current.ev);
    }
    const meta = {};
    if (n.h) meta.hand = n.h;
    if (n.f) meta.finger = n.f;
    if (n.sp) meta.spelling = n.sp;
    if (n.p) meta.part = n.p;
    current.ev.notes.push({
      midi: n.m,
      ...(n.vel != null ? { velocity: n.vel } : {}),
      durBeat: n.d,
      // staff assente => null: il normalizzatore lo legge come 0, esattamente
      // come faceva con i vecchi file senza staff (hand-authored e MIDI).
      staff: n.s ?? null,
      ...(n.v != null ? { voice: n.v } : {}),
      ...(Object.keys(meta).length ? { meta } : {}),
    });
    current.ev.durBeat = Math.max(current.ev.durBeat, n.d);
  }

  const meta = song.meta ?? {};
  const time = song.time ?? {};
  const meter = time.meterMap ?? [];
  return {
    meta: {
      title: meta.title,
      composers: meta.composers ?? [],
      source: meta.source,
      parts: meta.parts,
      key: meta.key ?? undefined,
      stats: meta.stats,
    },
    time: {
      bpm: time.bpm,
      timeSignature: time.timeSignature,
      unit: time.unit,
      timeChanges:
        meter.length > 1
          ? meter.map(([tBeat, timeSignature]) => ({ tBeat, timeSignature }))
          : undefined,
    },
    events,
  };
}

export default songToSeq;
