"use client";

import { useEffect, useMemo, useRef } from "react";
import { SETTINGS } from "../../../settings";
import { resolveChordVoicing } from "../model/resolveChordVoicing";
import { resolveEngineRoute } from "../model/resolveEngineRoute";
import { getPlaybackEngineProxy } from "../runtime/playbackEngineProxy";
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
  // SONG_CATALOG id of the currently loaded song (Page.js's `selectedId`) -
  // needed by resolveEngineRoute for its per-song ENGINE_OVERRIDES lookup.
  // null is fine (routing just falls through to hint-matching/piano).
  songId = null,
  // Global kill switch for the whole routing feature - see
  // SETTINGS.engineRoutingEnabled. false = always piano samples, no matter
  // what songId/hints say.
  routingEnabled = SETTINGS.engineRoutingEnabled.value,
  isPlaying,
  isPaused,
  bpm,
  sustainMs = SETTINGS.sustainMs.value,
  loop = SETTINGS.loop.value,
  bassScale = SETTINGS.bassScale.value,
  rhScale = SETTINGS.rhScale.value,
  onFinished = null,
  // DI escape hatch: if a caller passes `engine` explicitly (tests, or an
  // alternate engine), routing is skipped entirely and that engine is used
  // as-is - same DI contract as before, just renamed so it's clear this is
  // an OVERRIDE of routing, not routing's own default.
  engine: engineOverride = null,
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

  // Recomputed only when the song/songId/routing toggle actually change -
  // NOT on every render, so `engine` below stays referentially stable
  // across unrelated re-renders (e.g. a tempo slider tick) and doesn't
  // spuriously restart the playback effect.
  const route = useMemo(
    () => resolveEngineRoute(song, { songId, routingEnabled }),
    [song, songId, routingEnabled],
  );

  // Goes through the Proxy (see runtime/playbackEngineProxy.js) unless the
  // caller supplied its own engine via `engineOverride` (DI escape hatch
  // for tests) - that path bypasses the Proxy's defaulting entirely, same
  // contract as before.
  const engine = useMemo(
    () => engineOverride ?? getPlaybackEngineProxy(route),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route.engine, route.waveform, engineOverride],
  );

  // Recomputed only when the song itself changes. Warms sampleEngine's
  // cache for every distinct pitch in THIS song before playback starts -
  // no-op (skipped below) when the route is synth, since createSynthEngine
  // has no preload concept (it's a live oscillator, nothing to fetch).
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
  // iteration. Changing `song` (or the resolved `engine`, e.g. switching
  // to a song that routes to a different waveform) while active DOES
  // restart the run.
  const isActive = isPlaying || isPaused;

  useEffect(() => {
    if (!isActive || !song) return undefined;

    const runningRef = { current: true };

    (async () => {
      await engine.unlock();
      if (!runningRef.current) return; // torn down while unlocking

      // Proxy defaults the gain from SETTINGS.masterGain when omitted, but
      // the explicit value is still passed here so the `engineOverride`
      // DI escape hatch (a raw, non-proxied engine in tests) keeps
      // receiving a real gain instead of relying on defaulting it doesn't
      // have.
      engine.setMasterGain(SETTINGS.masterGain.value);

      // The Proxy normalizes preload() to always be a function - a
      // synth-routed engine simply has nothing to preload, so this no
      // longer needs to feature-detect for that path. The guard stays for
      // the `engineOverride` DI escape hatch, whose raw engine (tests,
      // etc.) might not implement preload at all.
      if (typeof engine.preload === "function") {
        await engine.preload(uniqueMidis);
        if (!runningRef.current) return; // torn down while preloading
      }

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
          // route.sustainMs (from ENGINE_OVERRIDES or auto-detected synth
          // routing - see resolveEngineRoute.js) wins over the generic
          // SETTINGS-driven sustainMsRef when present: a raw synth
          // oscillator has no natural decay like a piano sample, so it
          // needs a much shorter programmed hold to avoid overlapping the
          // next note (heard as a flanging/echo clash otherwise).
          const effectiveSustainMs = Number.isFinite(route.sustainMs)
            ? route.sustainMs
            : sustainMsRef.current;

          const voicing = resolveChordVoicing({
            event,
            songTime: song.time,
            sustainMs: effectiveSustainMs,
            bassScale: bassScaleRef.current,
            rhScale: rhScaleRef.current,
            accentsEnabled: SETTINGS.accentsEnabled.value,
            accentAmount: SETTINGS.accentAmount.value,
            chordHeadroom: SETTINGS.chordHeadroom.value,
            minNoteMs: SETTINGS.minNoteMs.value,
            maxNoteMs: SETTINGS.maxNoteMs.value,
          });

          await Promise.all(
            voicing.map(async ({ midi, velocity, durationMs }) => {
              try {
                await engine.playNote(midi, {
                  durationMs,
                  velocity,
                  startAt: audioStartAt,
                });
              } catch (err) {
                // No playable sample/voice for this pitch - skip just this
                // note rather than aborting the whole chord/playback.
                if (process.env.NODE_ENV !== "production") {
                  console.warn("[R06/usePlaySong]", err?.message || err);
                }
              }
            }),
          );
        },
      });

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
