"use client";

import { useEffect } from "react";

// Space toggles play/pause, Escape stops - ignorato se il focus è su un
// campo di input (select del brano/tonalità inclusi) per non rubare la
// tastiera a chi sta scegliendo un'opzione. Stesso comportamento di R02's
// usePlaybackKeyboardShortcuts, portato qui perché mancava del tutto in
// R06 pur avendo già play/togglePause/stopAll pronti in useDemoTransport.
export function usePlaybackKeyboardShortcuts({
  play,
  stopAll,
  togglePause,
  isPlaying,
  isPaused,
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.repeat) return;

      const tag = e.target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        e.target?.isContentEditable
      ) {
        return;
      }

      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        if (isPlaying || isPaused) {
          togglePause();
        } else {
          play();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        stopAll();
      }
    }

    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey);
  }, [isPaused, isPlaying, play, stopAll, togglePause]);
}

export default usePlaybackKeyboardShortcuts;
