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
  // Inizio di battuta da cui far partire il metronomo (quarti), oppure null
  // per partire dalla posizione corrente del brano. Usato dalla modalità
  // "battuta singola" e dalla ripresa del brano da una battuta: a ogni
  // cambio il metronomo riparte da lì e conta gli accenti da lì (non dai
  // multipli del metro dall'inizio del brano).
  anchorBeat = null,
  // Cambia ogni volta che la riproduzione delle note riparte da capo (cambio
  // di battuta, entrata/uscita dalla battuta singola): il metronomo riparte con lei.
  restartKey = null,
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

  const barStart = Number.isFinite(anchorBeat) ? anchorBeat : null;
  const barStartRef = useRef(barStart);
  useEffect(() => {
    barStartRef.current = barStart;
  }, [barStart]);

  useEffect(() => {
    service.setGain(metroLevel);
  }, [metroLevel, service]);

  // Active whenever the transport is running/paused AND the toggle is on -
  // both gate the loop's lifecycle, same "spans playing+paused, not
  // recreated on pause/resume" pattern usePlaySong uses for the notes.
  const isActive = (isPlaying || isPaused) && metronomeOn;

  useEffect(() => {
    if (!isActive) return undefined;

    const runningRef = { current: true };
    let stop = () => {};

    async function start() {
      // Wait for WAV loading before creating the beat loop. When the files
      // are available, the very first click is therefore a WAV; when they
      // are missing, enable() still resolves and the synth fallback starts.
      await service.enable();
      if (!runningRef.current) return;
      service.setGain(metroLevel);

      // Read the current position after loading, so a slow first fetch does
      // not restart the metronome from an obsolete beat.
      const startBeat =
        barStartRef.current ?? (getNowPlayingStore().getSnapshot().tBeat || 0);

      stop = createMetronomeBeatLoop({
        token: 1,
        bpm: bpmRef.current,
        getBpm: () => bpmRef.current,
        startBeat,
        getAudioNow: () => service.now(),
        onBeat: (i, audioStartAt) => {
          const time = songRef.current?.time;
          const tsStr = resolveTimeSignatureAt(i, time);
          const { num } = parseTimeSignatureStr(tsStr);
          const fromBar = i - Math.round(barStartRef.current ?? 0);
          const beatInBar = ((fromBar % num) + num) % num;
          const kind = accentKindFor(tsStr, beatInBar);
          const kinds = Array.from({ length: num }, (_, pos) =>
            accentKindFor(tsStr, pos),
          );
          service.tickBeat(beatInBar, num, kind, kinds, audioStartAt);
        },
        shouldContinue: () => runningRef.current,
        shouldPause: () => isPausedRef.current,
      });
    }

    start();

    return () => {
      runningRef.current = false;
      stop();
      service.disable();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, service, barStart, restartKey]);
}

export default useMetronomeClick;
