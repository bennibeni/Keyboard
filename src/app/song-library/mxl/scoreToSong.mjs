// Fase 2 della conversione: Score grezzo -> brano "song-canonical@2".
//
// Qui si prendono le decisioni musicali, in quest'ordine:
//   1. unione delle informazioni per misura tra le parti (tempo, armonia,
//      ritornelli, tonalità, metro) e calcolo della LUNGHEZZA di ogni misura;
//   2. ordine di esecuzione (ritornelli/volte/D.C./D.S.) -> timeline
//      "eseguita", su cui sono espressi tutti i tempi del file;
//   3. abbellimenti (grace notes);
//   4. emissione delle note sulla timeline eseguita, fondendo le
//      legature di valore (una nota legata = UNA riga con durata somma);
//   5. tonalità (con riconoscimento del modo se manca), mappe di tempo e
//      di metro, armonia, testi, segni;
//   6. codifica compatta (encodeNotes) e statistiche.

import { computePlayOrder } from "./expandRepeats.mjs";
import { tonicFromFifths, inferMode } from "./keys.mjs";
import { encodeNotes, roundBeat, SONG_SCHEMA } from "../format/songSchema.mjs";

export const CONVERTER = { name: "mxl2song", version: "1.0.0" };

const EPS = 1e-6;
// Legature di valore: la nota di arrivo può iniziare leggermente prima/dopo la
// fine di quella di partenza (stesso arrotondamento delle terzine che sposta
// le barre, vedi LENGTH_TOLERANCE).
const TIE_TOLERANCE = 0.1;
const GRACE_BEAT = 0.125; // durata predefinita di un abbellimento (un 32° = 1/8 di quarto)

export const DEFAULT_OPTIONS = {
  expandRepeats: true, // srotola ritornelli, volte, D.C./D.S./Coda/Fine
  grace: "auto", // "auto" = suona gli abbellimenti; "skip" = li scarta
  dynamics: false, // true = velocity dalle dinamiche (p, mf, f...)
  defaultBpm: 120, // se la partitura non dichiara nessun tempo
};

function dedupeBy(list, keyFn) {
  const seen = new Set();
  return list.filter((x) => {
    const k = keyFn(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Unisce, per ciascun indice di misura, le informazioni di tutte le parti.
function mergeMeasures(parts) {
  const count = Math.max(...parts.map((p) => p.measures.length));
  const merged = [];
  for (let mi = 0; mi < count; mi += 1) {
    const G = {
      number: null, implicit: false, contentEnd: 0,
      tempo: [], harmony: [], marks: [], keys: [], times: [], jump: {},
      fwd: false, bwd: null, endingStart: null, endingStop: null,
    };
    for (const part of parts) {
      const pm = part.measures[mi];
      if (!pm) continue;
      G.number ??= pm.number;
      G.implicit ||= pm.implicit;
      G.contentEnd = Math.max(G.contentEnd, pm.contentEnd);
      G.fwd ||= pm.repeatFwd;
      G.bwd ??= pm.repeatBwd;
      G.endingStart ??= pm.endingStart;
      G.endingStop ??= pm.endingStop;
      Object.assign(G.jump, pm.jump);
      G.tempo.push(...pm.tempo);
      G.harmony.push(...pm.harmony);
      G.marks.push(...pm.marks);
      if (!G.keys.length) G.keys = pm.keys;
      if (!G.times.length) G.times = pm.times;
    }
    G.number ??= String(mi + 1);
    G.harmony = dedupeBy(G.harmony, (h) => `${h.rel}|${h.symbol}`);
    G.marks = dedupeBy(G.marks, (x) => `${x.rel}|${x.kind}|${x.text}`);
    merged.push(G);
  }

  // Le "volte" coprono più misure: si propaga il numero dalla misura di
  // inizio a quella di fine (inclusa).
  let current = null;
  for (const G of merged) {
    if (G.endingStart) current = G.endingStart;
    else if (!current && G.endingStop?.length) current = G.endingStop;
    G.ending = current;
    if (G.endingStop != null) current = null;
  }
  return merged;
}

// Lunghezza (in beat) di ogni misura e metro in vigore.
//
// Regola: vale il CONTENUTO reale della misura (massimo tra le parti), non
// il metro nominale. Serve per anacrusi, misure spezzate attorno a un
// ritornello (es. 2.5 beat + 0.5 beat in un 3/4) e battute finali
// incomplete, che i file MusicXML spesso non marcano come `implicit`.
// Eccezioni:
//  - contenuto assente (nessuna nota né pausa): vale il metro nominale;
//  - contenuto entro TOLLERANZA dal nominale: vale il nominale. Esportatori
//    come Finale arrotondano le durate delle terzine/quintine a divisions
//    interi, e senza tolleranza ogni misura "sforerebbe" di qualche
//    millesimo di beat, accumulando deriva (0.08 beat dopo 56 misure in
//    "Der Lindenbaum" di music21).
const LENGTH_TOLERANCE = 0.1;

function computeMeasureLengths(merged) {
  let ts = { text: "4/4", quarters: 4 };
  const lens = [];
  const tsText = [];
  for (const G of merged) {
    const last = G.times[G.times.length - 1];
    if (last) ts = { text: last.text, quarters: last.quarters };
    let len;
    if (!(G.contentEnd > 0)) len = ts.quarters ?? 4;
    else if (ts.quarters != null && Math.abs(G.contentEnd - ts.quarters) <= LENGTH_TOLERANCE) len = ts.quarters;
    else len = G.contentEnd;
    lens.push(len);
    tsText.push(ts.text ?? tsText[tsText.length - 1] ?? "4/4");
  }
  return { lens, tsText };
}

// Abbellimenti -> note con inizio/durata sonori.
//  - acciaccatura (slash) o steal-time-previous: PRIMA del battere, senza
//    toccare la nota principale;
//  - appoggiatura o steal-time-following: SUL battere, ruba tempo alla
//    principale (che parte più tardi e dura meno).
function resolveGrace(notes, { mode, allowBefore }) {
  const hasGrace = notes.some((n) => n.grace);
  if (!hasGrace) return notes;
  if (mode === "skip") return notes.filter((n) => !n.grace);

  const groups = new Map();
  for (const n of notes) {
    if (!n.grace) continue;
    const key = `${n.principalStart}|${n.voice}|${n.staff}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }

  for (const [key, graces] of groups) {
    const [ps, voice, staff] = key.split("|");
    const P = Number(ps);
    const slots = Math.max(...graces.map((g) => g.slot ?? 0)) + 1;
    const principalDur = graces[0].principalDur;
    const g0 = graces[0].grace;
    const perSlot = principalDur > 0 ? Math.min(GRACE_BEAT, principalDur / (2 * slots)) : GRACE_BEAT;
    const before = (g0.slash || g0.stealPrevious != null) && g0.stealFollowing == null;

    let useBefore = before;
    if (useBefore && !allowBefore && P - slots * perSlot < 0) useBefore = false;

    if (useBefore) {
      for (const g of graces) {
        g.start = P - (slots - (g.slot ?? 0)) * perSlot;
        g.dur = perSlot;
      }
    } else {
      const total =
        g0.stealFollowing != null && principalDur > 0
          ? Math.min(principalDur * (g0.stealFollowing / 100), principalDur * 0.9)
          : Math.min(slots * perSlot, principalDur > 0 ? principalDur * 0.5 : slots * perSlot);
      const slotDur = total / slots;
      for (const g of graces) {
        g.start = P + (g.slot ?? 0) * slotDur;
        g.dur = slotDur;
      }
      for (const n of notes) {
        if (n.grace || n.voice !== voice || String(n.staff) !== staff) continue;
        if (Math.abs(n.start - P) < EPS) {
          n.start = P + total;
          n.dur = Math.max(0, n.dur - total);
        }
      }
    }
  }
  return notes;
}

function handFor(part, localStaff) {
  if (part.declaredStaves === 2) return localStaff === 1 ? "RH" : localStaff === 2 ? "LH" : null;
  const name = `${part.name ?? ""}`.toLowerCase();
  if (/\b(right|rh|destra|mano destra)\b/.test(name)) return "RH";
  if (/\b(left|lh|sinistra|mano sinistra)\b/.test(name)) return "LH";
  return null;
}

export function scoreToSong(score, userOptions = {}, context = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...userOptions };
  const warnings = [...score.warnings];

  // --- 1. misure --------------------------------------------------------
  const merged = mergeMeasures(score.parts);
  const { lens, tsText } = computeMeasureLengths(merged);

  // Staff globale: i righi delle parti successive proseguono la numerazione.
  let staffBase = 0;
  const partMeta = score.parts.map((p) => {
    const maxNoteStaff = Math.max(
      0,
      ...p.measures.flatMap((m) => m.notes.map((n) => n.staff)),
    );
    const staves = Math.max(p.declaredStaves, maxNoteStaff, 1);
    const meta = { part: p, base: staffBase, staves };
    staffBase += staves;
    return meta;
  });

  // Tonalità in vigore in ciascuna misura (fifths + mode dichiarato).
  let curKey = null;
  const keyAt = merged.map((G) => {
    const last = G.keys[G.keys.length - 1];
    if (last) curKey = { fifths: last.fifths, mode: last.mode };
    return curKey;
  });

  // --- 2. ordine di esecuzione -----------------------------------------
  const { order, warnings: repeatWarnings } = computePlayOrder(
    merged.map((G) => ({
      fwd: G.fwd, bwd: G.bwd, ending: G.ending, endingStop: G.endingStop != null, jump: G.jump,
    })),
    { expand: opts.expandRepeats },
  );
  warnings.push(...repeatWarnings);

  // --- 3. abbellimenti (una volta per parte/misura) ---------------------
  const resolved = partMeta.map(({ part }) =>
    part.measures.map((m, mi) =>
      resolveGrace(m.notes, { mode: opts.grace, allowBefore: mi > 0 }),
    ),
  );

  // Alcuni esportatori (Dolet per Sibelius, ad esempio) scrivono solo
  // <tie type="start"> e mai lo "stop": in quel caso la nota successiva alla
  // stessa altezza, adiacente, è la continuazione (è l'interpretazione di
  // music21). Si attiva solo se il file ha molti più start che stop, per non
  // fondere per errore due note ribattute in un file scritto correttamente.
  let tieStarts = 0;
  let tieStops = 0;
  for (const { part } of partMeta) {
    for (const m of part.measures) {
      for (const n of m.notes) {
        if (n.tieStart) tieStarts += 1;
        if (n.tieStop) tieStops += 1;
      }
    }
  }
  const inferTieStops = tieStarts >= 4 && tieStops < tieStarts * 0.5;
  if (inferTieStops) {
    warnings.push(`Legature: ${tieStarts} inizi ma solo ${tieStops} fini dichiarati nel file; le fini sono state dedotte dalle note adiacenti alla stessa altezza.`);
  }

  // --- 4. emissione sulla timeline eseguita -----------------------------
  const rows = [];
  const bars = [];
  const tempoRaw = [];
  const meterMap = [];
  const keyRaw = [];
  const harmony = [];
  const marks = [];
  const lyrics = [];
  const openTies = new Map();
  let orphanTies = 0;
  let droppedZero = 0;
  let T = 0;
  let lastTs = null;
  let lastKeyId = null;

  for (const mi of order) {
    const G = merged[mi];
    const len = lens[mi];
    bars.push([roundBeat(T), roundBeat(len), G.number, mi]);

    if (tsText[mi] !== lastTs) {
      meterMap.push([roundBeat(T), tsText[mi]]);
      lastTs = tsText[mi];
    }
    const k = keyAt[mi];
    const keyId = k ? `${k.fifths}|${k.mode}` : "none";
    if (keyId !== lastKeyId && k) keyRaw.push({ t: T, ...k });
    lastKeyId = keyId;

    // tempo: a parità di posizione vince <sound tempo> sul metronomo
    const byRel = new Map();
    for (const tp of G.tempo) {
      const key = roundBeat(tp.rel);
      if (!byRel.has(key) || tp.src === "sound") byRel.set(key, tp);
    }
    for (const [rel, tp] of byRel) tempoRaw.push({ t: T + rel, bpm: tp.bpm });

    for (const h of G.harmony) {
      harmony.push({ t: roundBeat(T + h.rel), symbol: h.symbol, root: h.root, kind: h.kind, ...(h.bass ? { bass: h.bass } : {}) });
    }
    for (const x of G.marks) marks.push({ t: roundBeat(T + x.rel), kind: x.kind, text: x.text });

    partMeta.forEach(({ part, base }, pi) => {
      for (const n of resolved[pi][mi]) {
        const start = T + n.start;
        if (n.tieStop || (inferTieStops && !n.grace && openTies.has(`${pi}|${n.midi}`))) {
          const list = openTies.get(`${pi}|${n.midi}`) ?? [];
          const idx = list.findIndex(
            (r) => Math.abs(r.end - start) <= TIE_TOLERANCE && r.voice === n.voice && r.staff === n.staff,
          );
          const j = idx >= 0 ? idx : list.findIndex((r) => Math.abs(r.end - start) <= TIE_TOLERANCE);
          if (j >= 0) {
            const row = list[j];
            row.end = start + n.dur;
            row.d = row.end - row.t;
            if (!n.tieStart) list.splice(j, 1);
            continue;
          }
          if (n.tieStop) orphanTies += 1;
        }
        if (!(n.dur > 0)) {
          droppedZero += 1;
          continue;
        }
        const row = {
          t: start,
          d: n.dur,
          m: n.midi,
          s: base + n.staff,
          v: n.voice,
          p: part.id,
          h: handFor(part, n.staff),
          f: n.finger,
          vel: n.velocity,
          sp: n.spelling,
          end: start + n.dur,
          voice: n.voice,
          staff: n.staff,
        };
        rows.push(row);
        if (n.tieStart) {
          const key = `${pi}|${n.midi}`;
          if (!openTies.has(key)) openTies.set(key, []);
          openTies.get(key).push(row);
        }
        for (const l of n.lyrics) {
          lyrics.push({ t: roundBeat(start), verse: l.verse, text: l.text, syl: l.syllabic });
        }
      }
    });

    T += len;
  }

  if (orphanTies) warnings.push(`${orphanTies} legature senza nota di partenza: la nota di arrivo è stata suonata come nuovo attacco.`);
  if (droppedZero) warnings.push(`${droppedZero} note di durata zero scartate.`);
  if (!rows.length) throw new Error("La partitura non contiene note suonabili.");

  // --- 5. tonalità, tempo -----------------------------------------------
  rows.sort((a, b) => a.t - b.t || a.m - b.m || a.s - b.s);

  const histogram = (t0, t1) => {
    const h = new Array(12).fill(0);
    for (const r of rows) {
      if (r.t >= t0 && r.t < t1) h[r.m % 12] += r.d;
    }
    return h;
  };
  const keyMap = [];
  const rawKeys = keyRaw.length ? keyRaw : [{ t: 0, fifths: 0, mode: null, assumed: true }];
  rawKeys.forEach((k, idx) => {
    const t1 = idx + 1 < rawKeys.length ? rawKeys[idx + 1].t : Infinity;
    let mode = k.mode;
    let tonic;
    let inferred = null;
    if (mode == null || mode === "none") {
      inferred = inferMode(k.fifths, histogram(k.t, t1));
      mode = inferred.mode;
      tonic = inferred.tonic;
    } else {
      tonic = tonicFromFifths(k.fifths, mode);
    }
    keyMap.push({
      t: roundBeat(k.t), tonic, mode, fifths: k.fifths,
      ...(inferred ? { inferred: true, confidence: inferred.confidence } : {}),
      ...(k.assumed ? { assumed: true } : {}),
    });
  });
  const key0 = keyMap[0];
  const keyMeta = {
    tonic: key0.tonic,
    mode: key0.mode,
    fifths: key0.fifths,
    raw: key0.assumed
      ? "nessuna armatura dichiarata: assunto fifths=0, modo dedotto dalle altezze (Krumhansl-Kessler)"
      : key0.inferred
        ? `armatura fifths=${key0.fifths}, <mode> assente: modo dedotto dalle altezze (Krumhansl-Kessler, r=${key0.confidence})`
        : `armatura fifths=${key0.fifths}, mode=${key0.mode} (dichiarati nel file)`,
    ...(key0.inferred ? { inferred: true, confidence: key0.confidence } : {}),
  };

  // tempo: il primo tempo esplicito vale anche per l'inizio del brano
  tempoRaw.sort((a, b) => a.t - b.t);
  const tempoMap = [];
  const firstBarLen = lens[order[0]] ?? 4;
  if (!tempoRaw.length || tempoRaw[0].t > firstBarLen - EPS) {
    if (tempoRaw.length) {
      warnings.push(`Primo tempo dichiarato alla posizione ${roundBeat(tempoRaw[0].t)} beat: applicato anche all'inizio.`);
      tempoMap.push([0, tempoRaw[0].bpm]);
    } else {
      warnings.push(`Nessun tempo dichiarato nella partitura: assunto ${opts.defaultBpm} BPM.`);
      tempoMap.push([0, opts.defaultBpm]);
    }
  }
  for (const tp of tempoRaw) {
    const last = tempoMap[tempoMap.length - 1];
    if (last && last[1] === tp.bpm) continue;
    if (last && Math.abs(last[0] - tp.t) < EPS) last[1] = tp.bpm;
    else tempoMap.push([roundBeat(tp.t), tp.bpm]);
  }

  // --- 6. codifica --------------------------------------------------------
  const noteObjects = rows.map((r) => ({
    t: roundBeat(r.t), d: roundBeat(r.d), m: r.m, s: r.s, v: r.v, p: r.p, h: r.h, f: r.f,
    vel: r.vel, sp: r.sp,
  }));
  const durationBeats = roundBeat(Math.max(...rows.map((r) => r.t + r.d)));
  const noteTable = encodeNotes(noteObjects);
  // `v` (voce) e `p` (parte) valgono quasi sempre "1"/"P1": la colonna resta
  // per fedeltà al MusicXML ma costa pochi byte grazie alla compattazione.

  const title =
    context.title || score.title || score.movementTitle || context.fileTitle || "Untitled";

  return {
    schema: SONG_SCHEMA,
    meta: {
      ...(context.id ? { id: context.id } : {}),
      title,
      ...(context.label ? { label: context.label } : {}),
      composers: score.composers,
      key: keyMeta,
      parts: partMeta.map(({ part, staves }) => ({
        id: part.id,
        name: part.name,
        ...(part.abbreviation ? { abbreviation: part.abbreviation } : {}),
        staves,
      })),
      source: {
        family: "musicxml-mxl",
        format: "musicxml-mxl",
        ...(context.fileName ? { originalFile: context.fileName, file: context.fileName } : {}),
        ...(context.container?.rootFile ? { rootXml: context.container.rootFile } : {}),
        ...(score.version ? { originalSchema: `musicxml-${score.version}-partwise` } : {}),
        ...(score.software ? { software: score.software } : {}),
        ...(score.encodingDate ? { encodingDate: score.encodingDate } : {}),
      },
      stats: {
        notes: rows.length,
        bars: merged.length,
        barsPlayed: order.length,
        durationBeats,
        harmonyCount: harmony.length,
      },
      converter: { ...CONVERTER, options: opts },
      warnings,
    },
    time: {
      bpm: tempoMap[0][1],
      timeSignature: meterMap[0][1],
      unit: "quarter",
      tempoMap,
      meterMap,
      ...(keyMap.length > 1 ? { keyMap: keyMap.map((k) => [k.t, k.tonic, k.mode, k.fifths]) } : {}),
    },
    bars,
    notes: noteTable,
    ...(harmony.length ? { harmony } : {}),
    ...(lyrics.length ? { lyrics } : {}),
    ...(marks.length ? { marks } : {}),
  };
}
