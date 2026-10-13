#!/usr/bin/env node
// Estrae il testo MusicXML da partiture compresse (.mxl = archivio ZIP), per
// poterlo leggere o confrontare in VS Code. Usa lo stesso lettore dell'app
// (song-library/mxl/readContainer.mjs).
//
//   npm run mxl:extract -- <file.mxl> [altri file...]
//   npm run mxl:extract -- --all              tutte le partiture di public/mxl/
//   npm run mxl:extract -- <file> --out <cartella>
//
// Un nome senza percorso viene cercato prima nella cartella corrente, poi in
// public/mxl/. L'XML viene scritto in mxl-xml/<nome>.musicxml (cartella
// ignorata da git), indentato se il file originale ha righe lunghe (più
// elementi per riga).
// Le partiture originali non vengono modificate.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractMusicXml } from "../src/app/song-library/mxl/readContainer.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCORES_DIR = path.join(ROOT, "public/mxl");
const SCORE_RE = /\.(mxl|musicxml|xml)$/i;

// Indentazione minima: un elemento per riga, testo e commenti lasciati come sono.
// Si applica solo se il file ha righe oltre i 200 caratteri (MuseScore impagina
// già, i file generati da scripts/song-to-musicxml.mjs no).
export function prettyXml(xml) {
  const longest = Math.max(...xml.split("\n").map((l) => l.length));
  if (longest <= 200) return xml.endsWith("\n") ? xml : `${xml}\n`;
  const tokens = xml.replace(/>\s+</g, "><").match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>|[^<]+/g) ?? [];
  const out = [];
  let depth = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    const pad = "  ".repeat(depth);
    if (/^<\//.test(t)) {
      depth = Math.max(0, depth - 1);
      out.push("  ".repeat(depth) + t);
    } else if (/^<[^!?/][^>]*[^/]>$|^<[^!?/]>$/.test(t)) {
      // <tag>testo</tag> sulla stessa riga
      const text = tokens[i + 1];
      const close = tokens[i + 2];
      if (text && !text.startsWith("<") && close && /^<\//.test(close)) {
        out.push(pad + t + text + close);
        i += 2;
      } else {
        out.push(pad + t);
        depth += 1;
      }
    } else {
      out.push(pad + t.trim());
    }
  }
  return `${out.join("\n")}\n`;
}

function parseArgs(argv) {
  const args = { files: [], all: false, out: path.join(ROOT, "mxl-xml") };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--all") args.all = true;
    else if (argv[i] === "--out") args.out = path.resolve(argv[++i] ?? "");
    else args.files.push(argv[i]);
  }
  return args;
}

function resolveInput(name) {
  for (const p of [path.resolve(name), path.join(SCORES_DIR, name)]) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  throw new Error(`file non trovato: ${name} (cercato anche in public/mxl/)`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputs = args.all
    ? fs.readdirSync(SCORES_DIR).filter((f) => SCORE_RE.test(f)).sort().map((f) => path.join(SCORES_DIR, f))
    : args.files.map(resolveInput);
  if (!inputs.length) {
    console.error("Uso: npm run mxl:extract -- <file.mxl> [altri...] | --all [--out <cartella>]");
    process.exit(1);
  }
  fs.mkdirSync(args.out, { recursive: true });
  for (const file of inputs) {
    const { xml, container } = await extractMusicXml(new Uint8Array(fs.readFileSync(file)));
    const target = path.join(args.out, `${path.basename(file).replace(SCORE_RE, "")}.musicxml`);
    fs.writeFileSync(target, prettyXml(xml));
    const inside = container.rootFile ? ` (dentro l'archivio: ${container.rootFile})` : "";
    console.log(`${path.relative(ROOT, file)} -> ${path.relative(ROOT, target)}${inside}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
