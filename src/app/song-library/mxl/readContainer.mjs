// Da byte grezzi (file .mxl, .musicxml o .xml) al testo XML della partitura.
//
// Riconosce il formato dal contenuto, non dall'estensione (l'estensione
// è inaffidabile: molti .xml sono in realtà ZIP e viceversa):
//   - inizia con "PK"  -> ZIP .mxl: legge META-INF/container.xml, prende il
//     primo <rootfile> che è XML e lo decomprime;
//   - altrimenti       -> XML in chiaro (UTF-8 o UTF-16 con BOM).

import { parseXml, child, childrenOf } from "./xmlMini.mjs";
import { looksLikeZip, openZip } from "./zipReader.mjs";

function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

function isScoreEntry(name) {
  return /\.(xml|musicxml)$/i.test(name) && !/^META-INF\//i.test(name);
}

export async function extractMusicXml(input) {
  if (typeof input === "string") {
    return { xml: input, container: { format: "xml", rootFile: null } };
  }
  const bytes =
    input instanceof Uint8Array ? input : new Uint8Array(input.buffer ?? input);

  if (!looksLikeZip(bytes)) {
    return { xml: decodeText(bytes), container: { format: "xml", rootFile: null } };
  }

  const zip = openZip(bytes);
  let rootFile = null;

  if (zip.names.includes("META-INF/container.xml")) {
    const containerXml = decodeText(await zip.read("META-INF/container.xml"));
    const rootfiles = childrenOf(child(parseXml(containerXml), "rootfiles"), "rootfile");
    const preferred =
      rootfiles.find((r) => /musicxml/i.test(r.attrs["media-type"] ?? "")) ?? rootfiles[0];
    rootFile = preferred?.attrs["full-path"] ?? null;
  }
  // Container mancante o inutilizzabile: ripiego sul primo file XML non di servizio.
  if (!rootFile || !zip.names.includes(rootFile)) {
    rootFile = zip.names.find(isScoreEntry) ?? null;
  }
  if (!rootFile) {
    throw new Error("File .mxl non valido: nessuna partitura MusicXML trovata nell'archivio.");
  }

  return {
    xml: decodeText(await zip.read(rootFile)),
    container: { format: "mxl", rootFile },
  };
}
