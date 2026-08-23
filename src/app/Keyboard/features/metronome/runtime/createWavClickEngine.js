"use client";

function createAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  return AudioContextClass ? new AudioContextClass() : null;
}

export function createWavClickEngine({ strongUrl, midUrl, weakUrl }) {
  let context = null;
  let masterGain = null;
  let loadingPromise = null;
  const buffers = { strong: null, medium: null, weak: null };

  function ensureContext() {
    if (context) return context;
    context = createAudioContext();
    if (!context) return null;
    masterGain = context.createGain();
    masterGain.connect(context.destination);
    return context;
  }

  async function loadOnce() {
    const ctx = ensureContext();
    if (!ctx) return false;
    if (loadingPromise) return loadingPromise;

    loadingPromise = Promise.all(
      Object.entries({ strong: strongUrl, medium: midUrl, weak: weakUrl }).map(
        async ([kind, url]) => {
          if (!url) return;
          try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            buffers[kind] = await ctx.decodeAudioData(await response.arrayBuffer());
          } catch {
            buffers[kind] = null;
          }
        },
      ),
    ).then(() => Object.values(buffers).some(Boolean));

    return loadingPromise;
  }

  async function unlock() {
    const ctx = ensureContext();
    if (ctx?.state === "suspended") await ctx.resume();
    return Boolean(ctx);
  }

  function play(kind, { velocity = 1, startAt = null } = {}) {
    const ctx = ensureContext();
    const buffer =
      buffers[kind] || buffers.weak || buffers.medium || buffers.strong;
    if (!ctx || !buffer || !masterGain) return false;

    const source = ctx.createBufferSource();
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = Math.max(0, Math.min(1, Number(velocity) || 0));
    source.buffer = buffer;
    source.connect(voiceGain);
    voiceGain.connect(masterGain);
    source.start(Math.max(ctx.currentTime, Number(startAt) || ctx.currentTime));
    return true;
  }

  function now() {
    return ensureContext()?.currentTime ?? 0;
  }

  function setMasterGain(value) {
    if (!masterGain) ensureContext();
    if (masterGain) masterGain.gain.value = Math.max(0, Number(value) || 0);
  }

  return { loadOnce, now, play, setMasterGain, unlock };
}

export default createWavClickEngine;
