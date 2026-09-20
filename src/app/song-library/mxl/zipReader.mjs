// Lettore ZIP minimale per i file .mxl (MusicXML compresso).
//
// Un .mxl è uno ZIP con META-INF/container.xml che indica quale file XML
// contiene la partitura. Servono solo due metodi di compressione (0 =
// stored, 8 = deflate) e nessuna funzione avanzata (niente ZIP64, niente
// cifratura, niente multi-disco). La decompressione deflate usa
// DecompressionStream("deflate-raw"), che esiste sia nei browser moderni
// sia in Node >= 18: nessuna dipendenza npm.

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

export function looksLikeZip(bytes) {
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function findEndOfCentralDirectory(view) {
  // L'EOCD sta negli ultimi 22 + 65535 byte (commento ZIP incluso).
  const min = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let p = view.byteLength - 22; p >= min; p -= 1) {
    if (view.getUint32(p, true) === SIG_EOCD) return p;
  }
  throw new Error("File .mxl non valido: directory ZIP non trovata.");
}

async function inflateRaw(compressed) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "Questo browser non supporta la decompressione dei file .mxl (DecompressionStream). Esporta la partitura come .musicxml non compresso oppure usa un browser aggiornato.",
    );
  }
  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Restituisce { names, read(name) }. `read` decomprime on demand solo la
// voce richiesta.
export function openZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  const total = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  const entries = new Map();

  for (let k = 0; k < total; k += 1) {
    if (view.getUint32(p, true) !== SIG_CENTRAL) {
      throw new Error("File .mxl non valido: voce della directory ZIP corrotta.");
    }
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { name, method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return {
    names: [...entries.keys()],
    async read(name) {
      const e = entries.get(name);
      if (!e) throw new Error(`File .mxl: voce "${name}" non presente nell'archivio.`);
      if (view.getUint32(e.localOffset, true) !== SIG_LOCAL) {
        throw new Error(`File .mxl: intestazione locale di "${name}" corrotta.`);
      }
      const nameLen = view.getUint16(e.localOffset + 26, true);
      const extraLen = view.getUint16(e.localOffset + 28, true);
      const start = e.localOffset + 30 + nameLen + extraLen;
      const data = bytes.subarray(start, start + e.compressedSize);
      if (e.method === 0) return data;
      if (e.method === 8) return inflateRaw(data);
      throw new Error(`File .mxl: metodo di compressione ${e.method} non supportato.`);
    },
  };
}
