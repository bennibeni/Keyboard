import normalizeMusicSeqToCanonical from "./normalizeMusicSeqToCanonical";
import { songToSeq } from "../format/songToSeq.mjs";
import catalog from "../songs/catalog.json";

// SONG_CATALOG: metadati leggeri + un thunk `load` per brano.
//
// L'elenco (id, label, tonalità) viene da songs/catalog.json, che è GENERATO
// dai file *.song.json (`npm run songs:catalog`, o automaticamente da
// `npm run songs:convert`): la tonalità non è più duplicata a mano qui e
// nel brano, quindi le due copie non possono più divergere.
//
// `load` importa on-demand il file del brano (Next.js lo mette in un chunk
// separato) e lo porta al formato che il resto dell'app conosce:
//   song-canonical@2 --songToSeq--> seq grezzo --normalize--> song-canonical@1
// Per aggiungere un brano: `npm run songs:convert -- mio-brano.mxl`.
//
// Il template letterale termina in ".song.json" apposta: così il bundler
// include nel contesto dinamico solo i brani v2 e non i vecchi file .js.
export const SONG_CATALOG = catalog.map(({ id, label, key, file }) => {
  const stem = file.slice(0, -".song.json".length);
  return {
    id,
    label,
    key: key ?? null,
    load: () =>
      import(`../songs/${stem}.song.json`).then((m) =>
        normalizeMusicSeqToCanonical(songToSeq(m.default ?? m)),
      ),
  };
});

export const DEFAULT_SONG_ID = SONG_CATALOG[0].id;
