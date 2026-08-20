"use client";

import { msPerBeat as msPerBeatFromBpm } from "../../../shared/music/math";

// Defaults for lookaheadMs/pollIntervalMs below - comfortably larger
// than the poll interval (see the parameter comments), matching the
// classic Web Audio "lookahead scheduler" reference values (Chris
// Wilson's "A Tale of Two Clocks": scheduleAheadTime=100ms,
// lookahead-poll=25ms - ours polls slightly tighter at 20ms).
const DEFAULT_LOOKAHEAD_MS = 100;
const DEFAULT_POLL_INTERVAL_MS = 20;

export function createMetronomeBeatLoop({
  token,
  bpm,
  // DI: live bpm getter, same pattern as runScheduledPlayback.js's
  // getBpm - injected so this loop doesn't need to know where "current
  // bpm" actually lives.
  getBpm = null,
  startBeat = 0,
  // (beatIndex, audioStartAt) => void, called once per integer beat
  // crossed. audioStartAt is an AudioContext.currentTime-space instant
  // (seconds) at which this beat should actually sound - null if
  // getAudioNow wasn't provided, in which case the caller falls back to
  // "now" (see MetronomeService.tickBeat).
  onBeat,
  shouldContinue,
  shouldPause,
  // Optional live getter for the audio engine's own clock (seconds) -
  // see audio-engine's now(). Without it, this loop still works exactly
  // as before (fires beats reactively, no lookahead).
  // DI: same idea as runScheduledPlayback.js's getAudioNow - the audio
  // clock is a dependency the loop reads through this injected getter
  // rather than importing/assuming a specific engine.
  getAudioNow = null,
  // How far ahead (wall-clock ms) a beat is scheduled before it actually
  // happens - see DEFAULT_LOOKAHEAD_MS above. Exposed as a parameter
  // rather than a hardcoded module constant, matching how
  // runScheduledPlayback.js already exposes its own internal timing
  // knobs (pausePollMs, waitSliceMs, spacingGuardMs) as optional
  // arguments instead of file-local constants - same category of value
  // (scheduler tuning, not a user-facing setting; see settings.js's own
  // scope for why this doesn't belong there), same convention for
  // overriding it.
  lookaheadMs = DEFAULT_LOOKAHEAD_MS,
  // How often the loop polls (setTimeout), both while actively ticking
  // and while paused - see DEFAULT_POLL_INTERVAL_MS above. Same
  // reasoning as lookaheadMs for why this is a parameter, not a const.
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}) {
  const readBpm = typeof getBpm === "function" ? getBpm : () => bpm;

  let beatMs = msPerBeatFromBpm(readBpm());
  let originAt = performance.now();
  let originBeat = startBeat;
  let pausedBeat = null;
  // Seeded so the very first tick fires once for floor(startBeat), not
  // for beat 0 - matches the existing behavior when startBeat is 0
  // (lastBeatIndex = -1, first beat fired is 0).
  let lastBeatIndex = Math.floor(startBeat) - 1;
  let timerId = null;

  function beatAt(now) {
    return originBeat + (now - originAt) / beatMs;
  }

  function wallAtBeat(beatPos) {
    return originAt + (beatPos - originBeat) * beatMs;
  }

  function syncTempoIfChanged(now) {
    const nextBeatMs = msPerBeatFromBpm(readBpm());
    if (nextBeatMs === beatMs) return;
    originBeat = beatAt(now);
    originAt = now;
    beatMs = nextBeatMs;
  }

  const tick = () => {
    if (!shouldContinue() || token == null) return;

    const now = performance.now();

    if (shouldPause()) {
      if (pausedBeat == null) pausedBeat = beatAt(now);
      timerId = window.setTimeout(tick, pollIntervalMs);
      return;
    }

    if (pausedBeat != null) {
      originBeat = pausedBeat;
      originAt = now;
      beatMs = msPerBeatFromBpm(readBpm());
      pausedBeat = null;
    } else {
      syncTempoIfChanged(now);
    }

    // Schedule every beat whose wall-clock time falls within the
    // lookahead window, even if it hasn't happened yet - not just the
    // ones already crossed. This is what turns "fire reactively, up to
    // one poll tick late" into "hand the browser a precise future
    // instant to hit exactly".
    const audioNow = typeof getAudioNow === "function" ? getAudioNow() : null;
    let nextIndex = lastBeatIndex + 1;
    let wallTarget = wallAtBeat(nextIndex);

    while (wallTarget <= now + lookaheadMs) {
      const audioStartAt =
        Number.isFinite(audioNow) && audioNow > 0
          ? audioNow + Math.max(0, wallTarget - now) / 1000
          : null;
      onBeat(nextIndex, audioStartAt);
      lastBeatIndex = nextIndex;
      nextIndex += 1;
      wallTarget = wallAtBeat(nextIndex);
    }

    timerId = window.setTimeout(tick, pollIntervalMs);
  };

  tick();

  return () => {
    if (timerId != null) {
      window.clearTimeout(timerId);
    }
  };
}

export default createMetronomeBeatLoop;
