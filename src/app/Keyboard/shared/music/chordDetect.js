// src/shared/music/chordDetect.js
//
// Chord-detection engine (template matching over pitch-class intervals).
// Ported as-is from the standalone music.js/midi.js pair; only the import
// path below changed to point at this project's shared/music/midi.js,
// which now exports the small set of primitives this file needs
// (mod12, pcToNameSharp, pcToNameFlat, pcsFromMidis, normalizeMidis).

import {
  pcsFromMidis,
  normalizeMidis,
  pcToNameSharp,
  pcToNameFlat,
  mod12,
} from "./midi";

export function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function sameArray(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function intervalsFromRoot(pcs, rootPc) {
  const r = mod12(rootPc);
  return (pcs || []).map((pc) => mod12(pc - r)).sort((a, b) => a - b);
}

/**
 * Root spelling policy (NOT “always sharp”):
 * - Prefer flats for pcs that user typically writes as flats: Db/Eb/Ab/Bb (1,3,8,10).
 * - Special-case pc 6: use F# for minor-family chords, Gb otherwise.
 * - Naturals unchanged.
 */
function preferFlatsForRootPc(rootPc, tpl) {
  const p = mod12(rootPc);

  // Always flat for these (matches your chord list conventions)
  if (p === 1 || p === 3 || p === 8 || p === 10) return true;

  // F#/Gb: decide by chord family
  if (p === 6) {
    const nm = String(tpl?.name || "");
    const isMinorFamily =
      nm.startsWith("m") ||
      nm.includes("m(") ||
      nm.includes("m7") ||
      nm.includes("m9") ||
      nm.includes("m11") ||
      nm.includes("m13");
    return !isMinorFamily; // minor -> sharp (F#), else -> flat (Gb)
  }

  return false;
}

/** ------------------ templates ------------------ */
const TEMPLATES = [
  {
    key: "5",
    name: "5",
    intervals: [0, 7],
    prio: 390,
    minCovered: 2,
    kind: "dyad",
  },

  {
    key: "maj",
    name: "",
    intervals: [0, 4, 7],
    prio: 400,
    minCovered: 3,
    kind: "triad",
  },
  {
    key: "min",
    name: "m",
    intervals: [0, 3, 7],
    prio: 400,
    minCovered: 3,
    kind: "triad",
  },
  {
    key: "dim",
    name: "dim",
    intervals: [0, 3, 6],
    prio: 380,
    minCovered: 3,
    kind: "triad",
  },
  {
    key: "aug",
    name: "aug",
    intervals: [0, 4, 8],
    prio: 380,
    minCovered: 3,
    kind: "triad",
  },

  {
    key: "sus2",
    name: "sus2",
    intervals: [0, 2, 7],
    prio: 200,
    minCovered: 3,
    kind: "sus",
  },
  {
    key: "sus4",
    name: "sus4",
    intervals: [0, 5, 7],
    prio: 200,
    minCovered: 3,
    kind: "sus",
  },

  {
    key: "add9",
    name: "add9",
    intervals: [0, 2, 4, 7],
    prio: 360,
    minCovered: 4,
    kind: "add",
  },
  {
    key: "m_add9",
    name: "m(add9)",
    intervals: [0, 2, 3, 7],
    prio: 360,
    minCovered: 4,
    kind: "add",
  },

  {
    key: "6",
    name: "6",
    intervals: [0, 4, 7, 9],
    prio: 340,
    minCovered: 4,
    kind: "6",
  },
  {
    key: "m6",
    name: "m6",
    intervals: [0, 3, 7, 9],
    prio: 340,
    minCovered: 4,
    kind: "6",
  },
  {
    key: "69",
    name: "6/9",
    intervals: [0, 2, 4, 7, 9],
    prio: 350,
    minCovered: 5,
    kind: "6",
  },

  {
    key: "6add9_shell",
    name: "6add9",
    intervals: [0, 2, 4, 9],
    prio: 349,
    minCovered: 4,
    kind: "6",
    mustHave: [2, 9],
  },

  {
    key: "maj7",
    name: "maj7",
    intervals: [0, 4, 7, 11],
    prio: 330,
    minCovered: 3,
    kind: "7",
  },
  {
    key: "7",
    name: "7",
    intervals: [0, 4, 7, 10],
    prio: 320,
    minCovered: 3,
    kind: "7",
  },
  {
    key: "m7",
    name: "m7",
    intervals: [0, 3, 7, 10],
    prio: 320,
    minCovered: 3,
    kind: "7",
  },
  {
    key: "7sus4",
    name: "7sus4",
    intervals: [0, 5, 7, 10],
    prio: 325,
    minCovered: 4,
    kind: "7",
  },
  {
    key: "mMaj7",
    name: "m(maj7)",
    intervals: [0, 3, 7, 11],
    prio: 315,
    minCovered: 4,
    kind: "7",
  },
  {
    key: "m7b5",
    name: "m7b5",
    intervals: [0, 3, 6, 10],
    prio: 310,
    minCovered: 4,
    kind: "7",
  },
  {
    key: "dim7",
    name: "dim7",
    intervals: [0, 3, 6, 9],
    prio: 300,
    minCovered: 4,
    kind: "7",
  },

  {
    key: "7_b9",
    name: "7",
    intervals: [0, 1, 4, 7, 10],
    prio: 345,
    minCovered: 4,
    kind: "7",
    forcedLabels: ["b9"],
  },
  {
    key: "7_#9",
    name: "7",
    intervals: [0, 3, 4, 7, 10],
    prio: 345,
    minCovered: 4,
    kind: "7",
    forcedLabels: ["#9"],
  },
  {
    key: "7_b9#9",
    name: "7",
    intervals: [0, 1, 3, 4, 7, 10],
    prio: 346,
    minCovered: 5,
    kind: "7",
    forcedLabels: ["b9", "#9"],
  },

  {
    key: "7_b5",
    name: "7",
    intervals: [0, 4, 6, 10],
    prio: 340,
    minCovered: 4,
    kind: "7",
    forcedLabels: ["b5"],
  },
  {
    key: "7_#5",
    name: "7",
    intervals: [0, 4, 8, 10],
    prio: 340,
    minCovered: 4,
    kind: "7",
    forcedLabels: ["#5"],
  },

  {
    key: "7_b9b5",
    name: "7",
    intervals: [0, 1, 4, 6, 10],
    prio: 347,
    minCovered: 5,
    kind: "7",
    forcedLabels: ["b9", "b5"],
  },
  {
    key: "7_b9#5",
    name: "7",
    intervals: [0, 1, 4, 8, 10],
    prio: 347,
    minCovered: 5,
    kind: "7",
    forcedLabels: ["b9", "#5"],
  },
  {
    key: "7_#9b5",
    name: "7",
    intervals: [0, 3, 4, 6, 10],
    prio: 347,
    minCovered: 5,
    kind: "7",
    forcedLabels: ["#9", "b5"],
  },
  {
    key: "7_#9#5",
    name: "7",
    intervals: [0, 3, 4, 8, 10],
    prio: 347,
    minCovered: 5,
    kind: "7",
    forcedLabels: ["#9", "#5"],
  },

  {
    key: "7_#11",
    name: "7",
    intervals: [0, 4, 6, 7, 10],
    prio: 348,
    minCovered: 5,
    kind: "7",
    mustHave: [6, 7, 10],
    forcedLabels: ["#11"],
  },

  {
    key: "maj7_13",
    name: "maj7",
    intervals: [0, 4, 7, 9, 11],
    prio: 366,
    minCovered: 5,
    kind: "7",
    mustHave: [9, 11],
    forcedLabels: ["13"],
  },

  {
    key: "maj9",
    name: "maj9",
    intervals: [0, 2, 4, 7, 11],
    prio: 365,
    minCovered: 4,
    kind: "9",
    mustHave: [2],
  },
  {
    key: "9",
    name: "9",
    intervals: [0, 2, 4, 7, 10],
    prio: 360,
    minCovered: 4,
    kind: "9",
    mustHave: [2],
  },
  {
    key: "m9",
    name: "m9",
    intervals: [0, 2, 3, 7, 10],
    prio: 360,
    minCovered: 4,
    kind: "9",
    mustHave: [2],
  },

  {
    key: "11_shell",
    name: "11",
    intervals: [0, 2, 4, 5, 10],
    prio: 370,
    minCovered: 4,
    kind: "11",
    mustHave: [5],
  },
  {
    key: "11_full",
    name: "11",
    intervals: [0, 2, 4, 5, 7, 10],
    prio: 371,
    minCovered: 5,
    kind: "11",
    mustHave: [5],
  },
  {
    key: "m11_shell",
    name: "m11",
    intervals: [0, 2, 3, 5, 10],
    prio: 370,
    minCovered: 4,
    kind: "11",
    mustHave: [5],
  },
  {
    key: "m11_full",
    name: "m11",
    intervals: [0, 2, 3, 5, 7, 10],
    prio: 371,
    minCovered: 5,
    kind: "11",
    mustHave: [5],
  },

  {
    key: "13_shell",
    name: "13",
    intervals: [0, 2, 4, 9, 10],
    prio: 372,
    minCovered: 4,
    kind: "13",
    mustHave: [9],
  },
  {
    key: "13_full",
    name: "13",
    intervals: [0, 2, 4, 7, 9, 10],
    prio: 373,
    minCovered: 5,
    kind: "13",
    mustHave: [9],
  },
  {
    key: "m13_shell",
    name: "m13",
    intervals: [0, 2, 3, 9, 10],
    prio: 372,
    minCovered: 4,
    kind: "13",
    mustHave: [9],
  },
  {
    key: "m13_full",
    name: "m13",
    intervals: [0, 2, 3, 7, 9, 10],
    prio: 373,
    minCovered: 5,
    kind: "13",
    mustHave: [9],
  },

  {
    key: "13sus4_shell",
    name: "13sus4",
    intervals: [0, 2, 5, 9, 10],
    prio: 368,
    minCovered: 4,
    kind: "13",
    mustHave: [9],
  },
  {
    key: "13sus4_full",
    name: "13sus4",
    intervals: [0, 2, 5, 7, 9, 10],
    prio: 369,
    minCovered: 5,
    kind: "13",
    mustHave: [9],
  },
];

// after TEMPLATES definition (once)
for (const t of TEMPLATES) t.intervals = [...t.intervals].sort((a, b) => a - b);

function scoreMatch(ints, intsSet, tpl) {
  let covered = 0;
  for (const x of tpl.intervals) if (intsSet.has(x)) covered++;
  const extra = ints.length - covered;
  const exact = sameArray(ints, tpl.intervals);
  const raw = (exact ? 1000 : 0) + covered * 10 - extra * 2;
  return { raw, covered, extra, exact };
}

function isDominantFamilyTpl(tpl) {
  // Plain dominant chords: kind is 7/9/11/13 and the base name is the
  // unmodified dominant spelling (not a minor "m..." or major "maj..." variant).
  if (!["7", "9", "11", "13"].includes(tpl?.kind)) return false;
  const nm = String(tpl?.name || "");
  return !nm.startsWith("m") && !nm.startsWith("maj");
}

function intervalToExtLabelForTpl(x, tpl) {
  const isDom = isDominantFamilyTpl(tpl);
  if (x === 1) return "b9";
  if (x === 2) return "9";
  if (x === 3) return "#9";
  if (x === 5) return "11";
  if (x === 6) return isDom ? "b5" : "#11";
  if (x === 8) return isDom ? "#5" : "b13";
  if (x === 9) return "13";
  return null;
}

// NEW: opts support
function resolvePreferFlats(rootPc, tpl, opts) {
  if (opts?.preferFlats === true) return true;
  if (opts?.preferFlats === false) return false;
  return preferFlatsForRootPc(rootPc, tpl);
}

function buildSymbol({ rootPc, bassPc, pcs, ints, tpl, opts }) {
  const preferFlats = resolvePreferFlats(rootPc, tpl, opts);

  const rootName = preferFlats ? pcToNameFlat(rootPc) : pcToNameSharp(rootPc);

  const intsSet = new Set(ints);
  const has5InTemplate = tpl.intervals.includes(7);

  const forced = Array.isArray(tpl.forcedLabels)
    ? tpl.forcedLabels.slice()
    : [];

  // Extra-interval labels beyond template
  const extLabels = [];
  for (const x of ints) {
    if (x === 0) continue;
    if (tpl.intervals.includes(x)) continue;
    const lab = intervalToExtLabelForTpl(x, tpl);
    if (lab) extLabels.push(lab);
  }

  // “7alt” heuristic (only for dominant 7-family)
  const allMods = forced.concat(extLabels);
  const hasAltered9 = allMods.includes("b9") || allMods.includes("#9");
  const hasAltered5 = allMods.includes("b5") || allMods.includes("#5");
  const hasNat9 = allMods.includes("9");
  const has11 = allMods.includes("11");
  const has13 = allMods.includes("13");

  const isDominant7Family = tpl.kind === "7" && tpl.name === "7";
  const makeAlt =
    isDominant7Family &&
    (hasAltered9 || hasAltered5) &&
    hasAltered9 &&
    !hasNat9 &&
    !has11 &&
    !has13;

  const baseName = makeAlt ? "7alt" : tpl.name;
  let symbol = `${rootName}${baseName}`;

  // "(no5)" rule
  // Always flag a missing 5th when the template expects one, regardless of
  // kind or whether other mods are present (kept consistent across 6/add/7/9/11/13).
  const missing5 = has5InTemplate && !intsSet.has(7);
  if (missing5) {
    if (
      tpl.kind === "7" ||
      tpl.kind === "9" ||
      tpl.kind === "11" ||
      tpl.kind === "13" ||
      tpl.kind === "6" ||
      tpl.kind === "add"
    ) {
      allMods.unshift("no5");
    }
  }

  // De-dupe mods
  const seen = new Set();
  const mods = [];
  for (const m of allMods) {
    if (!m) continue;
    if (seen.has(m)) continue;
    seen.add(m);
    mods.push(m);
  }
  if (mods.length) symbol += `(${mods.join(",")})`;

  // Slash bass always flats — but allow opt-out
  // (bassPc is guaranteed to be a member of pcs, since both are derived
  // from the same normalized midi list — no need to re-check membership.)
  const showSlashBass = opts?.showSlashBass !== false;
  if (showSlashBass && bassPc != null && mod12(bassPc) !== mod12(rootPc)) {
    symbol += `/${pcToNameFlat(bassPc)}`;
  }

  return symbol;
}

// NEW: opts support at API level
/**
 * detectChordFromMidis(midisIn, opts?)
 * -----------------------------------
 * Chord detection from MIDI numbers (order/dupes allowed).
 *
 * Pipeline:
 *  1) midisSorted = normalizeMidis(midisIn)   // uniq + ascending
 *  2) pcs = pcsFromMidis(midisSorted)         // unique pitch classes
 *  3) bassPc = midisSorted[0] mod 12 (or null if empty)
 *  4) Rooted template search:
 *      - Try each rootPc in pcs
 *      - Compute intervalsFromRoot(pcs, rootPc)
 *      - For each template in TEMPLATES:
 *          * enforce tpl.mustHave (all intervals must appear)
 *          * scoreMatch() -> { raw, covered, extra, exact }
 *          * require covered >= (tpl.minCovered ?? tpl.intervals.length)
 *      - Select best candidate by:
 *          (1) higher raw score
 *          (2) prefer rootPc == bassPc when tied
 *          (3) higher tpl.prio when tied
 *          (4) deterministic tie-break: smaller rootPc
 *  5) strong heuristic:
 *      - exact match OR
 *      - full coverage with <=1 extra OR
 *  6) symbol = buildSymbol({ ...best, opts })
 *
 * Returns:
 *   { symbol, strong, rootPc, bassPc, pcs }
 *
 * Notes:
 *  - This engine is pitch-class based; octave/voicing only affects bassPc.
 *  - opts is forwarded to buildSymbol() (formatting/slash policy/etc).
 */

export function detectChordFromMidis(midisIn, opts = {}) {
  const midisSorted = normalizeMidis(midisIn); // uniq + sort
  const pcs = pcsFromMidis(midisSorted);
  if (!pcs.length) return { symbol: "—", strong: false, pcs: [], bassPc: null };

  const bassPc = midisSorted.length ? mod12(midisSorted[0]) : null;

  let best = null;

  for (const rootPc of pcs) {
    const ints = intervalsFromRoot(pcs, rootPc);
    const intsSet = new Set(ints);

    for (const tpl of TEMPLATES) {
      if (tpl.mustHave && !tpl.mustHave.every((x) => intsSet.has(x))) continue;

      const { raw, covered, extra, exact } = scoreMatch(ints, intsSet, tpl);
      if (covered < (tpl.minCovered ?? tpl.intervals.length)) continue;

      const cand = {
        raw,
        covered,
        extra,
        exact,
        tpl,
        rootPc,
        bassPc,
        pcs,
        ints,
      };

      if (!best) {
        best = cand;
        continue;
      }

      // (1) higher raw
      if (cand.raw > best.raw) {
        best = cand;
        continue;
      }
      if (cand.raw < best.raw) continue;

      // (2) prefer root == bass
      const candRootIsBass =
        bassPc != null && mod12(cand.rootPc) === mod12(bassPc);
      const bestRootIsBass =
        bassPc != null && mod12(best.rootPc) === mod12(bassPc);
      if (candRootIsBass && !bestRootIsBass) {
        best = cand;
        continue;
      }
      if (!candRootIsBass && bestRootIsBass) continue;

      // (3) higher template priority
      const prA = cand.tpl.prio ?? 0;
      const prB = best.tpl.prio ?? 0;
      if (prA > prB) {
        best = cand;
        continue;
      }
      if (prA < prB) continue;

      // (4) deterministic final: smaller root pc
      if (cand.rootPc < best.rootPc) best = cand;
      // NOTE: if raw, root==bass status, prio, AND rootPc are all still tied,
      // this loop implicitly keeps whichever candidate was found first, which
      // is governed purely by TEMPLATES array order. That's deterministic but
      // fragile — reordering TEMPLATES could silently change output for such
      // ties. No known real-world case hits this today.
    }
  }

  if (!best) return { symbol: "—", strong: false, bassPc, pcs, kind: null };

  const strong =
    best.exact ||
    (best.covered === best.tpl.intervals.length && best.extra <= 1);

  const symbol = buildSymbol({ ...best, opts });
  return {
    symbol,
    strong,
    rootPc: best.rootPc,
    bassPc: best.bassPc,
    pcs,
    kind: best.tpl.kind,
  };
}

/**
 * chordNameFromMidis(midisIn, opts?)
 * Convenience wrapper around detectChordFromMidis():
 * - returns ONLY the symbol string (e.g. "DbMaj7#11", "G7alt", "—")
 * - opts are forwarded (preferFlats/showSlashBass/etc.)
 */
export function chordNameFromMidis(midisIn, opts = {}) {
  return detectChordFromMidis(midisIn, opts)?.symbol ?? "—";
}
