"use client";

import { midiToSampleKey } from "./sampleNames";

const PROBE_CACHE = new Map(); // url -> Promise<boolean>
const RESOLVE_CACHE = new Map(); // cacheKey -> Promise<{url, sampleMidi} | null>

// C, D#, F#, A per octave: a common sparse piano-sampling scheme (4
// samples per octave, evenly spaced by major thirds) - matches R02's
// piano-engine convention.
const ANCHOR_PITCH_CLASSES = [0, 3, 6, 9];

async function probeUrlOk(url) {
  if (PROBE_CACHE.has(url)) return PROBE_CACHE.get(url);

  const p = (async () => {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res && typeof res.status === "number") {
        if (res.status === 405) {
          // Some static hosts don't support HEAD - fall back to GET.
          const res2 = await fetch(url, { method: "GET" });
          return !!res2?.ok;
        }
        return !!res.ok;
      }
      return false;
    } catch {
      return false;
    }
  })();

  PROBE_CACHE.set(url, p);
  return p;
}

function candidateMidisFor(targetMidi, minMidi, maxMidi) {
  const oct = Math.floor(targetMidi / 12) - 1;
  const anchors = ANCHOR_PITCH_CLASSES.map((pc) => (oct + 1) * 12 + pc);
  const nearOctave = [targetMidi - 12, targetMidi + 12];

  const out = [];
  for (const m of [targetMidi, ...anchors, ...nearOctave]) {
    if (Number.isFinite(m) && m >= minMidi && m <= maxMidi && !out.includes(m)) {
      out.push(m);
    }
  }
  return out;
}

export async function resolveSampleUrl(
  targetMidi,
  { sampleBasePath = "/samples/piano", ext = "wav", minMidi = 21, maxMidi = 108 } = {},
) {
  const cacheKey = `${sampleBasePath}|${ext}|${targetMidi}`;
  if (RESOLVE_CACHE.has(cacheKey)) return RESOLVE_CACHE.get(cacheKey);

  const p = (async () => {
    const candidates = candidateMidisFor(targetMidi, minMidi, maxMidi);
    for (const sampleMidi of candidates) {
      const url = `${sampleBasePath}/${midiToSampleKey(sampleMidi)}.${ext}`;
      const ok = await probeUrlOk(url);
      if (ok) return { url, sampleMidi };
    }
    return null;
  })();

  RESOLVE_CACHE.set(cacheKey, p);
  return p;
}

export function clearSampleResolveCache() {
  PROBE_CACHE.clear();
  RESOLVE_CACHE.clear();
}
