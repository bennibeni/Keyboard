// Punto unico di ingresso per i file importati dall'utente: riconosce il
// formato dal CONTENUTO (non dall'estensione) e restituisce lo stesso shape
// "grezzo" che normalizeMusicSeqToCanonical si aspetta.
//
//   "MThd"                 -> Standard MIDI File   (parseMidiFile)
//   "PK" (ZIP) o XML       -> MusicXML / .mxl      (convertMusicXml + songToSeq)
//
// Il convertitore MusicXML vive in song-library/mxl (nessuna dipendenza npm,
// stessa filosofia di parseMidiFile); vedi src/app/docs/mxl-conversion.md.

import { convertMusicXml, songToSeq } from "@app/song-library";
import { parseMidiFile } from "./parseMidiFile";

function isMidi(bytes) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x4d &&
    bytes[1] === 0x54 &&
    bytes[2] === 0x68 &&
    bytes[3] === 0x64
  );
}

export async function parseScoreFile(arrayBuffer, { fileName, title } = {}) {
  const bytes = new Uint8Array(arrayBuffer);
  if (isMidi(bytes)) return parseMidiFile(arrayBuffer, { title });

  // Il titolo dichiarato nella partitura vince; se manca, ripiego sul nome file.
  return songToSeq(await convertMusicXml(bytes, { fileName, title: undefined }));
}

export default parseScoreFile;
