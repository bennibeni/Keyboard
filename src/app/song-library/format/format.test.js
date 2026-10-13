import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import normalize from "../model/normalizeMusicSeqToCanonical";
import { encodeNotes, decodeNotes, stringifySong, validateSong, SONG_SCHEMA } from "./songSchema.mjs";
import { songToSeq } from "./songToSeq.mjs";
import { convertMusicXml } from "../mxl/index.mjs";
import { readOverrides, catalogKey, parseItalianKey } from "../songs/overrides.mjs";

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

// La libreria è fatta di partiture .mxl in public/mxl/ (vedi scripts/songs.mjs):
// il catalogo deve elencare file esistenti e dati coerenti con la conversione
// che il browser farà davvero (stesse opzioni).
describe("catalogo", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(SONGS, "catalog.json"), "utf8"));
  const SCORES = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../public/mxl");

  it("id univoci e partiture esistenti", () => {
    expect(new Set(catalog.map((e) => e.id)).size).toBe(catalog.length);
    for (const e of catalog) expect(fs.existsSync(path.join(SCORES, e.file))).toBe(true);
  });

  // Le correzioni manuali di public/mxl/catalogo.json prevalgono sulla partitura.
  const overrides = readOverrides(SCORES);

  it("le correzioni di catalogo.json riguardano partiture esistenti e sono valide", () => {
    for (const [file, fix] of Object.entries(overrides)) {
      expect(fs.existsSync(path.join(SCORES, file)), file).toBe(true);
      if (fix.tonalita) expect(() => parseItalianKey(fix.tonalita), file).not.toThrow();
    }
    expect(parseItalianKey("Fa♯ minore")).toEqual({ tonic: "F#", mode: "minor" });
    expect(parseItalianKey("si b maggiore")).toEqual({ tonic: "Bb", mode: "major" });
  });

  it("tonalità, tempo e note del catalogo = quelli della partitura convertita", async () => {
    for (const e of catalog) {
      const song = await convertMusicXml(new Uint8Array(fs.readFileSync(path.join(SCORES, e.file))), {
        fileName: e.file,
        id: e.id,
        label: e.label,
        ...(e.options ?? {}),
      });
      expect(e.key, e.id).toEqual(catalogKey(e.file, song.meta.key, overrides));
      expect(e.bpm, e.id).toBe(song.time.bpm);
      expect(e.notes, e.id).toBe(song.meta.stats.notes);
      expect(validateSong(song).errors, e.id).toEqual([]);
      expect(normalize(songToSeq(song)).events.length, e.id).toBeGreaterThan(0);
    }
  });
});
