// Formato brano "song-canonical@2" (file *.song.json).
//
// Il formato è descritto per intero in src/app/docs/song-format.md; qui ci
// sono le costanti condivise da convertitore, migrazione, adattatore e
// test, più le funzioni di (de)serializzazione e validazione.
//
// Idea di fondo: UNA tabella di note (una riga per nota sonora, già con le
// legature fuse) più sezioni opzionali (battute, tempo/metro/tonalità,
// armonia, testi, segni). Nessuna ridondanza derivabile (nome nota, step,
// alter, ottava, midis, durata evento...): chi consuma deriva ciò che gli
// serve. Le colonne sono dichiarate nel file stesso (`notes.cols`) così si
// possono aggiungere campi senza rompere i lettori esistenti.

export const SONG_SCHEMA = "song-canonical@2";

// Ordine canonico e significato delle colonne della tabella note.
export const NOTE_COLUMNS = {
  t: "inizio, in beat (quarti) dall'inizio del brano ESEGUITO (ritornelli già espansi)",
  d: "durata in beat (legature fuse)",
  m: "altezza MIDI sonante (0-127)",
  s: "staff globale, 1 = rigo più alto della partitura",
  v: "voce (stringa, come nel MusicXML)",
  p: "id della parte (meta.parts[].id)",
  h: "mano: \"RH\" | \"LH\"",
  f: "diteggiatura 1-5",
  vel: "velocity relativa (1 = piena); assente = 1",
  sp: "altezza scritta, es. \"Eb4\" (distingue re# da mib)",
  gain: "suggerimento di mix per la nota/evento (0-1), solo da sorgenti che lo forniscono",
  grp: "gruppo-evento: note con stesso t e stesso grp suonano nello stesso evento del player",
};
export const NOTE_COLUMN_ORDER = Object.keys(NOTE_COLUMNS);

const BEAT_PRECISION = 1e6;
export const roundBeat = (x) => Math.round(x * BEAT_PRECISION) / BEAT_PRECISION;

// Oggetti nota -> { cols, rows } tenendo solo le colonne davvero usate e
// tagliando i null finali di ogni riga.
export function encodeNotes(notes) {
  const used = NOTE_COLUMN_ORDER.filter(
    (c) => c === "t" || c === "d" || c === "m" || notes.some((n) => n[c] != null),
  );
  const rows = notes.map((n) => {
    const row = used.map((c) => (n[c] == null ? null : n[c]));
    while (row.length > 3 && row[row.length - 1] === null) row.pop();
    return row;
  });
  return { cols: used, rows };
}

export function decodeNotes(table) {
  const cols = table?.cols ?? [];
  return (table?.rows ?? []).map((row) => {
    const n = {};
    for (let i = 0; i < cols.length; i += 1) {
      if (row[i] != null) n[cols[i]] = row[i];
    }
    return n;
  });
}

// JSON leggibile e compatto: gli oggetti sono indentati, gli array di soli
// valori semplici stanno su una riga, gli array di righe/oggetti hanno UNA
// RIGA per elemento (una nota, una battuta, una voce di armonia...). Diff
// git sensati e file ~5x più piccoli del pretty-print standard.
function pretty(value, indent) {
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    const flat = value.every((v) => v === null || typeof v !== "object");
    if (flat) return JSON.stringify(value);
    const pad = `${indent}  `;
    return `[\n${value.map((v) => `${pad}${JSON.stringify(v)}`).join(",\n")}\n${indent}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (!entries.length) return "{}";
    const pad = `${indent}  `;
    return `{\n${entries
      .map(([k, v]) => `${pad}${JSON.stringify(k)}: ${pretty(v, pad)}`)
      .join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

export function stringifySong(song) {
  return `${pretty(song, "")}\n`;
}

// Controlli strutturali. Restituisce { errors, warnings }: gli errori
// rendono il file inutilizzabile, i warning segnalano dati sospetti.
export function validateSong(song) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  if (!song || typeof song !== "object") return { errors: ["Il brano non è un oggetto."], warnings };
  if (song.schema !== SONG_SCHEMA) err(`schema atteso "${SONG_SCHEMA}", trovato "${song.schema}".`);
  if (typeof song.meta?.title !== "string" || !song.meta.title) err("meta.title mancante.");
  if (!(song.time?.bpm > 0)) err("time.bpm mancante o non positivo.");
  if (!/^\d+\/\d+$/.test(song.time?.timeSignature ?? "")) err("time.timeSignature non valido (atteso \"N/D\").");

  const cols = song.notes?.cols;
  if (!Array.isArray(cols) || !["t", "d", "m"].every((c) => cols.includes(c))) {
    err("notes.cols deve contenere almeno t, d, m.");
    return { errors, warnings };
  }
  for (const c of cols) if (!(c in NOTE_COLUMNS)) warn(`colonna sconosciuta "${c}" (ignorata dai lettori attuali).`);

  let prevT = -Infinity;
  let outOfOrder = 0;
  (song.notes.rows ?? []).forEach((row, i) => {
    const [t, d, m] = [row[cols.indexOf("t")], row[cols.indexOf("d")], row[cols.indexOf("m")]];
    if (!Number.isFinite(t) || t < 0) err(`nota #${i}: t non valido (${t}).`);
    if (!Number.isFinite(d) || d < 0) err(`nota #${i}: d non valido (${d}).`);
    if (!Number.isInteger(m) || m < 0 || m > 127) err(`nota #${i}: midi fuori range (${m}).`);
    if (d === 0) warn(`nota #${i}: durata zero.`);
    if (t < prevT) outOfOrder += 1;
    prevT = t;
  });
  if (outOfOrder) warn(`${outOfOrder} note non ordinate per t (il lettore le riordina).`);

  let prevBar = -Infinity;
  for (const [i, bar] of (song.bars ?? []).entries()) {
    if (!(bar[1] > 0)) err(`bars[${i}]: lunghezza non positiva.`);
    if (bar[0] < prevBar) err(`bars[${i}]: non in ordine temporale.`);
    prevBar = bar[0];
  }
  return { errors, warnings };
}
