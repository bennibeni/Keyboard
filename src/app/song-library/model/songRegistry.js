import normalizeMusicSeqToCanonical from "./normalizeMusicSeqToCanonical";
import { songToSeq } from "../format/songToSeq.mjs";
import { convertMusicXml } from "../mxl/index.mjs";
import catalog from "../songs/catalog.json";

// SONG_CATALOG: metadati leggeri + un thunk `load` per brano.
//
// I brani sono partiture MusicXML compresse in public/mxl/ (servite come file
// statici in /mxl/...). songs/catalog.json ne elenca ordine, etichette e opzioni
// di conversione, più i dati che servono PRIMA di caricare il brano (tonalità
// per il selettore Key, tempo, metro): è generato da `npm run songs:catalog`
// rileggendo le partiture, quindi non può divergere da esse.
//
// `load` scarica la partitura e la converte nel browser, con lo stesso
// convertitore del pannello di importazione:
//   .mxl --convertMusicXml--> song-canonical@2 --songToSeq--> seq --normalize--> song-canonical@1
// Per aggiungere un brano: `npm run songs:add -- mio-brano.mxl`.
export const SCORES_PATH = "/mxl";

export const SONG_CATALOG = catalog.map(({ id, label, key, file, options }) => ({
  id,
  label,
  key: key ?? null,
  file,
  load: async () => {
    const res = await fetch(`${SCORES_PATH}/${encodeURIComponent(file)}`);
    if (!res.ok) throw new Error(`Partitura ${file} non trovata (HTTP ${res.status})`);
    const song = await convertMusicXml(new Uint8Array(await res.arrayBuffer()), {
      fileName: file,
      id,
      label,
      ...(options ?? {}),
    });
    return normalizeMusicSeqToCanonical(songToSeq(song));
  },
}));

export const DEFAULT_SONG_ID = SONG_CATALOG[0].id;
