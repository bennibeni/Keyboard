"use client";

import { getOrCreateAudioContext, unlockAudioContext } from "./context";
import { midiToFrequency } from "./midi";

const WAVEFORMS = new Set(["sine", "square", "sawtooth", "triangle"]);

export function createSynthEngine({
  waveform: defaultWaveform = "sine",
  maxVoices = 16,
} = {}) {
  let masterGain = null;
  let nextVoiceId = 1;
  const voices = new Map(); // voiceId -> { osc, gain, midiNote, startedAt }

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
      v.osc.disconnect();
      v.gain.disconnect();
    } catch {}
  }

  function releaseVoice(voiceId, releaseMs = 30) {
    const v = voices.get(voiceId);
    if (!v) return;
    const ctx = v.osc.context;
    const t0 = ctx.currentTime;
    const rel = Math.max(0.005, releaseMs / 1000);
    try {
      v.gain.gain.cancelScheduledValues(t0);
      v.gain.gain.setValueAtTime(v.gain.gain.value, t0);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, t0 + rel);
      v.osc.stop(t0 + rel + 0.01);
    } catch {}
    window.setTimeout(() => cleanupVoice(voiceId), (rel + 0.02) * 1000);
  }

  return {
    async unlock() {
      return unlockAudioContext();
    },

    // Exposes the AudioContext's own clock, same idea as sampleEngine's
    // now() - callers that need to schedule a note for a precise future
    // instant (rather than "right now") compute now() + delaySeconds and
    // pass it as startAt below, instead of relying on setTimeout/
    // performance.now() firing exactly on time.
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

    // Plays a note, returns a voiceId you can pass to stopNote() to end it
    // early. If durationMs is given, the voice stops itself automatically -
    // stopNote() is only needed for manual early cutoff (e.g. a sustain
    // pedal being released) or to hold a note indefinitely (omit
    // durationMs) until you explicitly stop it.
    // startAt (AudioContext seconds, from now()) schedules the onset at a
    // precise audio-clock instant instead of "whenever this call happens
    // to execute" - mirrors sampleEngine.playNote's startAt.
    playNote(
      midiNote,
      { durationMs = null, velocity = 1, waveform, startAt = null } = {},
    ) {
      const ctx = ensureGraph();
      if (!ctx) return null;

      if (voices.size >= maxVoices) {
        // Steal the oldest voice (Maps preserve insertion order) rather
        // than silently refusing to play a new note.
        const oldestId = voices.keys().next().value;
        if (oldestId != null) releaseVoice(oldestId, 15);
      }

      const freq = midiToFrequency(midiNote);
      const vel = Math.max(0, Math.min(1, Number(velocity) || 0));
      const wf = WAVEFORMS.has(waveform) ? waveform : defaultWaveform;

      // Never schedule in the past - if startAt already elapsed (e.g. a
      // slow caller made us miss it), fall back to "now". Same guard as
      // sampleEngine.playNote.
      const t0 =
        Number.isFinite(startAt) && startAt > 0
          ? Math.max(ctx.currentTime, startAt)
          : ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wf;
      osc.frequency.value = freq;

      const attack = 0.01;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, vel),
        t0 + attack,
      );

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t0);

      const voiceId = nextVoiceId;
      nextVoiceId += 1;
      voices.set(voiceId, { osc, gain, midiNote, startedAt: t0 });
      osc.onended = () => cleanupVoice(voiceId);

      if (Number.isFinite(durationMs) && durationMs > 0) {
        const dur = durationMs / 1000;
        const release = Math.min(0.08, dur * 0.4);
        const sustainUntil = Math.max(t0 + attack, t0 + dur - release);
        gain.gain.setValueAtTime(Math.max(0.0001, vel), sustainUntil);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.stop(t0 + dur + 0.02);
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
      // If durationMs is omitted, the voice just holds at `vel` until
      // stopNote()/stopAll()/dispose() releases it.

      return voiceId;
    },

    // Ends a voice early with a short release, instead of waiting for its
    // own durationMs (if any) to elapse, or for a held (no-duration) note
    // to be released. No-op if the voice already ended.
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

export default createSynthEngine;
