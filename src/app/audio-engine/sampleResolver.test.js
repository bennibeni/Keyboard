import { afterEach, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { resolveSampleUrl } from "./sampleResolver";
import { midiToNoteName, midiToSampleKey } from "./sampleNames";

afterEach(() => vi.unstubAllGlobals());

it("resolves all 88 bundled keys to existing files without network probes", async () => {
  const fetch = vi.fn(() => { throw new Error("Unexpected probe"); });
  vi.stubGlobal("fetch", fetch);
  for (let midi = 21; midi <= 108; midi++) {
    for (const ext of ["wav", "mp3"]) {
      const sample = await resolveSampleUrl(midi, { ext });
      expect(sample.sampleMidi).toBe(midi);
      expect(existsSync(`public${sample.url}`), sample.url).toBe(true);
    }
  }
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps display names uppercase while matching actual sample filename case", () => {
  expect(midiToNoteName(60)).toBe("C4");
  expect(midiToSampleKey(60)).toBe("c4");
  expect(midiToSampleKey(61)).toBe("Cs4");
});

it("rejects invalid notes and respects engine limits", async () => {
  for (const midi of [20, 109, 60.5, NaN]) {
    expect(await resolveSampleUrl(midi)).toBeNull();
  }
  expect(await resolveSampleUrl(60, { minMidi: 61 })).toBeNull();
  expect(await resolveSampleUrl(72, { maxMidi: 71 })).toBeNull();
});
