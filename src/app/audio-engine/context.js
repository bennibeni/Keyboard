"use client";

// Shared AudioContext singleton, stored on `window` rather than a plain
// module-level variable, so it stays a true singleton even if this module
// ends up loaded from more than one bundle chunk (can happen with code
// splitting) - not because of any per-route naming reason. Key is scoped
// to this engine specifically, not to whatever route happens to import it.
const GLOBAL_KEY = "__audioEngineSharedCtx";

function getAudioContextCtor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

export function getOrCreateAudioContext() {
  if (typeof window === "undefined") return null;

  const existing = window[GLOBAL_KEY];
  if (existing && existing.state !== "closed") return existing;

  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) return null;

  window[GLOBAL_KEY] = new AudioContextCtor();
  return window[GLOBAL_KEY];
}

export async function unlockAudioContext() {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state !== "running") await ctx.resume();
    return ctx.state === "running";
  } catch {
    return false;
  }
}

export function isAudioContextRunning() {
  if (typeof window === "undefined") return false;
  const ctx = window[GLOBAL_KEY];
  return !!ctx && ctx.state === "running";
}
