# public/mid — libreria MIDI statica per l'import in Keyboard (R06)

Questa cartella va posizionata nel `public/` **a livello di root del progetto
Next.js** (condiviso da tutte le route Rxx), non dentro `Keyboard/`. `public/`
in Next.js è sempre servito dalla root del sito, indipendentemente da dove
vive la route che lo consuma - quindi un file qui finisce su `/mid/nome.mid`
a prescindere dal percorso di `page.js`.

## Come aggiungere un brano

1. Copia il file `.mid` qui dentro (es. `public/mid/canone-pachelbel.mid`)
2. Aggiungilo a `manifest.json`:

```json
[
  "canone-pachelbel.mid",
  { "file": "improvviso-op90.mid", "label": "Improvviso op. 90" }
]
```

Ogni entry può essere una stringa nuda (label dedotta dal nome file, senza
estensione) o un oggetto `{ file, label }` se vuoi un titolo diverso dal
nome file. Il manifest è mantenuto a mano, come `SONG_CATALOG` in
`song-library` - non c'è generazione automatica: l'app è interamente
client-side, senza una route server che possa elencare la cartella a
runtime.

Il file `esempio.mid` elencato di default in `manifest.json` è solo un
placeholder - rimuovilo dal manifest se non hai ancora un file con quel
nome, altrimenti il pannello mostrerà un errore quando provi a caricarlo.
