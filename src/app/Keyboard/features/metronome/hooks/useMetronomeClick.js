"use client";

import { useEffect, useRef } from "react";
import { parseTimeSignatureStr } from "../../../shared/music/timeSignature";
import { accentKindFor } from "../../playback-engine/model/accents";
import { resolveTimeSignatureAt } from "../../playback-engine/model/resolveTimeSignatureAt";
import { getNowPlayingStore } from "../../playback-engine/runtime/NowPlayingStore";
import { createMetronomeBeatLoop } from "../runtime/createMetronomeBeatLoop";
import { getMetronomeService } from "../runtime/MetronomeService";

// NOTE: beatInBar here assumes a quarter-note beat (i.e. an X/4 time
// signature), matching every song currently in the library (4/4, 3/4,
// 2/4, 6/4 - see the time-signature survey earlier in this conversation).
// An eighth-denominated signature (6/8, 7/8...) would need the loop to
// advance in eighth-note steps instead of whole beats to click correctly -
// not implemented, since nothing in the library needs it yet.
export function useMetronomeClick({
  isPlaying,
  isPaused,
  bpm,
  song,
  metronomeOn,
  metroLevel,
  // DI: same reasoning as usePlaySong's `engine` param - defaults to the
  // real MetronomeService singleton, but callers (tests, or a future
  // alternate click engine) can inject their own object implementing the
  // same {enable, disable, setGain, tickBeat, now} shape.
  service = getMetronomeService(),
}) {
  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const bpmRef = useRef(bpm);
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  const songRef = useRef(song);
  useEffect(() => {
    songRef.current = song;
  }, [song]);

  useEffect(() => {
    service.setGain(metroLevel);
  }, [metroLevel, service]);

  // Active whenever the transport is running/paused AND the toggle is on -
  // both gate the loop's lifecycle, same "spans playing+paused, not
  // recreated on pause/resume" pattern usePlaySong uses for the notes.
  const isActive = (isPlaying || isPaused) && metronomeOn;

  useEffect(() => {
    if (!isActive) return undefined;

    service.enable();
    service.setGain(metroLevel);

    const runningRef = { current: true };

    // Direct one-time read, not useNowPlaying()'s reactive subscription -
    // we only need the song's position at the exact moment the metronome
    // (re)starts, not on every subsequent event. Without this, toggling
    // metronomeOn off and back on mid-song tore the loop down and rebuilt
    // it with originBeat=0, restarting the click from bar 1 regardless of
    // where the song actually was.
    const startBeat = getNowPlayingStore().getSnapshot().tBeat || 0;

    const stop = createMetronomeBeatLoop({
      token: 1,
      bpm: bpmRef.current,
      getBpm: () => bpmRef.current,
      startBeat,
      getAudioNow: () => service.now(),
      onBeat: (i, audioStartAt) => {
        const time = songRef.current?.time;
        const tsStr = resolveTimeSignatureAt(i, time);
        const { num } = parseTimeSignatureStr(tsStr);
        const beatInBar = ((i % num) + num) % num;
        const kind = accentKindFor(tsStr, beatInBar);
        const kinds = Array.from({ length: num }, (_, pos) =>
          accentKindFor(tsStr, pos),
        );
        service.tickBeat(beatInBar, num, kind, kinds, audioStartAt);
      },
      shouldContinue: () => runningRef.current,
      shouldPause: () => isPausedRef.current,
    });

    return () => {
      runningRef.current = false;
      stop();
      service.disable();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, service]);
}

export default useMetronomeClick;
