"use client";

import { useCallback } from "react";
import useTransportController from "./useTransportController";

// R02 wires TransportBar through usePlaybackExecutionController, which adds
// scheduler run-token tracking, engine.stopAll(), and visual-state reset on
// top of the transport FSM - all of that exists to coordinate with an
// actual song/audio engine. R04 has neither, so this hook talks straight to
// useTransportController (the same pure FSM R02 uses underneath), giving
// working Play/Pause/Resume/Stop state transitions without needing to fake
// an engine.
export function useDemoTransport() {
  const transport = useTransportController();
  const { markFinish, markPause, markPlay, markResume, markStop } = transport;

  const play = useCallback(() => {
    markPlay();
  }, [markPlay]);

  const togglePause = useCallback(() => {
    if (transport.state === "playing") markPause();
    else if (transport.state === "paused") markResume();
  }, [markPause, markResume, transport.state]);

  const stopAll = useCallback(() => {
    markStop();
  }, [markStop]);

  // Reports the run reaching the end of the song on its own (not a
  // manual Stop) - see usePlaySong's onFinished. Without this, nothing
  // ever drove the FSM out of "playing" when a song simply finished:
  // canPlay stayed false (Play button stuck disabled) and the status
  // label stayed "Playing" forever until the user pressed Stop by hand.
  //
  // Depends on transport.markFinish specifically (stable - it's a
  // useCallback with `[]` deps inside useTransportController), NOT on
  // the whole `transport` object, which is a fresh object literal every
  // render. usePlaySong puts this function in an effect's dependency
  // array (unlike play/togglePause/stopAll above, which are only ever
  // used as onClick handlers) - if `finish` itself changed identity on
  // every render, that effect would tear down and restart playback on
  // every unrelated Page re-render.
  const finish = useCallback(() => {
    markFinish();
  }, [markFinish]);

  // No audio to unlock here - kept as a no-op so TransportBar's required
  // onPointerDown={warmUp} prop still has a valid function.
  const warmUp = useCallback(() => {}, []);

  return {
    state: transport.state,
    statusLabel: transport.statusLabel,
    canPlay: transport.canPlay,
    canPause: transport.canPause,
    canStop: transport.canStop,
    isPlaying: transport.isPlaying,
    isPaused: transport.isPaused,
    isStopped: transport.isStopped,
    isFinished: transport.isFinished,
    // Same "isPlaying || isPaused" the audio-facing hooks (usePlaySong,
    // useMetronomeClick) each compute locally as their own `isActive` -
    // exposed here too so callers that just need "is anything happening
    // right now" (e.g. disabling the song selector) don't have to
    // recompute the same boolean a third time inline.
    isActive: transport.isPlaying || transport.isPaused,
    play,
    togglePause,
    stopAll,
    finish,
    warmUp,
  };
}

export default useDemoTransport;
