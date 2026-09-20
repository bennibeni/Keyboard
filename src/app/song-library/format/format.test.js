import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import normalize from "../model/normalizeMusicSeqToCanonical";
import { encodeNotes, decodeNotes, stringifySong, validateSong, SONG_SCHEMA } from "./songSchema.mjs";
import { songToSeq } from "./songToSeq.mjs";
import { legacyToSong } from "./legacyToSong.mjs";

const SONGS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../songs");

describe("songSchema", () => {
  it("encodeNotes tiene solo le colonne usate e taglia i null finali", () => {
    const t = encodeNotes([{ t: 0, d: 1, m: 60, s: 1 }, { t: 1, d: 1, m: 62 }]);
    expect(t.cols).toEqual(["t", "d", "m", "s"]);
    expect(t.rows).toEqual([[0, 1, 60, 1], [1, 1, 62]]);
    expect(decodeNotes(t)).toEqual([{ t: 0, d: 1, m: 60, s: 1 }, { t: 1, d: 1, m: 62 }]);
  });

  it("stringifySong produce JSON valido, una riga per nota", () => {
    const song = {
      schema: SONG_SCHEMA,
      meta: { title: "x" },
      time: { bpm: 100, timeSignature: "4/4", tempoMap: [[0, 100]] },
      notes: encodeNotes([{ t: 0, d: 1, m: 60 }, { t: 1, d: 1, m: 62 }]),
    };
    const text = stringifySong(song);
    expect(JSON.parse(text)).toEqual(song);
    expect(text).toContain("\n      [1,1,62]");
  });

  it("validateSong segnala schema, midi e ordine sbagliati", () => {
    const bad = {
      schema: "x",
      meta: { title: "t" },
      time: { bpm: 100, timeSignature: "4/4" },
      notes: { cols: ["t", "d", "m"], rows: [[1, 1, 60], [0, 1, 200]] },
    };
    const { errors, warnings } = validateSong(bad);
    expect(errors.join(" ")).toMatch(/schema atteso/);
    expect(errors.join(" ")).toMatch(/midi fuori range/);
    expect(warnings.join(" ")).toMatch(/non ordinate/);
  });
});

describe("songToSeq", () => {
  it("raggruppa per (t, grp) e ricava bar/beatInBar", () => {
    const song = {
      schema: SONG_SCHEMA,
      meta: { title: "x" },
      time: { bpm: 90, timeSignature: "3/4", meterMap: [[0, "3/4"], [6, "4/4"]] },
      bars: [[0, 3, "1", 0], [3, 3, "2", 1]],
      notes: encodeNotes([
        { t: 0, d: 2, m: 60, s: 2 },
        { t: 0, d: 1, m: 64, s: 1 },
        { t: 4, d: 1, m: 67, grp: 1 },
        { t: 4, d: 1, m: 55 },
      ]),
    };
    const seq = songToSeq(song);
    expect(seq.events).toHaveLength(3);
    expect(seq.events[0]).toMatchObject({ tBeat: 0, durBeat: 2, bar: 1, beatInBar: 0 });
    expect(seq.events[1]).toMatchObject({ tBeat: 4, bar: 2, beatInBar: 1 });
    expect(seq.time.timeChanges).toEqual([{ tBeat: 0, timeSignature: "3/4" }, { tBeat: 6, timeSignature: "4/4" }]);
    const canonical = normalize(seq);
    expect(canonical.events[0].midis).toEqual([60, 64]);
  });
});

const legacyFiles = {
  "canon-full": "canon-in-d_music-seq.js",
  "take-five": "take-five-dave-brubeck.js",
  "progressione-02": "progressione-i-bVI-iv-V-02.canonical.js",
  "amazing-grace": "amazing-grace.js",
  "k545-movement-3": "k545-movement-3.js",
  "someone-like-you": "someone-like-you-easy-piano.canonical.js",
  "lucky-man-vintage-moog-pro": "lucky-man-vintage-moog-pro.js",
};

const project = (seq) => ({
  key: seq.meta.key,
  parts: seq.meta.parts,
  bpm: seq.time.bpm,
  timeSignature: seq.time.timeSignature,
  events: seq.events.map((e) => ({
    t: Math.round(e.tBeat * 1e4) / 1e4,
    midis: e.midis,
    notes: e.notes.map((n) => [n.midi, n.velocity, Math.round(n.durBeat * 1e4) / 1e4, n.staff, n.voice]),
  })),
});

// I brani storici restano nel repo finché non vengono cancellati a mano:
// se mancano, questi controlli di parità semplicemente non girano.
describe("migrazione dai vecchi file (parità dopo normalizzazione)", () => {
  for (const [id, file] of Object.entries(legacyFiles)) {
    const full = path.join(SONGS, file);
    it.skipIf(!fs.existsSync(full))(`${id}: eventi e note identici`, () => {
      const legacy = new Function(
        fs.readFileSync(full, "utf8").replace(/^export const json =/, "return ").replace(/;\s*$/, ""),
      )();
      const migrated = JSON.parse(stringifySong(legacyToSong(legacy, { id })));
      expect(validateSong(migrated).errors).toEqual([]);
      expect(project(normalize(songToSeq(migrated)))).toEqual(project(normalize(legacy)));
    });
  }
});

describe("catalogo", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(SONGS, "catalog.json"), "utf8"));

  it("id univoci e file esistenti", () => {
    expect(new Set(catalog.map((e) => e.id)).size).toBe(catalog.length);
    for (const e of catalog) expect(fs.existsSync(path.join(SONGS, e.file))).toBe(true);
  });

  it("tonalità del catalogo = tonalità del brano (nessuna duplicazione a mano)", () => {
    for (const e of catalog) {
      const song = JSON.parse(fs.readFileSync(path.join(SONGS, e.file), "utf8"));
      const k = song.meta.key;
      expect(e.key).toEqual(k?.tonic && k?.mode ? { tonic: k.tonic, mode: k.mode } : null);
      expect(validateSong(song).errors).toEqual([]);
    }
  });
});
