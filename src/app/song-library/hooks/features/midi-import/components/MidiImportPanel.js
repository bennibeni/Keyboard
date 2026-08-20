"use client";

import { useRef } from "react";
import PropTypes from "prop-types";
import { getPanelFrameProps } from "../../../shared/ui/panelSpecs";
import { PanelFrame, Button } from "../../../shared/ui/playbackScreenUi";
import { useMidiImport } from "../hooks/useMidiImport";
import { useMidiLibrary } from "../hooks/useMidiLibrary";

// onImported(seq, fileName): chiamato quando un file è stato importato e
// normalizzato con successo. Il chiamante (Page.js) decide cosa farne -
// tipicamente selezionare questo seq come brano "attivo" per usePlaySong,
// fuori dal normale SONG_CATALOG (che resta invariato: un import non
// scrive nulla nel catalogo, vive solo nello stato locale di questo
// hook finché la pagina non viene ricaricata o un altro file non viene
// importato).
export default function MidiImportPanel({ onImported }) {
  const {
    status,
    fileName,
    error,
    isLoading,
    isReady,
    isError,
    importFile,
    importFromUrl,
    reset,
  } = useMidiImport();
  const { entries: libraryEntries, urlFor } = useMidiLibrary();
  const inputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permette di reimportare lo stesso file una seconda volta
    if (!file) return;

    const seq = await importFile(file);
    if (seq && typeof onImported === "function") {
      onImported(seq, file.name);
    }
  };

  const handlePickFile = () => inputRef.current?.click();

  const handlePickFromLibrary = async (entry) => {
    const seq = await importFromUrl(urlFor(entry), entry.label);
    if (seq && typeof onImported === "function") {
      onImported(seq, entry.label);
    }
  };

  return (
    <PanelFrame
      {...getPanelFrameProps("midiImport")}
      titleRight={
        isLoading ? "Importazione…" : isReady ? "Pronto" : isError ? "Errore" : null
      }
    >
      <div className="flex h-full flex-col gap-3">
        <div className="text-sm text-zinc-700">
          Scegli un file MIDI dalla libreria o importane uno da fuori, per
          suonarlo subito.
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".mid,.midi,audio/midi,audio/x-midi"
          onChange={handleFileChange}
          className="hidden"
        />

        {libraryEntries.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="text-xs font-bold uppercase tracking-wide text-zinc-400">
              Libreria (public/mid)
            </div>
            <div className="flex flex-wrap gap-2">
              {libraryEntries.map((entry) => (
                <Button
                  key={entry.file}
                  variant="ghost"
                  size="compact"
                  disabled={isLoading}
                  onClick={() => handlePickFromLibrary(entry)}
                >
                  {entry.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="compact"
            disabled={isLoading}
            onClick={handlePickFile}
          >
            {isLoading ? "Importazione…" : "Scegli file MIDI"}
          </Button>

          {status !== "idle" ? (
            <Button variant="ghost" size="compact" onClick={reset}>
              Reset
            </Button>
          ) : null}
        </div>

        {fileName ? (
          <div className="text-sm text-zinc-600">
            File: <span className="font-semibold">{fileName}</span>
          </div>
        ) : null}

        {isError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            {error}
          </div>
        ) : null}

        {isReady ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Importato correttamente. Selezionalo come brano attivo per
            suonarlo.
          </div>
        ) : null}
      </div>
    </PanelFrame>
  );
}

MidiImportPanel.propTypes = {
  onImported: PropTypes.func,
};
