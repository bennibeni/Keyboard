// Correzioni manuali alla libreria: public/mxl/catalogo.json (lo stesso file
// letto da R25 di Next13). Per ora Keyboard ne usa solo "tonalita", che
// sostituisce la tonalità dedotta dalla partitura quando non è quella voluta:
//   { "lucky-man.mxl": { "tonalita": "Sol maggiore" } }
// Formato: tonica italiana (Do, Re, Mi, Fa, Sol, La, Si, con ♯/# o ♭/b) + maggiore/minore.
// Usato da scripts/songs.mjs (rigenerazione del catalogo) e dai test.

import fs from "node:fs";
import path from "node:path";

export const OVERRIDES_FILE = "catalogo.json";

export function readOverrides(scoresDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(scoresDir, OVERRIDES_FILE), "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") console.warn(`  ${OVERRIDES_FILE} non leggibile, ignorato: ${e.message}`);
    return {};
  }
}

// "Sol maggiore" -> { tonic: "G", mode: "major" };  "Fa♯ minore" -> { tonic: "F#", mode: "minor" }
const IT_TONIC = { do: "C", re: "D", mi: "E", fa: "F", sol: "G", la: "A", si: "B" };
export function parseItalianKey(s) {
  const m = String(s).trim().match(/^(do|re|mi|fa|sol|la|si)\s*(♯|#|♭|b)?\s+(maggiore|minore)$/i);
  if (!m) throw new Error(`tonalità non riconosciuta: "${s}" (esempio: "Sol maggiore", "Fa♯ minore")`);
  const acc = m[2] === "♯" || m[2] === "#" ? "#" : m[2] ? "b" : "";
  return { tonic: IT_TONIC[m[1].toLowerCase()] + acc, mode: m[3].toLowerCase() === "minore" ? "minor" : "major" };
}

// Tonalità di un brano: quella fissata in catalogo.json, altrimenti quella
// dedotta dalla partitura convertita (song.meta.key).
export function catalogKey(file, songKey, overrides) {
  const fixed = overrides[file]?.tonalita;
  if (fixed) return parseItalianKey(fixed);
  return songKey?.tonic && songKey?.mode ? { tonic: songKey.tonic, mode: songKey.mode } : null;
}
