// Esporta un brano song-canonical@2 (*.song.json) in MusicXML compresso (.mxl).
// Operazione inversa di song-library/mxl (convertMusicXml): utile per i brani
// della libreria il cui .mxl originale è andato perso.
//
//   node scripts/song-to-musicxml.mjs songs/brano.song.json uscita.mxl [--title "..."] [--composer "..."] [--arranger "..."]
//        [--grid N]  arrotonda inizi e durate a 1/N di battito (es. 4 = semicrome, 6 = crome e terzine)
//        [--clip]    accorcia le note che si sovrappongono all'attacco successivo nello stesso rigo
// Le due opzioni servono per i brani nati da MIDI o da esecuzioni (durate "suonate", non scritte):
// rendono leggibile lo spartito al prezzo di piccole differenze di durata.
//
// Cosa ricostruisce: altezze con la grafia salvata (`sp`), durate (spezzate e
// legate ai confini di battuta), righi, voci, pause, travature per mezza
// battuta, metro, tempo, tonalità, sigle (`harmony`), indicazioni (`marks`).
// Cosa NON può ricostruire (non è nel song.json): gambi, pedale disegnato,
// segni di ottava, dinamiche, ritornelli (il brano è già srotolato).
// Limite: ogni voce deve avere attacchi distinti o accordi della stessa durata;
// le note che si sovrappongono nella stessa voce vanno in voci aggiuntive.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { deflateRawSync } from "node:zlib";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const [inPath, outPath] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!inPath || !outPath) {
  console.error("uso: node scripts/song-to-musicxml.mjs brano.song.json uscita.mxl [--title T] [--composer C] [--arranger A]");
  process.exit(1);
}

const song = JSON.parse(readFileSync(inPath, "utf8"));
const cols = song.notes.cols;
const rows = song.notes.rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? null])));

// ---------- tempo in divisioni ----------
// I tempi del song.json sono arrotondati a 6 decimali (1/3 -> 0.333333): tolleranza adeguata.
// Valori che non stanno su nessuna griglia ragionevole (trilli scritti, brani da MIDI)
// vengono arrotondati alla griglia di 1/48 di battito, che contiene sia le terzine
// sia i sessantaquattresimi.
const userGrid = Number(opt("grid")) || null;
const GRID = userGrid ?? 48;
const fracDen = (x) => {
  for (let d = 1; d <= GRID; d++) if (Math.abs(Math.round(x * d) - x * d) < d * 1e-6 + 1e-9) return d;
  return null;
};
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);
let DIV = 1;
let offGrid = 0;
for (const v of [...rows.flatMap((r) => [r.t, r.d]), ...(song.bars ?? []).flatMap((b) => [b[0], b[1]])]) {
  const d = fracDen(v);
  if (d) DIV = lcm(DIV, d);
  else offGrid++;
}
if (offGrid) DIV = lcm(DIV, GRID);
if (DIV > GRID || userGrid) DIV = GRID;
const q = (beats) => Math.round(beats * DIV);
let rounded = 0;
for (const r of rows) {
  const t = q(r.t) / DIV, e = Math.max(q(r.t) + 1, q(r.t + r.d)) / DIV;
  if (Math.abs(t - r.t) > 1e-5 || Math.abs(e - r.t - r.d) > 1e-5) rounded++;
  r.d = e - t;
  r.t = t;
}
// --clip: nello stesso rigo una nota finisce al più all'attacco successivo (diverso istante)
function hasStaffInfo(r) {
  if (rows.some((x) => Number(x.s) > 0)) return Number(r.s) || 1;
  if (rows.some((x) => x.h === "RH" || x.h === "LH")) return r.h === "LH" ? 2 : 1;
  return r.m < 60 ? 2 : 1;
}
let clipped = 0;
if (args.includes("--clip")) {
  const byStaff = new Map();
  for (const r of rows) {
    const k = hasStaffInfo(r);
    if (!byStaff.has(k)) byStaff.set(k, []);
    byStaff.get(k).push(r);
  }
  for (const list of byStaff.values()) {
    const starts = [...new Set(list.map((r) => r.t))].sort((a, b) => a - b);
    for (const r of list) {
      const next = starts.find((t) => t > r.t + 1e-9);
      if (next !== undefined && r.t + r.d > next + 1e-9) { r.d = next - r.t; clipped++; }
    }
  }
}
if (clipped) console.warn(`--clip: ${clipped} note accorciate per non sovrapporsi all'attacco successivo.`);
if (rounded) console.warn(`Attenzione: ${rounded} note arrotondate alla griglia di 1/${DIV} di battito${userGrid ? " (--grid)" : " (abbellimenti scritti o tempi da MIDI; per uno spartito più pulito prova --grid 4 o --grid 6 e --clip)"}.`);

// ---------- battute ----------
const ts = song.time?.timeSignature ?? "4/4";
const [tsNum, tsDen] = ts.split("/").map(Number);
const barLen = (tsNum * 4) / tsDen;
const totalBeats = Math.max(...rows.map((r) => r.t + r.d));
const bars = song.bars?.length
  ? song.bars.map(([t, len, label]) => ({ start: q(t), len: q(len), label }))
  : Array.from({ length: Math.ceil(totalBeats / barLen) }, (_, i) => ({ start: q(i * barLen), len: q(barLen), label: String(i + 1) }));
// note che finiscono oltre l'ultima battuta (es. accordo finale tenuto): si aggiungono battute
while (bars.length && bars.at(-1).start + bars.at(-1).len < q(totalBeats)) {
  const last = bars.at(-1);
  const n = Number(last.label);
  bars.push({ start: last.start + last.len, len: q(barLen), label: Number.isFinite(n) ? String(n + 1) : `${last.label}+` });
}

// ---------- voci (lane): una per (rigo, voce), più eventuali voci extra ----------
// Rigo: quello del brano; se il brano non lo indica, la mano (RH/LH);
// altrimenti il registro, come in R25: sotto il Do4 nel basso.
const hasStaff = rows.some((r) => Number(r.s) > 0);
const hasHand = rows.some((r) => r.h === "RH" || r.h === "LH");
const rawStaff = (r) =>
  hasStaff ? Number(r.s) || 1 : hasHand ? (r.h === "LH" ? 2 : 1) : r.m < 60 ? 2 : 1;
// righi usati rinumerati 1..n (un brano può saltare un numero di rigo)
const usedStaves = [...new Set(rows.map(rawStaff))].sort((a, b) => a - b);
const staffOf = (r) => usedStaves.indexOf(rawStaff(r)) + 1;
const staves = usedStaves.length;
// chiave di ogni rigo dall'altezza mediana delle sue note
const clefOf = (staff) => {
  const ms = rows.filter((r) => staffOf(r) === staff).map((r) => r.m).sort((a, b) => a - b);
  return ms[Math.floor(ms.length / 2)] >= 60 ? '<sign>G</sign><line>2</line>' : '<sign>F</sign><line>4</line>';
};
const lanes = new Map();
for (const r of [...rows].sort((a, b) => a.t - b.t || a.m - b.m)) {
  const staff = staffOf(r);
  const base = `${staff}|${r.v ?? "1"}`;
  let k = 0;
  for (;;) {
    const key = `${base}|${k}`;
    const lane = lanes.get(key) ?? { staff, events: [] };
    const last = lane.events.at(-1);
    const s = q(r.t), d = q(r.d);
    if (!last || s >= last.start + last.dur) {
      lane.events.push({ start: s, dur: d, notes: [r] });
      lanes.set(key, lane);
      break;
    }
    if (s === last.start && d === last.dur) {
      last.notes.push(r);
      break;
    }
    k++;
  }
}
// numerazione voci MusicXML: rigo 1 -> 1,2,..; rigo 2 -> 5,6,..
const laneList = [...lanes.entries()]
  .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
  .map(([key, lane], i, all) => {
    const idx = all.filter(([k2, l2], j) => j < i && l2.staff === lane.staff).length;
    return { ...lane, voice: (lane.staff - 1) * 4 + 1 + idx, primary: idx === 0 };
  });

// ---------- valori di nota ----------
const TYPES = [
  [4, "whole"], [2, "half"], [1, "quarter"], [0.5, "eighth"], [0.25, "16th"], [0.125, "32nd"], [0.0625, "64th"], [0.03125, "128th"],
];
// Valore scrivibile: normale, puntato, doppiamente puntato, oppure in terzina
// (3 nel tempo di 2: un terzo di battito = croma di terzina).
function noteValue(divs) {
  const beats = divs / DIV;
  for (const tuplet of [false, true]) {
    const b0 = tuplet ? (beats * 3) / 2 : beats;
    for (const [b, name] of TYPES) {
      if (Math.abs(b0 - b) < 1e-9) return { type: name, dots: 0, tuplet, base: b };
      if (!tuplet && Math.abs(b0 - b * 1.5) < 1e-9) return { type: name, dots: 1, tuplet, base: b };
      if (!tuplet && Math.abs(b0 - b * 1.75) < 1e-9) return { type: name, dots: 2, tuplet, base: b };
    }
  }
  return null;
}
const TUPLET_TM = "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>";
// spezza una durata in valori scrivibili (dal più lungo)
function splitDur(divs) {
  const out = [];
  let rest = divs;
  while (rest > 0) {
    let piece = rest;
    while (piece > 0 && !noteValue(piece)) piece--;
    if (piece <= 0) throw new Error(`durata non scrivibile: ${divs} divisioni`);
    out.push(piece);
    rest -= piece;
  }
  return out;
}

// ---------- altezze ----------
const STEPS = ["C", "D", "E", "F", "G", "A", "B"];
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function spell(note) {
  const m = /^([A-G])(#{1,2}|b{1,2})?(-?\d+)$/.exec(note.sp ?? "");
  if (m) {
    const alter = m[2] ? (m[2][0] === "#" ? m[2].length : -m[2].length) : 0;
    const octave = Number(m[3]);
    if ((octave + 1) * 12 + PC[m[1]] + alter === note.m) return { step: m[1], alter, octave };
  }
  const n = SHARP[note.m % 12];
  return { step: n[0], alter: n.length > 1 ? 1 : 0, octave: Math.floor(note.m / 12) - 1 };
}
// armatura: dal brano, oppure ricavata da tonica e modo (i brani migrati non la salvano)
const MAJOR_FIFTHS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
const ENHARMONIC = { "A#": "Bb", "D#": "Eb", "G#": "Ab" };
function fifthsFromKey(key) {
  if (Number.isFinite(key?.fifths)) return key.fifths;
  if (!key?.tonic) return 0;
  const PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pc = (n) => (PCS[n[0]] + (n.includes("#") ? 1 : n.includes("b") ? -1 : 0) + 12) % 12;
  // minore: si usa la relativa maggiore (una terza minore sopra)
  const targetPc = (pc(key.tonic) + (key.mode === "minor" ? 3 : 0)) % 12;
  const name = Object.keys(MAJOR_FIFTHS).filter((k) => Math.abs(MAJOR_FIFTHS[k]) <= 6).find((k) => pc(k) === targetPc);
  return MAJOR_FIFTHS[ENHARMONIC[name] ?? name] ?? 0;
}
const fifths = fifthsFromKey(song.meta?.key);
const keyAlter = (step) => {
  const sharps = "FCGDAEB", flats = "BEADGCF";
  if (fifths > 0 && sharps.slice(0, fifths).includes(step)) return 1;
  if (fifths < 0 && flats.slice(0, -fifths).includes(step)) return -1;
  return 0;
};
const ACC = { "-2": "flat-flat", "-1": "flat", 0: "natural", 1: "sharp", 2: "double-sharp" };

// ---------- armonia ----------
const KINDS = { "": "major", m: "minor", 7: "dominant", m7: "minor-seventh", maj7: "major-seventh", dim: "diminished", aug: "augmented", sus4: "suspended-fourth", sus2: "suspended-second", m7b5: "half-diminished", dim7: "diminished-seventh", 6: "major-sixth", m6: "minor-sixth" };
function harmonyXml(symbol) {
  const m = /^([A-G])([#b]?)(.*?)(?:\/([A-G])([#b]?))?$/.exec(symbol || "");
  if (!m || !(m[3] in KINDS)) return "";
  const alt = (a) => (a === "#" ? "<root-alter>1</root-alter>" : a === "b" ? "<root-alter>-1</root-alter>" : "");
  const bass = m[4] ? `<bass><bass-step>${m[4]}</bass-step>${m[5] === "#" ? "<bass-alter>1</bass-alter>" : m[5] === "b" ? "<bass-alter>-1</bass-alter>" : ""}</bass>` : "";
  return `<harmony><root><root-step>${m[1]}</root-step>${alt(m[2])}</root><kind text="${m[3]}">${KINDS[m[3]]}</kind>${bass}</harmony>`;
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- misure ----------
function laneMeasure(lane, bar, acc) {
  const end = bar.start + bar.len;
  // pezzi della voce in questa battuta: note (eventualmente legate) e pause
  const items = [];
  let pos = bar.start;
  for (const ev of lane.events) {
    const evEnd = ev.start + ev.dur;
    if (evEnd <= bar.start || ev.start >= end) continue;
    const s = Math.max(ev.start, bar.start), e = Math.min(evEnd, end);
    if (s > pos) items.push({ rest: true, start: pos, dur: s - pos });
    items.push({ ev, start: s, dur: e - s, tieIn: ev.start < bar.start, tieOut: evEnd > end });
    pos = e;
  }
  if (pos < end) items.push({ rest: true, start: pos, dur: end - pos, whole: pos === bar.start });
  // voce secondaria muta per tutta la battuta: niente pause, solo avanzamento
  if (!lane.primary && items.length === 1 && items[0].rest) {
    return [`<forward><duration>${bar.len}</duration><voice>${lane.voice}</voice><staff>${lane.staff}</staff></forward>`];
  }

  // valori scrivibili + travature per mezza battuta (o per battito nei metri non pari)
  const [bNum, bDen] = meterAt(bar.start).split("/").map(Number);
  const groupLen = bNum % 2 === 0 && bDen === 4 ? q(2) : q(4 / bDen);
  const pieces = [];
  for (const it of items) {
    let s = it.start;
    const parts = it.rest && it.whole && it.dur === bar.len ? [it.dur] : splitDur(it.dur);
    parts.forEach((d, i) => {
      pieces.push({ ...it, start: s, dur: d, tieIn: it.tieIn || i > 0, tieOut: it.tieOut || i < parts.length - 1, measureRest: it.rest && it.whole && parts.length === 1 });
      s += d;
    });
  }
  // gruppi di terzina: pezzi consecutivi in terzina, chiusi quando coprono 2 valori base
  let open = null;
  for (const p of pieces) {
    const v = p.rest && p.measureRest ? null : noteValue(p.dur);
    p.value = v;
    if (!v?.tuplet) {
      if (open) { open.last.tupletStop = true; open = null; }
      continue;
    }
    if (!open) { open = { span: 2 * v.base, acc: 0 }; p.tupletStart = true; }
    open.acc += p.dur / DIV;
    open.last = p;
    if (open.acc >= open.span - 1e-9) { p.tupletStop = true; open = null; }
  }
  if (open) open.last.tupletStop = true;
  const beamable = (p) => !p.rest && p.dur < q(1);
  pieces.forEach((p, i) => {
    if (!beamable(p)) return;
    const g = Math.floor((p.start - bar.start) / groupLen);
    const same = (o) => o && beamable(o) && Math.floor((o.start - bar.start) / groupLen) === g;
    const prev = same(pieces[i - 1]), next = same(pieces[i + 1]);
    p.beam = prev && next ? "continue" : next ? "begin" : prev ? "end" : null;
  });

  const xml = [];
  for (const p of pieces) {
    if (p.rest) {
      const v = p.value;
      const tup = `${p.tupletStart ? '<tuplet type="start"/>' : ""}${p.tupletStop ? '<tuplet type="stop"/>' : ""}`;
      xml.push(`<note><rest${p.measureRest ? ' measure="yes"' : ""}/><duration>${p.dur}</duration><voice>${lane.voice}</voice>${v ? `<type>${v.type}</type>${"<dot/>".repeat(v.dots)}${v.tuplet ? TUPLET_TM : ""}` : ""}<staff>${lane.staff}</staff>${tup ? `<notations>${tup}</notations>` : ""}</note>`);
      continue;
    }
    const v = p.value;
    const notes = [...p.ev.notes].sort((a, b) => a.m - b.m);
    notes.forEach((n, j) => {
      const sp = spell(n);
      const k = `${lane.staff}|${sp.step}${sp.octave}`;
      const current = acc.has(k) ? acc.get(k) : keyAlter(sp.step);
      const showAcc = !p.tieIn && current !== sp.alter;
      if (!p.tieIn) acc.set(k, sp.alter);
      const ties = `${p.tieIn ? '<tie type="stop"/>' : ""}${p.tieOut ? '<tie type="start"/>' : ""}`;
      const tied = `${p.tieIn ? '<tied type="stop"/>' : ""}${p.tieOut ? '<tied type="start"/>' : ""}`;
      const finger = n.f ? `<technical><fingering>${n.f}</fingering></technical>` : "";
      const tup = j === 0 ? `${p.tupletStart ? '<tuplet type="start"/>' : ""}${p.tupletStop ? '<tuplet type="stop"/>' : ""}` : "";
      const notations = tied || finger || tup ? `<notations>${tied}${tup}${finger}</notations>` : "";
      xml.push(
        `<note>${j ? "<chord/>" : ""}<pitch><step>${sp.step}</step>${sp.alter ? `<alter>${sp.alter}</alter>` : ""}<octave>${sp.octave}</octave></pitch>` +
          `<duration>${p.dur}</duration>${ties}<voice>${lane.voice}</voice><type>${v.type}</type>${"<dot/>".repeat(v.dots)}` +
          `${showAcc ? `<accidental>${ACC[sp.alter]}</accidental>` : ""}${v.tuplet ? TUPLET_TM : ""}<staff>${lane.staff}</staff>` +
          `${j === 0 && p.beam ? `<beam number="1">${p.beam}</beam>` : ""}${notations}</note>`,
      );
    });
  }
  return xml;
}

// sigle: una sola per istante, e solo quando cambiano
// metro in vigore a un istante (meterMap del brano); cambi scritti a inizio battuta
const meterMap = (song.time?.meterMap ?? [[0, ts]]).map(([t, m]) => [q(t), m]).sort((a, b) => a[0] - b[0]);
const meterAt = (divPos) => {
  let m = ts;
  for (const [t, v] of meterMap) if (t <= divPos) m = v;
  return m;
};
const harmonies = [];
for (const h of [...(song.harmony ?? [])].sort((a, b) => a.t - b.t)) {
  const prev = harmonies.at(-1);
  if (prev && (prev.symbol === h.symbol || Math.abs(prev.t - h.t) < 1e-6)) continue;
  harmonies.push(h);
}
const marks = song.marks ?? [];
const bpm = song.time?.bpm ?? 120;
const measures = bars.map((bar, i) => {
  const out = [];
  if (i === 0) {
    out.push(
      // tonalità sconosciuta nel brano: niente <key>, per non inventarne una
      `<attributes><divisions>${DIV}</divisions>${song.meta?.key?.tonic ? `<key><fifths>${fifths}</fifths>${song.meta.key.mode ? `<mode>${song.meta.key.mode}</mode>` : ""}</key>` : ""}` +
        `<time><beats>${tsNum}</beats><beat-type>${tsDen}</beat-type></time><staves>${staves}</staves>` +
        (staves === 1
          ? `<clef>${clefOf(1)}</clef>`
          : Array.from({ length: staves }, (_, i) => `<clef number="${i + 1}">${clefOf(i + 1)}</clef>`).join("")) +
        `</attributes>`,
      `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><staff>1</staff><sound tempo="${bpm}"/></direction>`,
    );
  }
  const end = bar.start + bar.len;
  if (i > 0 && meterAt(bar.start) !== meterAt(bars[i - 1].start)) {
    const [n, d] = meterAt(bar.start).split("/");
    out.push(`<attributes><time><beats>${n}</beats><beat-type>${d}</beat-type></time></attributes>`);
  }
  for (const mk of marks.filter((m) => q(m.t) >= bar.start && q(m.t) < end)) {
    const off = q(mk.t) - bar.start;
    out.push(`<direction placement="${/pedal/i.test(mk.text) ? "below" : "above"}"><direction-type><words>${esc(mk.text)}</words></direction-type>${off ? `<offset>${off}</offset>` : ""}<staff>1</staff></direction>`);
  }
  // sigle: si avanza con <forward> fino al loro istante, poi si torna indietro
  let cursor = 0;
  for (const h of harmonies.filter((h) => q(h.t) >= bar.start && q(h.t) < end)) {
    const off = q(h.t) - bar.start;
    if (off > cursor) out.push(`<forward><duration>${off - cursor}</duration></forward>`);
    cursor = off;
    out.push(harmonyXml(h.symbol));
  }
  if (cursor) out.push(`<backup><duration>${cursor}</duration></backup>`);
  const acc = new Map();
  laneList.forEach((lane, li) => {
    if (li) out.push(`<backup><duration>${bar.len}</duration></backup>`);
    out.push(...laneMeasure(lane, bar, acc));
  });
  if (i === bars.length - 1) out.push(`<barline location="right"><bar-style>light-heavy</bar-style></barline>`);
  return `    <measure number="${esc(bar.label)}">\n      ${out.filter(Boolean).join("\n      ")}\n    </measure>`;
});

const title = opt("title") ?? song.meta?.title ?? "Senza titolo";
const composer = opt("composer");
const arranger = opt("arranger");
const creators = [
  composer ? `<creator type="composer">${esc(composer)}</creator>` : "",
  arranger ? `<creator type="arranger">${esc(arranger)}</creator>` : "",
  ...(!composer && !arranger ? (song.meta?.composers ?? []).map((c) => `<creator type="composer">${esc(c)}</creator>`) : []),
].join("");
const musicxml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${esc(title)}</work-title></work>
  <identification>${creators}<encoding><software>Keyboard scripts/song-to-musicxml.mjs</software></encoding></identification>
  <part-list><score-part id="P1"><part-name>${esc(song.meta?.parts?.[0]?.name ?? "Piano")}</part-name></score-part></part-list>
  <part id="P1">
${measures.join("\n")}
  </part>
</score-partwise>
`;

// ---------- ZIP (.mxl): mimetype non compresso, poi container e partitura ----------
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function zip(entries) {
  const local = [], central = [];
  let offset = 0;
  for (const { name, data, store } of entries) {
    const raw = Buffer.from(data, "utf8");
    const body = store ? raw : deflateRawSync(raw);
    const nameBuf = Buffer.from(name, "utf8");
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0, 6);
    head.writeUInt16LE(store ? 0 : 8, 8); head.writeUInt32LE(0, 10);
    head.writeUInt32LE(crc32(raw), 14); head.writeUInt32LE(body.length, 18); head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
    local.push(head, nameBuf, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0, 8);
    c.writeUInt16LE(store ? 0 : 8, 10); c.writeUInt32LE(0, 12); c.writeUInt32LE(crc32(raw), 16);
    c.writeUInt32LE(body.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
const container = `<?xml version="1.0" encoding="UTF-8"?>
<container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>
`;
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, zip([
  { name: "mimetype", data: "application/vnd.recordare.musicxml", store: true },
  { name: "META-INF/container.xml", data: container },
  { name: "score.musicxml", data: musicxml },
]));
console.log(`Creato ${outPath}: ${bars.length} battute, ${rows.length} note, divisioni ${DIV}, voci ${laneList.length}`);
