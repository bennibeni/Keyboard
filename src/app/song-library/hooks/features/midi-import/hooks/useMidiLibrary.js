"use client";

import { useEffect, useState } from "react";

const MANIFEST_URL = "/mid/manifest.json";

function normalizeEntry(item) {
  if (typeof item === "string") {
    return { file: item, label: item.replace(/\.[^./\\]+$/, "") };
  }
  return {
    file: item.file,
    label: item.label ?? item.file.replace(/\.[^./\\]+$/, ""),
  };
}

// L'app è interamente client-side (nessuna route server), quindi non
// c'è modo di elencare a runtime il contenuto di una cartella - il
// manifest è l'equivalente di SONG_CATALOG per questo flusso "metti un
// .mid dentro public/mid e compare nel pannello": un file statico
// public/mid/manifest.json con l'elenco dei nomi file, aggiornato a
// mano quando si aggiunge/rimuove un .mid. Un manifest assente o vuoto è
// trattato come "nessuna libreria disponibile", non come errore -
// l'import da file esterno resta comunque utilizzabile.
export function useMidiLibrary() {
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;

    fetch(MANIFEST_URL)
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        if (cancelled) return;
        setEntries((Array.isArray(list) ? list : []).map(normalizeEntry));
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setEntries([]);
          setStatus("ready");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    entries,
    isLoading: status === "loading",
    urlFor: (entry) => `/mid/${entry.file}`,
  };
}

export default useMidiLibrary;
