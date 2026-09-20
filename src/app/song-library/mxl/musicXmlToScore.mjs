// Fase 1 della conversione: albero XML MusicXML -> "Score" grezzo.
//
// Qui NON si prendono decisioni musicali (ripetizioni, legature di valore,
// abbellimenti, tonalità...): si legge la partitura così com'è scritta,
// misura per misura e parte per parte, con gli offset temporali già
// convertiti in "beat" (= note da un quarto) RELATIVI ALL'INIZIO DELLA
// MISURA. Tenere gli offset relativi è ciò che permette alla fase 2
// (scoreToSong.mjs) di riprodurre la stessa misura più volte, in ordine
// qualsiasi, quando espande i ritornelli.
//
// Convenzioni MusicXML rispettate (i punti che più spesso vengono sbagliati):
//  - le durate sono in "divisions" per quarto, e `divisions` può cambiare
//    da una misura all'altra;
//  - <chord/> = stessa posizione della nota precedente, il cursore non avanza;
//  - <backup>/<forward> muovono il cursore (più voci nella stessa misura);
//  - <grace/> non ha durata e non avanza il cursore;
//  - <tie> (suono) governa la legatura, <tied> (notazione) è solo un ripiego;
//  - le note di parti traspositive sono scritte, non sonanti: si somma
//    <transpose> (chromatic + 12 * octave-change) per ottenere l'altezza reale;
//  - <octave-shift> NON va compensato: <pitch> contiene già l'altezza reale.

import { child, childrenOf, textOf, numberOf, attrNumber } from "./xmlMini.mjs";

const STEP_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// beat-unit -> lunghezza in quarti (per convertire i metronomi in "quarti al minuto")
const BEAT_UNIT_QUARTERS = {
  maxima: 32, long: 16, breve: 8, whole: 4, half: 2, quarter: 1, eighth: 0.5,
  "16th": 0.25, "32nd": 0.125, "64th": 0.0625, "128th": 0.03125,
};

// Dinamiche -> velocity MIDI (valori usati da MuseScore), poi normalizzate su f = 1.0.
const DYNAMIC_MIDI_VELOCITY = {
  pppp: 8, ppp: 16, pp: 33, p: 49, mp: 64, mf: 80, f: 96, ff: 112, fff: 126, ffff: 127,
  fp: 96, sf: 112, sfz: 112, sffz: 126, fz: 112, rf: 112, rfz: 112,
};
const F_VELOCITY = 96;

export function dynamicToVelocity(midiVelocity) {
  const v = midiVelocity / F_VELOCITY;
  return Math.round(Math.max(0.15, Math.min(1.2, v)) * 100) / 100;
}

function parseEndingNumbers(raw) {
  const out = [];
  for (const part of String(raw ?? "").split(/[,\s]+/)) {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      for (let k = Number(range[1]); k <= Number(range[2]); k += 1) out.push(k);
    } else if (/^\d+$/.test(part)) {
      out.push(Number(part));
    }
  }
  return out;
}

// <metronome> -> quarti al minuto. `beat-unit-dot` segue il `beat-unit` a cui si riferisce.
function parseMetronome(node) {
  let unit = null;
  let dots = 0;
  let perMinute = null;
  for (const c of node.children) {
    if (c.name === "beat-unit" && unit == null) {
      unit = BEAT_UNIT_QUARTERS[c.text] ?? null;
    } else if (c.name === "beat-unit-dot" && unit != null && perMinute == null) {
      dots += 1;
    } else if (c.name === "per-minute" && perMinute == null) {
      const m = c.text.match(/\d+(\.\d+)?/); // ammette "c. 100", "132-144" (prende il primo)
      perMinute = m ? Number(m[0]) : null;
    }
  }
  if (unit == null || !perMinute) return null;
  let quarters = unit;
  let add = unit;
  for (let d = 0; d < dots; d += 1) {
    add /= 2;
    quarters += add;
  }
  return Math.round(perMinute * quarters * 100) / 100;
}

const KIND_SUFFIX = {
  major: "", minor: "m", augmented: "aug", diminished: "dim",
  dominant: "7", "major-seventh": "maj7", "minor-seventh": "m7",
  "diminished-seventh": "dim7", "augmented-seventh": "aug7",
  "half-diminished": "m7b5", "major-minor": "m(maj7)",
  "major-sixth": "6", "minor-sixth": "m6",
  "dominant-ninth": "9", "major-ninth": "maj9", "minor-ninth": "m9",
  "dominant-11th": "11", "major-11th": "maj11", "minor-11th": "m11",
  "dominant-13th": "13", "major-13th": "maj13", "minor-13th": "m13",
  "suspended-second": "sus2", "suspended-fourth": "sus4",
  power: "5", pedal: "ped", "Neapolitan": "N6", Italian: "It+6", French: "Fr+6", German: "Ger+6",
  tristan: "Tristan",
};

function alterToAccidental(alter) {
  const a = Math.round(Number(alter) || 0);
  if (a === 0) return "";
  return a > 0 ? "#".repeat(a) : "b".repeat(-a);
}

function parseHarmony(node) {
  const root = child(node, "root");
  if (!root) return null;
  const rootName = textOf(root, "root-step") + alterToAccidental(textOf(root, "root-alter"));
  const kindNode = child(node, "kind");
  const kind = kindNode?.text ?? "major";
  let suffix;
  if (kind === "none") suffix = " N.C.";
  else if (kind === "other") suffix = kindNode?.attrs.text ?? "";
  else suffix = KIND_SUFFIX[kind] ?? kindNode?.attrs.text ?? "";

  const degrees = childrenOf(node, "degree").map((d) => {
    const type = textOf(d, "degree-type");
    const alter = alterToAccidental(textOf(d, "degree-alter"));
    const value = textOf(d, "degree-value");
    if (type === "subtract") return `no${value}`;
    if (type === "add" && !alter) return `add${value}`;
    return `${alter}${value}`;
  });
  const bassNode = child(node, "bass");
  const bass = bassNode
    ? textOf(bassNode, "bass-step") + alterToAccidental(textOf(bassNode, "bass-alter"))
    : null;

  const body = suffix.startsWith(" ")
    ? suffix.trim()
    : `${rootName}${suffix}${degrees.length ? `(${degrees.join(",")})` : ""}`;
  return { symbol: bass ? `${body}/${bass}` : body, root: rootName, kind, bass };
}

// Composizione di un metro da <time>: supporta "3+2" e più coppie beats/beat-type.
function parseTimeSignature(node) {
  if (child(node, "senza-misura")) return null;
  const beats = childrenOf(node, "beats").map((b) => b.text);
  const types = childrenOf(node, "beat-type").map((b) => Number(b.text));
  if (!beats.length || beats.length !== types.length) return null;
  let quarters = 0;
  for (let k = 0; k < beats.length; k += 1) {
    const num = beats[k].split("+").reduce((s, x) => s + (Number(x) || 0), 0);
    if (!num || !types[k]) return null;
    quarters += (num * 4) / types[k];
  }
  if (beats.length === 1 && /^\d+$/.test(beats[0])) {
    return { text: `${beats[0]}/${types[0]}`, quarters };
  }
  // Metri composti/additivi: riespressi come N/den con den potenza di 2.
  for (const den of [4, 8, 16, 32]) {
    const num = (quarters * den) / 4;
    if (Math.abs(num - Math.round(num)) < 1e-9) return { text: `${Math.round(num)}/${den}`, quarters };
  }
  return { text: "4/4", quarters };
}

function newMeasure(index, node) {
  const number = node.attrs.number ?? String(index + 1);
  return {
    index,
    number,
    implicit: node.attrs.implicit === "yes" || number === "0",
    notes: [],
    tempo: [], // { rel, bpm, src }
    harmony: [], // { rel, symbol, root, kind, bass }
    marks: [], // { rel, kind, text }
    keys: [], // { rel, fifths, mode }
    times: [], // { rel, text, quarters }
    jump: {}, // dacapo, dalsegno, tocoda, fine, segno, coda
    repeatFwd: false,
    repeatBwd: null, // { times }
    endingStart: null, // number[]
    endingStop: null, // number[] (numeri dichiarati alla chiusura)
    contentEnd: 0, // beat: fine dell'ultimo evento (note, pause, forward)
  };
}

function parsePart(partNode, partInfo, warn, opts) {
  const measures = [];
  let divisions = 1;
  let declaredStaves = 1;
  let transpose = 0;
  let currentVelocity = null;
  let unpitchedSeen = false;

  const mNodes = childrenOf(partNode, "measure");
  for (let mi = 0; mi < mNodes.length; mi += 1) {
    const mNode = mNodes[mi];
    const M = newMeasure(mi, mNode);
    let cursor = 0; // in divisions
    let maxCursor = 0;
    let lastNoteStart = 0;
    let lastGraceStart = null;
    let graceSlot = -1; // indice dell'abbellimento nel gruppo (le note di un accordo condividono lo slot)
    let pendingGrace = [];
    const beats = (div) => div / divisions;

    const flushGrace = (principalStart, principalDur) => {
      for (const g of pendingGrace) {
        g.principalStart = beats(principalStart);
        g.principalDur = beats(principalDur);
      }
      pendingGrace = [];
      lastGraceStart = null;
      graceSlot = -1;
    };

    const handleSound = (snd, rel) => {
      const tempo = attrNumber(snd, "tempo");
      if (tempo > 0) M.tempo.push({ rel, bpm: tempo, src: "sound" });
      const dyn = attrNumber(snd, "dynamics");
      if (dyn > 0) currentVelocity = dynamicToVelocity((dyn / 100) * 90);
      const a = snd.attrs;
      if (a.dacapo === "yes") M.jump.dacapo = true;
      if (a.dalsegno != null) M.jump.dalsegno = a.dalsegno;
      if (a.tocoda != null) M.jump.tocoda = a.tocoda;
      if (a.fine != null) M.jump.fine = true;
      if (a.segno != null) M.jump.segno = a.segno;
      if (a.coda != null) M.jump.coda = a.coda;
    };

    for (const el of mNode.children) {
      switch (el.name) {
        case "attributes": {
          const d = numberOf(el, "divisions");
          if (d > 0) divisions = d;
          const st = numberOf(el, "staves");
          if (st > 0) declaredStaves = st;
          for (const k of childrenOf(el, "key")) {
            if (k.attrs.number && k.attrs.number !== "1") continue;
            M.keys.push({
              rel: beats(cursor),
              fifths: numberOf(k, "fifths", 0),
              mode: textOf(k, "mode") || null,
            });
          }
          for (const t of childrenOf(el, "time")) {
            if (t.attrs.number && t.attrs.number !== "1") continue;
            const ts = parseTimeSignature(t);
            M.times.push({ rel: beats(cursor), text: ts?.text ?? null, quarters: ts?.quarters ?? null });
          }
          const tr = child(el, "transpose");
          if (tr) transpose = numberOf(tr, "chromatic", 0) + 12 * numberOf(tr, "octave-change", 0);
          break;
        }

        case "backup":
          cursor -= numberOf(el, "duration", 0);
          break;

        case "forward":
          cursor += numberOf(el, "duration", 0);
          maxCursor = Math.max(maxCursor, cursor);
          break;

        case "note": {
          const isChord = !!child(el, "chord");
          const grace = child(el, "grace");
          const isRest = !!child(el, "rest");
          const isCue = !!child(el, "cue");
          const dur = grace ? 0 : numberOf(el, "duration", 0);

          let start;
          if (grace) start = isChord && lastGraceStart != null ? lastGraceStart : cursor;
          else start = isChord ? lastNoteStart : cursor;

          if (!grace && !isChord) {
            // Un nuovo attacco "normale": i grace accumulati gli appartengono.
            if (pendingGrace.length) flushGrace(start, dur);
            lastNoteStart = cursor;
          }

          const pitch = child(el, "pitch");
          if (pitch && !isRest && !isCue) {
            const step = textOf(pitch, "step");
            const alterRaw = numberOf(pitch, "alter", 0);
            const octave = numberOf(pitch, "octave", 4);
            if (!(step in STEP_PC)) {
              warn(`Nota con step "${step}" non valido ignorata (misura ${M.number}).`);
            } else {
              if (!Number.isInteger(alterRaw)) warn("Alterazione microtonale arrotondata al semitono.", "microtonal");
              const alter = Math.round(alterRaw);
              const midi = (octave + 1) * 12 + STEP_PC[step] + alter + transpose;

              // <tie> (suono) e <tied> (notazione) dovrebbero coincidere, ma alcuni
              // esportatori scrivono solo uno dei due: si uniscono entrambi.
              const ties = childrenOf(el, "tie").map((t) => t.attrs.type);
              for (const t of childrenOf(child(el, "notations"), "tied")) {
                if (t.attrs.type === "continue") ties.push("stop", "start");
                else ties.push(t.attrs.type);
              }
              const fingerText = textOf(child(child(el, "notations"), "technical"), "fingering");
              const finger = /^[1-5]/.test(fingerText) ? Number(fingerText[0]) : null;

              const lyrics = [];
              for (const l of childrenOf(el, "lyric")) {
                const text = childrenOf(l, "text").map((t) => t.text).join(" ").trim();
                if (!text) continue;
                lyrics.push({
                  verse: l.attrs.number ?? l.attrs.name ?? "1",
                  text,
                  syllabic: textOf(l, "syllabic") || "single",
                });
              }

              const note = {
                start: beats(start),
                dur: beats(dur),
                midi,
                spelling: `${step}${alterToAccidental(alter)}${octave}`, // altezza SCRITTA
                staff: numberOf(el, "staff", 1),
                voice: textOf(el, "voice") || "1",
                tieStart: ties.includes("start"),
                tieStop: ties.includes("stop"),
                finger,
                lyrics,
                velocity: opts.dynamics ? currentVelocity : null,
                grace: grace
                  ? {
                      slash: grace.attrs.slash === "yes",
                      stealFollowing: attrNumber(grace, "steal-time-following"),
                      stealPrevious: attrNumber(grace, "steal-time-previous"),
                    }
                  : null,
                principalStart: null,
                principalDur: null,
              };
              if (grace) {
                if (!isChord || graceSlot < 0) graceSlot += 1;
                note.slot = graceSlot;
                pendingGrace.push(note);
                lastGraceStart = start;
              }
              M.notes.push(note);
            }
          } else if (child(el, "unpitched") && !unpitchedSeen) {
            unpitchedSeen = true;
            warn("Note non intonate (percussioni) ignorate.", "unpitched");
          }

          if (!grace) {
            if (!isChord) cursor += dur;
            maxCursor = Math.max(maxCursor, start + dur, cursor);
          }
          break;
        }

        case "direction": {
          const rel = beats(cursor);
          for (const dt of childrenOf(el, "direction-type")) {
            for (const x of dt.children) {
              if (x.name === "metronome") {
                const bpm = parseMetronome(x);
                if (bpm) M.tempo.push({ rel, bpm, src: "metronome" });
              } else if (x.name === "dynamics") {
                const name = x.children[0]?.name;
                if (name in DYNAMIC_MIDI_VELOCITY) currentVelocity = dynamicToVelocity(DYNAMIC_MIDI_VELOCITY[name]);
              } else if (x.name === "words") {
                const text = x.text.replace(/\s+/g, " ").trim();
                if (text && text.length <= 60) M.marks.push({ rel, kind: "words", text });
              } else if (x.name === "rehearsal") {
                if (x.text) M.marks.push({ rel, kind: "rehearsal", text: x.text });
              } else if (x.name === "segno") {
                M.marks.push({ rel, kind: "segno", text: x.attrs.smufl ?? "segno" });
              } else if (x.name === "coda") {
                M.marks.push({ rel, kind: "coda", text: x.attrs.smufl ?? "coda" });
              }
            }
          }
          const snd = child(el, "sound");
          if (snd) handleSound(snd, rel);
          break;
        }

        case "sound":
          handleSound(el, beats(cursor));
          break;

        case "harmony": {
          const h = parseHarmony(el);
          if (h) M.harmony.push({ rel: beats(cursor + numberOf(el, "offset", 0)), ...h });
          break;
        }

        case "barline": {
          const rep = child(el, "repeat");
          if (rep?.attrs.direction === "forward") M.repeatFwd = true;
          else if (rep?.attrs.direction === "backward") {
            M.repeatBwd = { times: attrNumber(rep, "times", 2) };
          }
          const ending = child(el, "ending");
          if (ending) {
            const nums = parseEndingNumbers(ending.attrs.number);
            if (ending.attrs.type === "start") M.endingStart = nums;
            else M.endingStop = nums;
          }
          break;
        }

        default:
          break;
      }
    }

    if (pendingGrace.length) flushGrace(cursor, 0); // abbellimenti "in coda" alla misura
    M.contentEnd = beats(maxCursor);
    measures.push(M);
  }

  return { ...partInfo, declaredStaves, measures };
}

// score-timewise -> stessa forma di score-partwise (misure raggruppate per parte).
function timewiseToPartwise(root) {
  const partsById = new Map();
  for (const m of childrenOf(root, "measure")) {
    for (const p of childrenOf(m, "part")) {
      const id = p.attrs.id;
      if (!partsById.has(id)) partsById.set(id, { name: "part", attrs: { id }, children: [], text: "" });
      partsById.get(id).children.push({ name: "measure", attrs: m.attrs, children: p.children, text: "" });
    }
  }
  return [...partsById.values()];
}

export function musicXmlToScore(root, opts = {}) {
  const warnings = [];
  const counts = {};
  const warn = (message, key) => {
    if (key) {
      counts[key] = (counts[key] ?? 0) + 1;
      if (counts[key] > 1) return; // un solo avviso per tipo
    }
    warnings.push(message);
  };

  if (root.name !== "score-partwise" && root.name !== "score-timewise") {
    throw new Error(
      `Il file non è una partitura MusicXML (elemento radice "${root.name}"). I file .mxl devono contenere score-partwise o score-timewise.`,
    );
  }

  const partNodes =
    root.name === "score-timewise" ? timewiseToPartwise(root) : childrenOf(root, "part");

  const partList = new Map();
  for (const sp of childrenOf(child(root, "part-list"), "score-part")) {
    partList.set(sp.attrs.id, {
      name:
        textOf(sp, "part-name") ||
        textOf(child(sp, "part-name-display"), "display-text") ||
        textOf(child(sp, "score-instrument"), "instrument-name") ||
        "",
      abbreviation: textOf(sp, "part-abbreviation") || null,
    });
  }

  const parts = partNodes.map((p, idx) => {
    const id = p.attrs.id ?? `P${idx + 1}`;
    const info = partList.get(id) ?? { name: "", abbreviation: null };
    return parsePart(p, { id, name: info.name, abbreviation: info.abbreviation }, warn, opts);
  });
  if (!parts.length) throw new Error("La partitura MusicXML non contiene nessuna parte (<part>).");

  const ident = child(root, "identification");
  const creators = childrenOf(ident, "creator");
  const composers = creators
    .filter((c) => (c.attrs.type ?? "").toLowerCase() === "composer" && c.text)
    .map((c) => c.text.replace(/\s+/g, " "));
  const encoding = child(ident, "encoding");

  return {
    title:
      textOf(child(root, "work"), "work-title") ||
      textOf(root, "movement-title") ||
      "",
    movementTitle: textOf(root, "movement-title") || null,
    composers,
    software: textOf(encoding, "software") || null,
    encodingDate: textOf(encoding, "encoding-date") || null,
    version: root.attrs.version ?? null,
    parts,
    warnings,
  };
}
