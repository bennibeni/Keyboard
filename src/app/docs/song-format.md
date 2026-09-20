# Formato brano `song-canonical@2` — Keyboard

Formato unico dei brani della libreria (`src/app/song-library/songs/*.song.json`)
e dell'output del convertitore MusicXML/.mxl. Sostituisce i "dialetti"
storici di `songs/*.js` (vedi §7). Implementazione di riferimento:
`song-library/format/songSchema.mjs`.

## 1. Perché un nuovo formato

I brani precedenti erano scritti in almeno cinque dialetti (`music-seq@1`,
`song-canonical@1` da MusicXML, `beat-note-objects`, `simple-measures`,
`repeated-chords`, `triplets`, `pattern-notes-value`), pieni di campi
ridondanti (`midis`, `name`, `step`, `alter`, `octave`, `sourceRef`...) che
`normalizeMusicSeqToCanonical` in gran parte scartava comunque. Risultato:
5,4 MB di JavaScript in `songs/` (`child-in-time.js` da solo 907 KB).

`song-canonical@2` è **una tabella di note più sezioni opzionali**:

| Brano | Prima | `.song.json` |
|---|---|---|
| child-in-time | 907 KB | 104 KB |
| k545-movement-1 | 668 KB | 66 KB |
| someone-like-you | 607 KB | 79 KB |
| canon-full | 196 KB | 47 KB |
| 15 brani in totale | ~5,0 MB | ~0,6 MB |

## 2. Struttura del file

```jsonc
{
  "schema": "song-canonical@2",
  "meta":  { ... },                 // identità e provenienza
  "time":  { ... },                 // tempo, metro, tonalità nel tempo
  "bars":  [[t, len, "label", srcIndex], ...],   // opzionale
  "notes": { "cols": [...], "rows": [[...], ...] },
  "harmony":     [...],             // opzionale
  "lyrics":      [...],             // opzionale
  "marks":       [...],             // opzionale
  "annotations": [...]              // opzionale (solo brani migrati)
}
```

**Unità di tempo**: tutti i tempi (`t`, `d`, `bars`, mappe) sono in *beat*,
cioè **quarti di nota** dall'inizio del brano **eseguito**. In 6/8 una battuta
dura 3 beat. I decimali sono arrotondati a 6 cifre.

**Brano eseguito**: se il file nasce da una partitura con ritornelli, volte,
D.C./D.S., la timeline è già *srotolata*: chi legge non deve sapere nulla di
ritornelli. `bars[i][3]` (`srcIndex`) indica quale battuta scritta corrisponde,
quindi un indice ripetuto = una battuta ripetuta.

### 2.1 `meta`

| Campo | Significato |
|---|---|
| `id`, `label` | identità nel catalogo (opzionali; il catalogo ripiega su nome file e titolo) |
| `title`, `composers[]` | |
| `key` | `{tonic, mode, fifths?, raw?, inferred?, confidence?}` oppure `null` se non determinabile (il selettore di tonalità resta disabilitato) |
| `parts[]` | `{id, name, abbreviation?, staves?}` |
| `source` | provenienza (`family`, `format`, `originalFile`, `rootXml`, `software`...). **Letto da `resolveEngineRoute`** per scegliere piano o synth: non rimuovere `family/format/file` dai brani esistenti |
| `stats` | `notes`, `bars`, `barsPlayed`, `durationBeats`... (informativo) |
| `converter` | nome, versione **e opzioni** usate: la conversione è riproducibile |
| `warnings[]` | avvisi di conversione (legature dedotte, tempo assunto...) |
| `extra` | metadati storici non standard (solo brani migrati) |

### 2.2 `time`

```json
{ "bpm": 100, "timeSignature": "4/4", "unit": "quarter",
  "tempoMap": [[0, 100], [64, 80]],       // [t, bpm]  (bpm = quarti/minuto)
  "meterMap": [[0, "4/4"], [80, "2/4"]],  // [t, "N/D"]
  "keyMap":   [[0, "D", "major", 2]] }    // solo se la tonalità cambia
```

`bpm` e `timeSignature` sono i valori iniziali (quelli letti dal player).
`tempoMap` e `meterMap` contengono sempre almeno l'inizio. Il player attuale
usa un solo BPM; le mappe sono lì per quando servirà.

### 2.3 `notes` — la tabella

`cols` elenca le colonne presenti; ogni riga è un array nello stesso ordine,
con i `null` finali omessi. Colonne obbligatorie: `t`, `d`, `m`.

| Col | Significato |
|---|---|
| `t` | inizio (beat) |
| `d` | durata (beat), **legature già fuse**: due note legate = una riga |
| `m` | altezza MIDI *sonante* (strumenti traspositori già corretti) |
| `s` | staff globale, 1 = rigo più alto della partitura (le parti successive proseguono la numerazione) |
| `v` | voce (stringa, come nel MusicXML) |
| `p` | id parte (`meta.parts[].id`) |
| `h` | mano `"RH"`/`"LH"` (solo se dedotta: pianoforte a 2 righi, o nome parte "right/left") |
| `f` | diteggiatura 1–5 (da `<fingering>`) |
| `vel` | velocity relativa, 1 = piena; assente = 1 |
| `sp` | altezza scritta (`"Eb4"`): distingue re♯ da mi♭ |
| `gain` | suggerimento di mix (0–1) da sorgenti che lo forniscono (brani migrati) |
| `grp` | gruppo-evento, vedi sotto |

Le righe sono ordinate per `t`, poi `grp`, poi `m`. **Le colonne si possono
aggiungere** senza rompere i lettori: un lettore ignora ciò che non conosce
(`validateSong` lo segnala solo come warning).

**`grp` (gruppo-evento).** Il player suona "eventi": tutte le note con stesso
`t` e stesso `grp` (default 0) partono insieme, con la stessa scala di
velocity per accordo. I brani MusicXML hanno un solo gruppo per attacco. Le
quattro progressioni scritte a mano avevano un evento per mano allo stesso
istante, e per non cambiarne il suono la migrazione ha conservato questa
separazione con `grp`.

### 2.3 Sezioni opzionali

```jsonc
"harmony": [{ "t": 4, "symbol": "C#m/G#", "root": "C#", "kind": "minor", "bass": "G#" },
            { "t": 0, "symbol": "Cm", "roman": "i" }],   // da <harmony> o dai vecchi symbol/roman
"lyrics":  [{ "t": 0, "verse": "1", "text": "A", "syl": "begin" }],
"marks":   [{ "t": 0, "kind": "words" | "rehearsal" | "segno" | "coda", "text": "Allegro" }],
"annotations": [{ "t": 3, "performanceHint": {...} }]   // campi evento rari dei vecchi brani
```

## 3. Come l'app lo legge

```
*.song.json ──songToSeq──▶ seq grezzo ──normalizeMusicSeqToCanonical──▶ song-canonical@1 ──▶ player
```

`format/songToSeq.mjs` raggruppa le righe in eventi e restituisce lo shape che
il normalizzatore già conosce, quindi **il player, i consumatori
(`buildNoteTimeline`, `resolveChordVoicing`, `analyzeSongChords`...) e
`transposeSeqToKey` non sono stati toccati**. `hand`, `finger`, `spelling` e
`part` viaggiano in `note.meta`; armonia, testi, segni e mappe restano nel file
v2, non ancora nell'oggetto normalizzato (vedi §6).

## 4. Aggiungere un brano

```bash
npm run songs:convert -- percorso/mio-brano.mxl --label "Mio brano"
```

Scrive `songs/mio-brano.song.json`, stampa avvisi e statistiche e rigenera
`songs/catalog.json`, da cui `songRegistry.js` costruisce `SONG_CATALOG`
(id, etichetta, tonalità). **La tonalità non è più duplicata a mano** tra
registry e brano: il catalogo è generato e un test verifica che coincida.
Opzioni: `--id`, `--label`, `--no-repeats`, `--dynamics`, `--grace skip`,
`--out`. Vedi `docs/mxl-conversion.md`.

In alternativa l'utente può trascinare un `.mxl` nel pannello "Import MIDI /
MusicXML" senza toccare il repository (nessuna persistenza, come per i MIDI).

## 5. Versionamento e compatibilità

- Il tag `schema` cambia solo per modifiche **incompatibili** (`@3`).
- Aggiunte compatibili: nuove colonne in `notes.cols`, nuove sezioni
  top-level, nuovi campi in `meta`. I lettori ignorano ciò che non conoscono.
- `converter.version` cambia a ogni modifica del convertitore che può cambiare
  l'output: dopo un aggiornamento importante si può rigenerare un brano dal suo
  `.mxl` originale (che conviene conservare, es. in `song-sources/`, fuori da `src/`).

## 6. Cosa il normalizzatore scarta ancora (non modificato)

`normalizeMusicSeqToCanonical` tiene solo `midi`, `velocity`, `durBeat`,
`staff`, `voice`, `meta` per nota. Restano quindi non visibili al player:
armonia, testi, segni, mappe di tempo/tonalità, `bars` (tranne `bar` e
`beatInBar` in `event.meta`). Nota storica: il normalizzatore converte un
`staff` mancante in `0` (`Number(null)`); `songToSeq` conserva questo
comportamento per non cambiare l'analisi accordi dei brani senza staff.
Per esporre le sezioni v2 basterà far passare `song` (o le sezioni) nell'oggetto
normalizzato: modifica piccola, volutamente non inclusa qui.

## 7. Migrazione dei 15 brani esistenti

Eseguita con `npm run songs:migrate` (`format/legacyToSong.mjs`). Verifica:
il test `format.test.js` confronta, per ogni brano, `normalize(vecchio)` con
`normalize(songToSeq(v2))` su eventi, tempi, midi, velocity, durate, staff,
voce, chiave, parti e sorgente. Risultato: **identici**, con queste sole
differenze intenzionali:

- durate/tempi arrotondati a 6 decimali (es. `0.16666666666666666` → `0.166667`,
  `143.99999999999994` → `144`);
- `durBeat` dell'*evento* = massima durata delle sue note. In `canon-full`
  (dialetto `music-seq`) 238 eventi avevano invece la distanza dal successivo:
  il player usa `durBeat` di evento solo per la tenuta dell'ultimo evento;
- scartati perché ridondanti o senza lettori: `midis`, `step/alter/octave`,
  `sourceRef`, `label` degli eventi, `pitchInventory`, `meta.stats` originali.

I vecchi file `.js` non sono stati cancellati: non sono più importati dal
registry (né inclusi nel bundle) e si possono eliminare quando si è soddisfatti.
`solo-from-lucky-man-in-64-midi-vintage-moog-pro.app-ready.canonical.json` non
era già usato da nessuno.
