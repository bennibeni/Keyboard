// Migrazione dai "dialetti" storici di songs/*.js (music-seq@1,
// song-canonical@1 nelle sue varianti: musicxml-mxl, beat-note-objects,
// simple-measures, repeated-chords, triplets, pattern-notes-value) al
// formato unico "song-canonical@2".
//
// Cosa si conserva: tutte le note (t = tBeat + offsetBeat, durata, midi,
// staff, voce, parte, mano, diteggiatura, velocity, gain, nome scritto),
// il raggruppamento in eventi (colonna `grp`, vedi songSchema.mjs), metadati,
// tempo/metro, armonia (harmonyTimeline + symbol/roman degli eventi), testi,
// direzioni testuali, e i campi evento rari (performanceHint, notation,
// slur) nella sezione `annotations`.
//
// Cosa NON si conserva, perché ridondante o privo di lettori: `midis`,
// `step/alter/octave` (derivabili da `sp` e dal midi), `sourceRef` (punta a
// JSON intermedi che non esistono più), `label` degli eventi, `pitchInventory`
// e `meta.stats` (ricalcolati).

import { encodeNotes, roundBeat, SONG_SCHEMA } from "./songSchema.mjs";

const DERIVED_META = new Set(["title", "time", "key", "composers", "composer", "parts", "source", "stats", "pitchInventory", "schema", "createdAt"]);

function beatsPerBar(ts) {
  const m = /^(\d+)\/(\d+)$/.exec(ts ?? "");
  return m ? (Number(m[1]) * 4) / Number(m[2]) : 4;
}

// Battute dai numeri di `bar` degli eventi. Si accetta solo se la ricostruzione
// è coerente con ogni evento: meglio nessuna tabella che una tabella sbagliata.
function deriveBars(events, timeSignature, timeChanges) {
  if (!events.length || events.some((e) => !Number.isFinite(Number(e.bar)))) return null;
  const starts = new Map();
  const hasBeatInBar = events.every((e) => Number.isFinite(Number(e.beatInBar)));
  if (hasBeatInBar) {
    for (const e of events) {
      const s = roundBeat(e.tBeat - Number(e.beatInBar));
      if (starts.has(e.bar) && Math.abs(starts.get(e.bar) - s) > 1e-6) return null;
      starts.set(e.bar, s);
    }
  } else {
    if (timeChanges?.length > 1) return null;
    const bpb = beatsPerBar(timeSignature);
    const first = Math.min(...events.map((e) => Number(e.bar)));
    for (const e of events) starts.set(e.bar, (Number(e.bar) - first) * bpb);
  }
  const numbers = [...starts.keys()].sort((a, b) => a - b);
  const bars = [];
  for (let i = 0; i < numbers.length; i += 1) {
    const s = starts.get(numbers[i]);
    const next = i + 1 < numbers.length ? starts.get(numbers[i + 1]) : s + beatsPerBar(timeSignature);
    if (!(next > s)) return null;
    bars.push([s, roundBeat(next - s), String(numbers[i]), i]);
  }
  const barFor = (t) => {
    let found = null;
    for (const b of bars) if (b[0] <= t + 1e-9) found = b;
    return found;
  };
  for (const e of events) {
    const b = barFor(e.tBeat);
    if (!b || b[2] !== String(e.bar)) return null;
  }
  return bars;
}

export function legacyToSong(json, { id, label } = {}) {
  const srcMeta = json.meta ?? {};
  const srcTime = json.time ?? srcMeta.time ?? {};
  const warnings = [];
  const events = (json.events ?? []).map((e, i) => ({
    ...e,
    tBeat: Number(e.tBeat ?? e.t ?? 0),
    durBeat: Number(e.durBeat ?? e.dur ?? 0),
    __i: i,
  }));

  // stesso ordinamento del normalizzatore: (tBeat, durBeat, indice sorgente)
  const ordered = [...events].sort(
    (a, b) => a.tBeat - b.tBeat || a.durBeat - b.durBeat || a.__i - b.__i,
  );
  const rankAt = new Map();
  let multi = false;
  const rows = [];
  const harmony = [];
  const lyrics = [];
  const annotations = [];
  let offsetsNonZero = 0;

  for (const ev of ordered) {
    const rank = rankAt.get(ev.tBeat) ?? 0;
    rankAt.set(ev.tBeat, rank + 1);
    if (rank > 0) multi = true;

    for (const n of ev.notes ?? []) {
      const midi = typeof n === "number" ? n : n.midi;
      if (!Number.isFinite(Number(midi))) continue;
      const off = Number(n.offsetBeat ?? n.offset ?? 0) || 0;
      if (off) offsetsNonZero += 1;
      const vel = typeof n === "number" ? null : (n.velocity ?? n.vel ?? null);
      rows.push({
        t: roundBeat(ev.tBeat + off),
        d: roundBeat(Number((typeof n === "number" ? null : (n.durBeat ?? n.dur)) ?? ev.durBeat) || 0),
        m: Math.round(Number(midi)),
        s: n.staff ?? null,
        v: n.voice == null ? null : String(n.voice),
        p: n.part ?? null,
        h: n.hand ?? null,
        f: n.finger ?? null,
        vel: vel == null ? null : Number(vel),
        sp: n.name ?? null,
        gain: ev.gain ?? null,
        grp: rank || null,
      });
    }

    const chord = ev.symbol || ev.roman;
    if (chord) {
      const key = `${ev.tBeat}|${ev.symbol ?? ""}|${ev.roman ?? ""}`;
      if (!harmony.some((h) => h.__k === key)) {
        harmony.push({ __k: key, t: roundBeat(ev.tBeat), ...(ev.symbol ? { symbol: ev.symbol } : {}), ...(ev.roman ? { roman: ev.roman } : {}) });
      }
    }
    if (ev.lyrics) {
      if (typeof ev.lyrics === "string") lyrics.push({ t: roundBeat(ev.tBeat), verse: "1", text: ev.lyrics, syl: "single" });
      else {
        for (const [verse, v] of Object.entries(ev.lyrics)) {
          if (v?.text) lyrics.push({ t: roundBeat(ev.tBeat), verse: verse.replace(/^v/, ""), text: v.text, syl: v.syllabic ?? "single" });
        }
      }
    }
    const extra = {};
    for (const k of ["performanceHint", "notation", "slur"]) if (ev[k] != null) extra[k] = ev[k];
    if (Object.keys(extra).length) annotations.push({ t: roundBeat(ev.tBeat), ...(rank ? { grp: rank } : {}), ...extra });
  }
  if (offsetsNonZero) warnings.push(`${offsetsNonZero} note con offsetBeat diverso da zero: fuso in t.`);

  for (const h of json.harmonyTimeline ?? []) {
    harmony.push({
      t: roundBeat(Number(h.tBeat ?? 0)),
      symbol: h.symbol,
      ...(h.root?.name ? { root: h.root.name } : {}),
      ...(h.kind ? { kind: h.kind } : {}),
      ...(h.bass?.name ? { bass: h.bass.name } : {}),
    });
  }
  harmony.sort((a, b) => a.t - b.t);
  for (const h of harmony) delete h.__k;

  const marks = (json.textDirections ?? []).map((d) => ({
    t: roundBeat(Number(d.tBeat ?? 0)), kind: "words", text: d.text,
  }));

  const bpm = Number(srcTime.bpm) > 0 ? Number(srcTime.bpm) : 120;
  const timeSignature = /^\d+\/\d+$/.test(srcTime.timeSignature ?? "") ? srcTime.timeSignature : "4/4";
  const meterMap = srcTime.timeChanges?.length
    ? srcTime.timeChanges.map((c) => [roundBeat(Number(c.tBeat ?? 0)), c.timeSignature])
    : [[0, timeSignature]];

  const bars = deriveBars(ordered, timeSignature, srcTime.timeChanges);
  const notesSorted = rows.sort((a, b) => a.t - b.t || (a.grp ?? 0) - (b.grp ?? 0) || 0);
  if (!multi) for (const r of notesSorted) r.grp = null;

  const extraMeta = {};
  for (const [k, v] of Object.entries(srcMeta)) if (!DERIVED_META.has(k)) extraMeta[k] = v;
  const composers = Array.isArray(srcMeta.composers)
    ? srcMeta.composers
    : typeof srcMeta.composer === "string" ? [srcMeta.composer] : [];

  return {
    schema: SONG_SCHEMA,
    meta: {
      ...(id ? { id } : {}),
      title: srcMeta.title ?? "Untitled",
      ...(label ? { label } : {}),
      composers,
      key: srcMeta.key ?? null,
      parts: srcMeta.parts ?? [],
      source: { ...(srcMeta.source ?? {}), migratedFrom: json.schema ?? srcMeta.schema ?? "legacy" },
      ...(Object.keys(extraMeta).length ? { extra: extraMeta } : {}),
      stats: {
        notes: notesSorted.length,
        durationBeats: roundBeat(Math.max(0, ...notesSorted.map((r) => r.t + r.d))),
        ...(bars ? { bars: bars.length } : {}),
      },
      warnings,
    },
    time: { bpm, timeSignature, unit: srcTime.unit ?? "quarter", tempoMap: [[0, bpm]], meterMap },
    ...(bars ? { bars } : {}),
    notes: encodeNotes(notesSorted),
    ...(harmony.length ? { harmony } : {}),
    ...(lyrics.length ? { lyrics } : {}),
    ...(marks.length ? { marks } : {}),
    ...(annotations.length ? { annotations } : {}),
  };
}

export default legacyToSong;
