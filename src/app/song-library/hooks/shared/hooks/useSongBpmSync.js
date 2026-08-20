"use client";

import { useState } from "react";

// Re-seeds the Tempo slider to the newly loaded song's own authored bpm
// whenever the song changes - from then on the slider is authoritative
// (you can play a song faster/slower than written) until you pick a
// different song, which re-seeds again.
//
// Adjusted DURING RENDER (React's own recommended pattern for "reset
// derived state when a prop changes", see
// https://react.dev/learn/you-might-not-need-an-effect) instead of via
// useEffect+setState, which react-hooks/set-state-in-effect flags -
// calling setState synchronously as the first thing an effect does
// causes an extra commit+effect+re-render cycle; adjusting state while
// rendering lets React fold it into the same render pass instead. Same
// fix already applied to song-library's useSongSelector.js earlier.
// Also matches the "biggest useEffect mistake" / derived-state guidance
// in https://jsdev.space/react-interview-questions-2026/ - if a value
// can be calculated (or, as here, reset) during rendering, it usually
// should be, rather than round-tripping through an effect.
//
// Takes `setBpm` as a parameter rather than owning the bpm state itself,
// since bpm is read/written from several places in Page.js (the Tempo
// slider, usePlaySong, useMetronomeClick) - this hook only needs to
// react to `seq` changing, not to own the value.
export function useSongBpmSync(seq, setBpm) {
  const [bpmSyncedForSeq, setBpmSyncedForSeq] = useState(null);
  if (seq && seq !== bpmSyncedForSeq) {
    setBpmSyncedForSeq(seq);
    if (seq.time?.bpm) setBpm(seq.time.bpm);
  }
}

export default useSongBpmSync;
