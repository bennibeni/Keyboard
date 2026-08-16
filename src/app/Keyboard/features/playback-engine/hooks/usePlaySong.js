"use client";

import { useEffect, useMemo, useRef } from "react";
import { SETTINGS } from "../../../settings";
import { resolveChordVoicing } from "../model/resolveChordVoicing";
import { getPianoEngine } from "../runtime/pianoEngine";
import { getNowPlayingStore } from "../runtime/NowPlayingStore";
import { runScheduledPlayback } from "../runtime/runScheduledPlayback";

// Expects `song` to be canonical-shaped (song-canonical@1, as produced by
// normalizeMusicSeqToCanonical - see @app/song-library): events[].{tBeat,
// durBeat, notes[].{midi, velocity, durBeat}}, and time.{timeSignature,
// timeChanges?} at the top level (not nested under meta). Field-name
// fallbacks below (?? event.t, ?? note.vel) exist only for robustness if
// non-normalized data ever gets passed in directly.
export function usePlaySong({
  song,
  isPlaying,
  isPaused,
  bpm,
  // How long each note is allowed to ring, independent of its own written
  // beat-duration - mirrors R02's sustainMode="natural" (a roughly-fixed
  // ~1200ms regardless of what's written), not a literal durBeat->ms
  // conversion. The written duration still decides WHEN the next note/
  // chord starts (see runScheduledPlayback.js's use of event.dur) - it's
  // tying THAT same number to how long the current note is allowed to
  // ring that made short/16th-note passages sound clipped and mechanical,
  // since a 0.25-beat note was being cut off almost as soon as it started.
  sustainMs = SETTINGS.sustainMs.value,
  // Whether the song restarts from the beginning when it reaches the end.
  // Read once when the run starts (same as `song`) - toggling it while
  // actively playing restarts the run with the new value rather than
  // taking effect seamlessly mid-song.
  loop = SETTINGS.loop.value,
  // Read live via refs inside playChord, so adjusting from Settings
  // mid-playback takes effect on the very next chord - no restart, no
  // audible interruption.
  bassScale = SETTINGS.bassScale.value,
  rhScale = SETTINGS.rhScale.value,
  // Called once, at most, when the run reaches the end of the song on
  // its own (loop=false) - NOT when it's torn down because the user hit
  // Stop, changed song, or the component unmounted (see runningRef check
  // below). Lets the caller reflect "finished" in the transport UI
  // instead of the FSM getting stuck on "playing" forever after the last
  // note rings out.
  onFinished = null,
  // DI: the audio engine is a dependency, not a hardwired call - default
  // is the real singleton (getPianoEngine()) so existing callers don't
  // change, but a test (or an alternate engine) can pass its own object
  // implementing the same {unlock, setMasterGain, preload, playNote,
  // stopAll, now} shape without this hook needing to know or care.
  engine = getPianoEngine(),
}) {
  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const bpmRef = useRef(bpm);
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  const sustainMsRef = useRef(sustainMs);
  useEffect(() => {
    sustainMsRef.current = sustainMs;
  }, [sustainMs]);

  const bassScaleRef = useRef(bassScale);
  useEffect(() => {
    bassScaleRef.current = bassScale;
  }, [bassScale]);

  const rhScaleRef = useRef(rhScale);
  useEffect(() => {
    rhScaleRef.current = rhScale;
  }, [rhScale]);

  // Recomputed only when the song itself changes. Warms sampleEngine's
  // cache for every distinct pitch in THIS song before playback starts,
  // so the first time each pitch is heard doesn't pay a real fetch+decode
  // round trip (see audio-engine's README).
  const uniqueMidis = useMemo(
    () => [
      ...new Set(
        (song?.events || []).flatMap((e) => (e?.notes || []).map((n) => n.midi)),
      ),
    ],
    [song],
  );

  // The scheduler run spans the whole active run (playing OR paused) - it
  // is NOT restarted on pause/resume. runScheduledPlayback handles that
  // internally via shouldPause(), reading isPausedRef live on every
  // iteration, exactly like R02's own usePlaybackScheduler wires it.
  // Changing `song` while active does restart the run, picking up the new
  // song's events/meta.
  const isActive = isPlaying || isPaused;

  useEffect(() => {
    if (!isActive || !song) return undefined;

    const runningRef = { current: true };

    (async () => {
      await engine.unlock();
      if (!runningRef.current) return; // torn down while unlocking

      engine.setMasterGain(SETTINGS.masterGain.value);
      await engine.preload(uniqueMidis);
      if (!runningRef.current) return; // torn down while preloading

      await runScheduledPlayback({
        events: song.events,
        bpm: bpmRef.current,
        getBpm: () => bpmRef.current,
        loop,
        shouldContinue: () => runningRef.current,
        shouldPause: () => isPausedRef.current,
        getAudioNow: () => engine.now(),
        onStep: (i, ev) => {
          const tBeat = Number(ev?.t ?? ev?.tBeat) || 0;
          const activeMidis = (ev?.notes || [])
            .map((n) => Number(n?.midi))
            .filter((m) => Number.isFinite(m));
          getNowPlayingStore().commitStep({ tBeat, activeMidis });
        },
        playChord: async ({ event, audioStartAt }) => {
          // All the music-theory decisions (accent, velocity, bass/treble
          // balance, ring length) live in resolveChordVoicing - a pure
          // function, testable independent of this hook's React/audio-
          // engine concerns. This closure's job is just: get the voicing,
          // then hand each note to the engine.
          const voicing = resolveChordVoicing({
            event,
            songTime: song.time,
            sustainMs: sustainMsRef.current,
            bassScale: bassScaleRef.current,
            rhScale: rhScaleRef.current,
            accentsEnabled: SETTINGS.accentsEnabled.value,
            accentAmount: SETTINGS.accentAmount.value,
            chordHeadroom: SETTINGS.chordHeadroom.value,
            minNoteMs: SETTINGS.minNoteMs.value,
            maxNoteMs: SETTINGS.maxNoteMs.value,
          });

          // Play every note in the chord together, not one after another -
          // sampleEngine's playNote is async (fetch+decode on first use per
          // pitch), so without Promise.all a chord's notes would smear
          // instead of landing on the same onset. audioStartAt (stamped
          // once per chord by runScheduledPlayback, see there) further
          // guarantees they land on the exact same audio-clock instant
          // regardless of how each note's own async resolution races.
          await Promise.all(
            voicing.map(async ({ midi, velocity, durationMs }) => {
              try {
                await engine.playNote(midi, {
                  durationMs,
                  velocity,
                  startAt: audioStartAt,
                });
              } catch (err) {
                // No playable sample for this pitch - skip just this note
                // rather than aborting the whole chord/playback.
                if (process.env.NODE_ENV !== "production") {
                  console.warn("[R04/usePlaySong]", err?.message || err);
                }
              }
            }),
          );
        },
      });

      // runningRef.current is still true here only if the run reached
      // the end of the song on its own (loop=false) - if it's false, the
      // effect's own cleanup already set it to false (Stop pressed, song
      // changed, unmount), which handles its own UI state and shouldn't
      // also be reported as "finished".
      if (runningRef.current && typeof onFinished === "function") {
        onFinished();
      }
    })().catch(() => {});

    return () => {
      runningRef.current = false;
      engine.stopAll();
      getNowPlayingStore().reset();
    };
  }, [isActive, song, loop, uniqueMidis, onFinished, engine]);
}

export default usePlaySong;
