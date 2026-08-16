"use client";

const BUFFER_CACHE = new Map(); // url -> Promise<AudioBuffer>

export async function getSampleBuffer(ctx, url) {
  if (!ctx) throw new Error("getSampleBuffer: missing AudioContext");
  if (!url) throw new Error("getSampleBuffer: missing url");

  if (!BUFFER_CACHE.has(url)) {
    const promise = (async () => {
      const res = await fetch(url);
      if (!res?.ok) throw new Error(`sample fetch failed: ${url}`);
      const arrayBuffer = await res.arrayBuffer();
      return ctx.decodeAudioData(arrayBuffer.slice(0));
    })();

    BUFFER_CACHE.set(url, promise);
  }

  try {
    return await BUFFER_CACHE.get(url);
  } catch (err) {
    BUFFER_CACHE.delete(url); // allow retrying after a transient failure
    throw err;
  }
}

export function clearSampleBufferCache() {
  BUFFER_CACHE.clear();
}
