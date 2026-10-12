#!/usr/bin/env node
// Strumenti per la libreria brani. I brani sono partiture MusicXML compresse
// (.mxl) in public/mxl/, convertite nel browser al momento della scelta
// (song-library/mxl, vedi docs/song-format.md). Il catalogo
// src/app/song-library/songs/catalog.json ne elenca ordine, etichette e
// opzioni di conversione, più alcuni dati ricavati dalla partitura
// (tonalità, tempo, metro...) che servono prima di caricare il brano.
//
//   npm run songs:add -- <file.mxl> [--id <id>] [--label "<testo>"] [--no-repeats] [--dynamics] [--grace skip]
//       Copia la partitura in public/mxl/ e la aggiunge (o aggiorna) nel catalogo.
//         --id          id del brano (default: nome file in kebab-case)
//         --label       etichetta nel selettore (default: titolo della partitura)
//         --no-repeats  non eseguire ritornelli/D.C./D.S.
//         --dynamics    velocity dalle dinamiche (p, mf, f...)
//         --grace skip  scarta gli abbellimenti
//
//   npm run songs:catalog
//       Rilegge tutte le partiture del catalogo e ne aggiorna i dati ricavati;
//       aggiunge in fondo i .mxl presenti in public/mxl/ ma non ancora elencati.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertMusicXml } from "../src/app/song-library/mxl/index.mjs";
import { validateSong } from "../src/app/song-library/format/songSchema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCORES_DIR = path.join(ROOT, "public/mxl");
const CATALOG = path.join(ROOT, "src/app/song-library/songs/catalog.json");
const SCORE_RE = /\.(mxl|musicxml|xml)$/i;

const kebab = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "song";

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--") && ["id", "label", "grace"].includes(key)) {
        args.flags[key] = next;
        i += 1;
      } else args.flags[key] = true;
    } else args._.push(a);
  }
  return args;
}

const readCatalog = () => {
  try {
    return JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  } catch {
    return [];
  }
};

// Converte la partitura con le opzioni del brano: stessa chiamata che fa il browser.
export async function convertEntry(entry, scoresDir = SCORES_DIR) {
  const bytes = new Uint8Array(fs.readFileSync(path.join(scoresDir, entry.file)));
  return convertMusicXml(bytes, { fileName: entry.file, id: entry.id, label: entry.label, ...(entry.options ?? {}) });
}

async function describe(entry) {
  const song = await convertEntry(entry);
  const { errors } = validateSong(song);
  if (errors.length) throw new Error(`${entry.file}: brano non valido: ${errors[0]}`);
  const k = song.meta?.key;
  const s = song.meta?.stats ?? {};
  return {
    id: entry.id,
    label: entry.label ?? song.meta?.title ?? entry.id,
    file: entry.file,
    ...(entry.options && Object.keys(entry.options).length ? { options: entry.options } : {}),
    key: k?.tonic && k?.mode ? { tonic: k.tonic, mode: k.mode } : null,
    bpm: song.time?.bpm,
    timeSignature: song.time?.timeSignature,
    bars: s.barsPlayed ?? s.bars ?? null,
    notes: s.notes ?? null,
    durationBeats: s.durationBeats ?? null,
    warnings: song.meta?.warnings?.length ? song.meta.warnings : undefined,
  };
}

async function rebuildCatalog(entries = readCatalog()) {
  const listed = new Set(entries.map((e) => e.file));
  const extra = fs
    .readdirSync(SCORES_DIR)
    .filter((f) => SCORE_RE.test(f) && !listed.has(f))
    .sort()
    .map((f) => ({ id: kebab(f.replace(SCORE_RE, "")), file: f }));
  const out = [];
  for (const e of [...entries, ...extra]) {
    if (!fs.existsSync(path.join(SCORES_DIR, e.file))) {
      console.warn(`  manca public/mxl/${e.file}: "${e.id}" tolto dal catalogo`);
      continue;
    }
    const d = await describe(e);
    out.push(d);
    console.log(`  ${d.id.padEnd(36)} ${String(d.notes).padStart(5)} note  ${String(d.bars).padStart(4)} battute  ${d.key ? `${d.key.tonic} ${d.key.mode}` : "tonalità ?"}`);
    for (const w of d.warnings ?? []) console.log(`     avviso: ${w}`);
  }
  if (new Set(out.map((e) => e.id)).size !== out.length) throw new Error("id duplicati nel catalogo");
  fs.writeFileSync(CATALOG, `${JSON.stringify(out.map(({ warnings, ...e }) => e), null, 2)}\n`);
  console.log(`catalog.json: ${out.length} brani`);
}

async function cmdAdd(args) {
  if (args._.length !== 1) throw new Error("Uso: songs:add -- <file.mxl> [--id x] [--label y] [--no-repeats] [--dynamics] [--grace skip]");
  const src = path.resolve(args._[0]);
  const file = path.basename(src);
  fs.mkdirSync(SCORES_DIR, { recursive: true });
  if (path.resolve(SCORES_DIR, file) !== src) fs.copyFileSync(src, path.join(SCORES_DIR, file));
  const options = {};
  if (args.flags["no-repeats"]) options.expandRepeats = false;
  if (args.flags.dynamics) options.dynamics = true;
  if (args.flags.grace === "skip") options.grace = "skip";
  const entries = readCatalog();
  const id = args.flags.id ?? entries.find((e) => e.file === file)?.id ?? kebab(file.replace(SCORE_RE, ""));
  const entry = { id, file, ...(args.flags.label ? { label: args.flags.label } : {}), ...(Object.keys(options).length ? { options } : {}) };
  const i = entries.findIndex((e) => e.id === id);
  if (i >= 0) entries[i] = { ...entries[i], ...entry, label: entry.label ?? entries[i].label };
  else entries.push(entry);
  console.log(`${file} -> public/mxl/${file} (id "${id}")`);
  await rebuildCatalog(entries);
}

const [cmd, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const commands = { add: cmdAdd, catalog: () => rebuildCatalog() };
if (!commands[cmd]) {
  console.error(`Comandi: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}
commands[cmd](args).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
