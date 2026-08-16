"use client";

import { getOrCreateAudioContext, unlockAudioContext } from "./context";
import { semitoneRate } from "./midi";
import { getSampleBuffer } from "./sampleCache";
import { resolveSampleUrl } from "./sampleResolver";

export function createSampleEngine({
  sampleBasePath = "/samples/piano",
  ext = "wav",
  maxVoices = 16,
  minMidi = 21,
  maxMidi = 108,
} = {}) {
  let masterGain = null;
  let nextVoiceId = 1;
  const voices = new Map(); // voiceId -> { source, gain, midiNote, startedAt }

  function ensureGraph() {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return null;
    if (!masterGain || masterGain.context !== ctx) {
      masterGain = ctx.createGain();
      masterGain.gain.value = 1;
      masterGain.connect(ctx.destination);
    }
    return ctx;
  }

  function cleanupVoice(voiceId) {
    const v = voices.get(voiceId);
    if (!v) return;
    voices.delete(voiceId);
    try {
      v.source.disconnect();
      v.gain.disconnect();
    } catch {}
  }

  function releaseVoice(voiceId, releaseMs = 30) {
    const v = voices.get(voiceId);
    if (!v) return;
    const ctx = v.source.context;
    const t0 = ctx.currentTime;
    const rel = Math.max(0.005, releaseMs / 1000);
    try {
      // cancelAndHoldAtTime avoids the click a plain cancelScheduledValues
      // would cause by snapping gain back to its pre-ramp value - see
      // R02's bufferVoice.js, same reasoning, same fallback for browsers
      // without it (Chrome 57+/Firefox 79+ have it; others use the
      // read-current-value fallback below).
      if (typeof v.gain.gain.cancelAndHoldAtTime === "function") {
        v.gain.gain.cancelAndHoldAtTime(t0);
      } else {
        v.gain.gain.cancelScheduledValues(t0);
        v.gain.gain.setValueAtTime(v.gain.gain.value, t0);
      }
      v.gain.gain.linearRampToValueAtTime(0.0001, t0 + rel);
      v.source.stop(t0 + rel + 0.02);
    } catch {}
    window.setTimeout(() => cleanupVoice(voiceId), (rel + 0.05) * 1000);
  }

  return {
    async unlock() {
      return unlockAudioContext();
    },

    // Exposes the AudioContext's own clock without exposing the context
    // itself - callers that need to synchronize multiple playNote() calls
    // to a shared future instant (e.g. all notes of a chord) compute
    // `now() + delaySeconds` and pass it as startAt below.
    now() {
      const ctx = ensureGraph();
      return ctx ? ctx.currentTime : 0;
    },

    setMasterGain(g) {
      ensureGraph();
      if (masterGain) {
        masterGain.gain.value = Math.max(0, Math.min(2, Number(g) || 0));
      }
    },

    // Resolves and decodes samples for the given MIDI notes without
    // playing them, so the cache is warm before playback starts - without
    // this, the very first time each pitch is played it pays a real
    // fetch+decode round trip, which can land audibly late.
    async preload(midis) {
      const ctx = ensureGraph();
      if (!ctx) return [];
      const list = Array.isArray(midis) ? midis : [];
      const settled = await Promise.allSettled(
        list.map(async (m) => {
          const resolved = await resolveSampleUrl(m, {
            sampleBasePath,
            ext,
            minMidi,
            maxMidi,
          });
          if (!resolved) return null;
          await getSampleBuffer(ctx, resolved.url);
          return resolved;
        }),
      );
      return settled
        .filter((r) => r.status === "fulfilled" && r.value)
        .map((r) => r.value);
    },

    // Async, unlike synthEngine's playNote: resolving + decoding a sample
    // is a real fetch/decode round trip on first use (instant afterwards,
    // cached by URL - see preload() above to warm the cache ahead of
    // time). Await it if you need the note to actually be sounding before
    // proceeding (e.g. to keep chord notes in sync). Throws if no
    // playable sample can be found for this note within [minMidi, maxMidi].
    async playNote(midiNote, { durationMs = null, velocity = 1, startAt = null } = {}) {
      const ctx = ensureGraph();
      if (!ctx) return null;

      const resolved = await resolveSampleUrl(midiNote, {
        sampleBasePath,
        ext,
        minMidi,
        maxMidi,
      });
      if (!resolved) {
        throw new Error(
          `sampleEngine: no playable sample found for midi ${midiNote} under ${sampleBasePath}`,
        );
      }

      const buffer = await getSampleBuffer(ctx, resolved.url);

      if (voices.size >= maxVoices) {
        // Steal the oldest voice (Maps preserve insertion order) rather
        // than silently refusing to play a new note.
        const oldestId = voices.keys().next().value;
        if (oldestId != null) releaseVoice(oldestId, 15);
      }

      const vel = Math.max(0, Math.min(1, Number(velocity) || 0));
      // Never schedule in the past - if startAt already elapsed (e.g. a
      // slow decode made us miss it), fall back to "now".
      const t0 =
        Number.isFinite(startAt) && startAt > 0
          ? Math.max(ctx.currentTime, startAt)
          : ctx.currentTime;

      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      // Pitch-shifts the sample from the pitch it was recorded at
      // (resolved.sampleMidi) up/down to the actual target note - most
      // notes don't have their own exact sample (see sampleResolver.js's
      // sparse per-octave anchor scheme).
      source.playbackRate.value = semitoneRate(midiNote - resolved.sampleMidi);
      gain.gain.value = vel;

      source.connect(gain);
      gain.connect(masterGain);

      const voiceId = nextVoiceId;
      nextVoiceId += 1;
      voices.set(voiceId, { source, gain, midiNote, startedAt: t0 });
      source.onended = () => cleanupVoice(voiceId);

      source.start(t0);

      if (Number.isFinite(durationMs) && durationMs > 0) {
        const dur = durationMs / 1000;
        const release = Math.min(0.08, dur * 0.4);
        try {
          gain.gain.setValueAtTime(vel, Math.max(t0, t0 + dur - release));
          gain.gain.linearRampToValueAtTime(0.0001, t0 + dur);
          source.stop(t0 + dur + 0.02);
        } catch {}
        // Defensive backup alongside onended above - matches R02's
        // bufferVoice.js, which doesn't rely on onended alone either.
        // Delay is measured from t0 (which can be in the future when
        // startAt is set), not from "now" - otherwise a note scheduled
        // ahead of time would have its backup cleanup fire before the
        // note actually finished playing.
        const untilT0Ms = Math.max(0, (t0 - ctx.currentTime) * 1000);
        window.setTimeout(
          () => cleanupVoice(voiceId),
          untilT0Ms + (dur + 0.1) * 1000,
        );
      }
      // If durationMs is omitted, the sample plays out to its natural
      // length, or until stopNote() releases it early.

      return voiceId;
    },

    // Ends a voice early with a short release. No-op if it already ended.
    stopNote(voiceId, releaseMs = 30) {
      releaseVoice(voiceId, releaseMs);
    },

    stopAll(releaseMs = 15) {
      for (const voiceId of [...voices.keys()]) {
        releaseVoice(voiceId, releaseMs);
      }
    },

    getActiveVoices() {
      return [...voices.entries()].map(([id, v]) => ({
        id,
        midiNote: v.midiNote,
        startedAt: v.startedAt,
      }));
    },

    dispose() {
      this.stopAll(5);
      try {
        masterGain?.disconnect();
      } catch {}
      masterGain = null;
    },
  };
}

export default createSampleEngine;
