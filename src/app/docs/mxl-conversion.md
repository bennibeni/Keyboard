# Conversione MusicXML / `.mxl` → `song-canonical@2`

Convertitore scritto da zero, **senza dipendenze npm**, in
`src/app/song-library/mxl/`. Gira identico nel browser (import diretto di un
`.mxl` dal pannello "Import MIDI / MusicXML") e in Node (`npm run songs:convert`,
test). Segue la stessa filosofia di `parseMidiFile.js`.

Il convertitore che aveva prodotto i vecchi `songs/*.js` non era nel repository:
questa versione lo **ricostruisce dai risultati** (i campi di `musicxml-mxl`
di `passacaglia` e `someone-like-you`: `harmonyTimeline`, `timeChanges`,
`keyChanges`, legature fuse, `hand` da staff) e lo migliora dove indicato.

## 1. Pipeline

```
byte ──readContainer──▶ XML ──xmlMini──▶ albero ──musicXmlToScore──▶ Score ──scoreToSong──▶ song v2
       (ZIP/XML/UTF-16)                   (fase 1: lettura fedele)     (fase 2: decisioni musicali)
```

| File | Ruolo |
|---|---|
| `zipReader.mjs` | ZIP minimale (stored + deflate via `DecompressionStream("deflate-raw")`) |
| `readContainer.mjs` | riconosce ZIP/XML **dal contenuto**, segue `META-INF/container.xml`, gestisce UTF-16 |
| `xmlMini.mjs` | tokenizer XML (entità, CDATA, DOCTYPE, commenti) |
| `musicXmlToScore.mjs` | **fase 1**: misure/parti/note con offset relativi alla misura, nessuna decisione |
| `expandRepeats.mjs` | ordine di esecuzione (funzione pura, testata a parte) |
| `keys.mjs` | tonalità da armatura, modo con Krumhansl-Kessler |
| `scoreToSong.mjs` | **fase 2**: timeline eseguita, legature, abbellimenti, mappe, codifica |
| `index.mjs` | `convertMusicXml(input, opzioni)` |

Separare le fasi serve a una cosa concreta: gli offset restano *relativi alla
misura*, così la stessa misura può essere emessa più volte (ritornelli) senza
rileggere il file.

## 2. Convenzioni MusicXML rispettate

Durate in `divisions` per quarto (cambiabili misura per misura); `<chord/>`
non avanza il cursore; `<backup>`/`<forward>` per le voci; `<grace/>` senza
durata; `<tie>` e `<tied>` uniti (alcuni esportatori ne scrivono uno solo);
`<transpose>` sommato per ottenere l'altezza sonante; `<octave-shift>` **non**
compensato (`<pitch>` è già reale); metri additivi (`3+2/8`); `score-timewise`
convertito a partwise; percussioni ignorate con avviso.

## 3. Decisioni musicali

| Tema | Regola | Perché |
|---|---|---|
| **Lunghezza misura** | vale il contenuto reale (max tra le parti); vuota → metro nominale; entro 0,1 beat dal nominale → nominale | anacrusi e misure spezzate da ritornelli sono spesso non marcate `implicit`; la tolleranza assorbe l'arrotondamento delle terzine (Finale: 0,08 beat di deriva dopo 56 misure) |
| **Parti sincronizzate** | una sola timeline; le parti che divergono si allineano alla misura più lunga | alcuni export (Sibelius/Dolet) hanno parti con misure di lunghezze diverse; music21 le lascia sfasate |
| **Legature** | una riga per catena; adiacenza con tolleranza 0,1 beat; si fonde per altezza anche verso un accordo | |
| **Legature senza `stop`** | se il file ha ≥ metà `start` senza `stop`, la nota adiacente alla stessa altezza è la continuazione | Dolet scrive solo gli inizi; il controllo globale evita di fondere note ribattute in file corretti |
| **Ritornelli** | `\|: :\|` con `times`; volte 1/2/3…; D.C., D.S., Segno, To Coda, Coda, Fine | il player suona una lista lineare: srotolare è l'unico modo di non "tagliare" il brano |
| **Dopo D.C./D.S.** | niente ritornelli; dove ci sono volte, si suona l'ultima | convenzione standard di lettura |
| **Abbellimenti** | acciaccatura (`slash`) *prima* del battere; appoggiatura *sul* battere, ruba tempo alla principale; 1/8 di beat per nota, mai più di metà principale; `steal-time-*` rispettati; `--grace skip` li scarta | l'esportatore non li espande in durata |
| **Tempo** | `<sound tempo>` prevale su `<metronome>` (convertito in quarti/min, anche puntato); il primo tempo dichiarato vale anche per l'inizio; assente → 120 con avviso | 120 è il default di `parseMidiFile` e del normalizzatore |
| **Tonalità** | `fifths` + `mode`; se `mode` manca: KK su relativa maggiore/minore, marcato `inferred` con `confidence` | con 2 soli candidati è molto più stabile del key-finding a 24 tonalità (sostituisce il "primo accordo" usato per la Passacaglia) |
| **Staff e mano** | `s` = rigo globale; `h` = RH/LH solo se parte a 2 righi o nome "right/left" | il normalizzatore conserva `staff` e non `hand`: con uno staff globale l'analisi accordi riconosce la mano sinistra anche in partiture a più parti |
| **Dinamiche** | `--dynamics`: `p…ff` → velocity (f = 1,0). Default: spente | il player ha già accenti per battuta; scalare anche per dinamica cambia il suono dei brani esistenti |
| **Armonia** | `<harmony>` → simbolo normalizzato (`Cm7/Bb`); `kind` noto da tabella | |

## 4. Non supportato (per ora)

Pedale, `wedge` (cresc./dim.), rampe di tempo (rit./accel.), espansione di
abbellimenti scritti come segni (mordenti, trilli, gruppetti: `<ornaments>`),
arpeggi, tremoli, note `cue` (ignorate), microtoni (arrotondati al semitono,
con avviso), `transpose` per singolo rigo, misure multi-pausa, percussioni.
Tutti additivi: nuove colonne o sezioni, senza cambiare `@2`.

## 5. Verifica

**Robustezza.** 653 di 654 file `.mxl/.xml/.musicxml` del corpus di music21
(Bach, Beethoven, Mozart, Haydn, Schubert, Schumann, Joplin...) si convertono
e superano `validateSong`; l'unico rifiuto è una partitura solo-percussioni
("nessuna nota suonabile"). ~9 s in totale.

**Confronto con music21** (tempo, altezza, durata di ogni nota, senza
ritornelli): su 26 partiture reali, 18 coincidono al 100%. Le altre 8 differiscono per
motivi individuati, non per errori di posizione:
- file Finale con `<duration>` incoerente col tipo di nota (Lindenbaum): il
  convertitore segue `<duration>`, music21 il tipo;
- legature verso un accordo di altezze diverse, o catene di legature: il
  convertitore fonde per altezza, music21 non sempre (in Schoenberg op.19/6
  music21 lascia 16 note legate non fuse; la causa esatta non è stata
  approfondita, il file dichiara 35 `<tie stop>`).

Nei quartetti dove music21 stesso ha le parti sfasate (Beethoven op.18/59,
Haydn op.74, Mozart K.458/4, Weber) il confronto non è significativo: il
convertitore usa una timeline comune (§3).

**Ritornelli.** Non c'è un oracolo affidabile: nel confronto fatto, music21
non ripeteva la prima sezione di Maple Leaf Rag e ripeteva i ritornelli dopo
il D.C. nelle polonaise di Clara Schumann (convenzione diversa dalla nostra). `expandRepeats.mjs` è quindi coperto da test con ordini attesi
scritti a mano (volte, `times=3`, D.C. su misura con `:|`, D.S. al Coda).

**Brani della libreria.** Non erano disponibili i `.mxl` originali: la
migrazione dei 15 brani parte dai vecchi JSON (parità verificata, vedi
`song-format.md` §7), non da una riconversione.

## 6. Comandi

```bash
npm run songs:convert -- brano.mxl [--id x] [--label "X"] [--no-repeats] [--dynamics] [--grace skip] [--out dir]
npm run songs:catalog     # rigenera songs/catalog.json
npm run songs:migrate     # una tantum: vecchi .js -> .song.json
npm run test:run          # vitest: converter, formato, parità, catalogo
```

I test (`mxl/mxl.test.js`, `format/format.test.js`) usano partiture MusicXML
sintetiche costruite nel test, incluso un `.mxl` compresso generato al volo.
