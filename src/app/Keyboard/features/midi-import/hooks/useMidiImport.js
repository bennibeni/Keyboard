"use client";

import { useCallback, useState } from "react";
import { normalizeMusicSeqToCanonical } from "@app/song-library";
import { parseMidiFile } from "../model/parseMidiFile";

const IDLE = { status: "idle", seq: null, fileName: null, error: null };

function titleFromFileName(fileName) {
  return fileName.replace(/\.[^./\\]+$/, "") || "Imported MIDI";
}

// Comune a importFile e importFromUrl: dato un ArrayBuffer già letto,
// esegue parse + normalizzazione (stessa pipeline di song-library) e
// restituisce il seq canonico, lasciando ai due chiamanti solo il modo
// in cui l'ArrayBuffer viene ottenuto (File API vs fetch).
function parseAndNormalize(buffer, fileName) {
  const raw = parseMidiFile(buffer, { title: titleFromFileName(fileName) });
  return normalizeMusicSeqToCanonical(raw);
}

// Espone uno shape volutamente simile a quello di useSongSelector (seq /
// isLoading / isError) - non li unifico in un hook unico perché le due
// fonti sono concettualmente diverse (catalogo statico con id stabili vs
// un file scelto ad-hoc dall'utente, senza id/persistenza), ma un
// consumer che già sa leggere `seq` da useSongSelector riconosce subito
// la stessa forma qui.
export function useMidiImport() {
  const [state, setState] = useState(IDLE);

  const importFile = useCallback(async (file) => {
    if (!file) return null;

    setState({ status: "loading", seq: null, fileName: file.name, error: null });

    try {
      const buffer = await file.arrayBuffer();
      const seq = parseAndNormalize(buffer, file.name);
      setState({ status: "ready", seq, fileName: file.name, error: null });
      return seq;
    } catch (err) {
      setState({
        status: "error",
        seq: null,
        fileName: file.name,
        error: err?.message || "Errore durante l'importazione del file MIDI.",
      });
      return null;
    }
  }, []);

  // Carica un .mid servito staticamente (tipicamente da public/mid/,
  // vedi useMidiLibrary.js) invece che dal file picker dell'utente -
  // stesso esito finale (seq pronto), diversa sola sorgente del byte
  // buffer. `label` è il nome mostrato/usato per il titolo; se omesso si
  // ricava dall'ultimo segmento dell'URL.
  const importFromUrl = useCallback(async (url, label) => {
    const fileName = label ?? url.split("/").pop() ?? "Imported MIDI";
    setState({ status: "loading", seq: null, fileName, error: null });

    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Impossibile caricare "${fileName}" (HTTP ${res.status}).`);
      }
      const buffer = await res.arrayBuffer();
      const seq = parseAndNormalize(buffer, fileName);
      setState({ status: "ready", seq, fileName, error: null });
      return seq;
    } catch (err) {
      setState({
        status: "error",
        seq: null,
        fileName,
        error: err?.message || "Errore durante l'importazione del file MIDI.",
      });
      return null;
    }
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  return {
    status: state.status,
    seq: state.seq,
    fileName: state.fileName,
    error: state.error,
    isLoading: state.status === "loading",
    isReady: state.status === "ready",
    isError: state.status === "error",
    importFile,
    importFromUrl,
    reset,
  };
}

export default useMidiImport;
