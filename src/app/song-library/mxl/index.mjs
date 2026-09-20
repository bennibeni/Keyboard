// Punto d'ingresso del convertitore MusicXML/MXL -> song-canonical@2.
//
//   const song = await convertMusicXml(arrayBufferOrString, { fileName: "x.mxl" });
//
// Pipeline: readContainer (ZIP/XML) -> xmlMini (albero) -> musicXmlToScore
// (lettura fedele) -> scoreToSong (decisioni musicali) -> song v2.
// Gira identico nel browser e in Node (nessuna dipendenza).

import { extractMusicXml } from "./readContainer.mjs";
import { parseXml } from "./xmlMini.mjs";
import { musicXmlToScore } from "./musicXmlToScore.mjs";
import { scoreToSong, DEFAULT_OPTIONS } from "./scoreToSong.mjs";

function titleFromFileName(fileName) {
  return (fileName ?? "").replace(/^.*[\\/]/, "").replace(/\.[^./\\]+$/, "");
}

export async function convertMusicXml(input, options = {}) {
  const { fileName, id, label, title, ...converterOptions } = options;
  const { xml, container } = await extractMusicXml(input);
  const score = musicXmlToScore(parseXml(xml), { ...DEFAULT_OPTIONS, ...converterOptions });
  return scoreToSong(score, converterOptions, {
    fileName,
    fileTitle: titleFromFileName(fileName),
    container,
    id,
    label,
    title,
  });
}

export { DEFAULT_OPTIONS };
