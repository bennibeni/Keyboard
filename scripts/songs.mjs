#!/usr/bin/env node
// Strumenti per la libreria brani (src/app/song-library/songs).
//
//   npm run songs:convert -- <file.mxl|cartella> [opzioni]
//       Converte MusicXML/.mxl in <id>.song.json (formato song-canonical@2)
//       e rigenera il catalogo. Opzioni:
//         --id <id>          id del brano (default: nome file in kebab-case)
//         --label "<testo>"  etichetta nel selettore (default: titolo)
//         --out <cartella>   destinazione (default: songs/)
//         --no-repeats       non espandere ritornelli/D.C./D.S.
//         --dynamics         velocity dalle dinamiche (p, mf, f...)
//         --grace skip       scarta gli abbellimenti
//
//   npm run songs:catalog
//       Rigenera songs/catalog.json dai file *.song.json presenti.
//
//   npm run songs:migrate
//       Una tantum: converte i brani storici elencati in songRegistry.js
//       (*.js / .json nei vari dialetti) in *.song.json, senza cancellare
//       nulla, e rigenera il catalogo mantenendo l'ordine del selettore.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertMusicXml } from "../src/app/song-library/mxl/index.mjs";
import { legacyToSong } from "../src/app/song-library/format/legacyToSong.mjs";
import { stringifySong, validateSong } from "../src/app/song-library/format/songSchema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SONGS_DIR = path.join(ROOT, "src/app/song-library/songs");
const CATALOG = path.join(SONGS_DIR, "catalog.json");
const SUFFIX = ".song.json";

const kebab = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "song";

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--") && ["id", "label", "out", "grace"].includes(key)) {
        args.flags[key] = next;
        i += 1;
      } else args.flags[key] = true;
    } else args._.push(a);
  }
  return args;
}

function readCatalog() {
  try {
    return JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  } catch {
    return [];
  }
}

function rebuildCatalog(dir = SONGS_DIR, preferredOrder = null) {
  const previous = readCatalog();
  const order = preferredOrder ?? previous.map((e) => e.id);
  const entries = new Map();
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(SUFFIX)).sort()) {
    const song = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const id = song.meta?.id ?? f.slice(0, -SUFFIX.length);
    const k = song.meta?.key;
    entries.set(id, {
      id,
      label: song.meta?.label ?? song.meta?.title ?? id,
      file: f,
      key: k?.tonic && k?.mode ? { tonic: k.tonic, mode: k.mode } : null,
      bpm: song.time?.bpm,
      timeSignature: song.time?.timeSignature,
      bars: song.meta?.stats?.bars ?? null,
      notes: song.meta?.stats?.notes ?? null,
      durationBeats: song.meta?.stats?.durationBeats ?? null,
    });
  }
  const sorted = [
    ...order.filter((id) => entries.has(id)).map((id) => entries.get(id)),
    ...[...entries.values()].filter((e) => !order.includes(e.id)),
  ];
  fs.writeFileSync(CATALOG, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`catalog.json: ${sorted.length} brani`);
}

async function convertOne(file, flags, outDir) {
  const bytes = new Uint8Array(fs.readFileSync(file));
  const fileName = path.basename(file);
  const stem = fileName.replace(/\.[^.]+$/, "");
  const id = flags.id ?? kebab(stem);
  const song = await convertMusicXml(bytes, {
    fileName,
    id,
    label: flags.label,
    expandRepeats: !flags["no-repeats"],
    dynamics: !!flags.dynamics,
    grace: flags.grace === "skip" ? "skip" : "auto",
  });
  const { errors } = validateSong(song);
  if (errors.length) throw new Error(`brano non valido: ${errors[0]}`);
  const target = path.join(outDir, `${id}${SUFFIX}`);
  fs.writeFileSync(target, stringifySong(song));
  const s = song.meta.stats;
  console.log(`${fileName} -> ${path.relative(ROOT, target)}  (${s.notes} note, ${s.barsPlayed} battute eseguite, ${(fs.statSync(target).size / 1024).toFixed(0)} KB)`);
  for (const w of song.meta.warnings) console.log(`   avviso: ${w}`);
}

async function cmdConvert(args) {
  if (!args._.length) throw new Error("Uso: songs:convert -- <file.mxl|cartella> [opzioni]");
  const outDir = args.flags.out ? path.resolve(args.flags.out) : SONGS_DIR;
  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const input of args._) {
    const p = path.resolve(input);
    if (fs.statSync(p).isDirectory()) {
      for (const n of fs.readdirSync(p)) if (/\.(mxl|musicxml|xml)$/i.test(n)) files.push(path.join(p, n));
    } else files.push(p);
  }
  if (files.length > 1 && (args.flags.id || args.flags.label)) {
    throw new Error("--id e --label valgono per un solo file.");
  }
  for (const f of files) await convertOne(f, args.flags, outDir);
  if (outDir === SONGS_DIR) rebuildCatalog();
}

function cmdMigrate() {
  const registry = fs.readFileSync(path.join(ROOT, "src/app/song-library/model/songRegistry.js"), "utf8");
  const re = /id:\s*"([^"]+)",\s*label:\s*"([^"]+)"[\s\S]*?import\("\.\.\/songs\/([^"]+)"\)/g;
  const order = [];
  let m;
  while ((m = re.exec(registry))) {
    const [, id, label, stem] = m;
    const candidates = [`${stem}.js`, `${stem}.json`, stem];
    const file = candidates.find((c) => fs.existsSync(path.join(SONGS_DIR, c)) && fs.statSync(path.join(SONGS_DIR, c)).isFile());
    if (!file) throw new Error(`File sorgente non trovato per "${id}" (${stem}).`);
    const text = fs.readFileSync(path.join(SONGS_DIR, file), "utf8");
    const legacy = file.endsWith(".json")
      ? JSON.parse(text)
      : new Function(text.replace(/^export const json =/, "return ").replace(/;\s*$/, ""))();
    const song = legacyToSong(legacy, { id, label });
    const { errors } = validateSong(song);
    if (errors.length) throw new Error(`${id}: ${errors[0]}`);
    const out = stringifySong(song);
    fs.writeFileSync(path.join(SONGS_DIR, `${id}${SUFFIX}`), out);
    console.log(`${file} (${(text.length / 1024).toFixed(0)} KB) -> ${id}${SUFFIX} (${(out.length / 1024).toFixed(0)} KB)`);
    order.push(id);
  }
  rebuildCatalog(SONGS_DIR, order);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "convert") await cmdConvert(parseArgs(rest));
  else if (cmd === "catalog") rebuildCatalog();
  else if (cmd === "migrate") cmdMigrate();
  else throw new Error("Comando sconosciuto. Usa: convert | catalog | migrate.");
} catch (err) {
  console.error(`Errore: ${err.message}`);
  process.exit(1);
}
