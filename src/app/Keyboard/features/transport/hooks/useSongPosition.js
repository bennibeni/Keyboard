"use client";

import { useMemo } from "react";
import { useNowPlaying } from "../../playback-engine/hooks/useNowPlaying";
import { songPositionAt } from "../model/songPosition";

// Posizione nel brano (battuta, tempo) dalla timeline reale (NowPlayingStore),
// non dal tempo trascorso: resta corretta se cambia il BPM o dopo una pausa.
// null quando il trasporto non è attivo.
export function useSongPosition({ events, time, isActive }) {
  const { tBeat } = useNowPlaying();
  return useMemo(
    () => (isActive ? songPositionAt(events, time, tBeat) : null),
    [events, time, tBeat, isActive],
  );
}

export default useSongPosition;
