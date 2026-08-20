"use client";

import { useMemo } from "react";
import { buildKeyboardLayout } from "../model";
import useKeyboardViewport from "./useKeyboardViewport";
import useNormalizedActiveMidis from "./useNormalizedActiveMidis";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function useKeyboardPanelVm({
  activeMidis,
  fromMidi = 21,
  toMidi = 108,
  startMidi,
  endMidi,
  keyW = 28,
  whiteH = 148,
  blackW = 18,
  blackH = 92,
}) {
  const effectiveFromMidi = Math.round(Number(startMidi ?? fromMidi));
  const effectiveToMidi = Math.round(Number(endMidi ?? toMidi));
  const normalizedActiveMidis = useNormalizedActiveMidis(activeMidis);

  const activeSet = useMemo(
    () => new Set(normalizedActiveMidis),
    [normalizedActiveMidis],
  );

  const { viewportRef, viewportWidth } = useKeyboardViewport();

  const { whites, blacks } = useMemo(
    () =>
      buildKeyboardLayout({
        startMidi: effectiveFromMidi,
        endMidi: effectiveToMidi,
      }),
    [effectiveFromMidi, effectiveToMidi],
  );

  const metrics = useMemo(() => {
    const whiteCount = whites.length;
    const safeWhiteCount = Math.max(whiteCount, 1);
    const fittedKeyW =
      viewportWidth > 0 ? Math.min(keyW, viewportWidth / safeWhiteCount) : keyW;
    const currentKeyW = Number(fittedKeyW.toFixed(3));
    const ratio = keyW > 0 ? currentKeyW / keyW : 1;

    return {
      currentKeyW,
      currentWhiteH: Math.max(72, Number((whiteH * ratio).toFixed(3))),
      currentBlackW: Math.max(8, Number((blackW * ratio).toFixed(3))),
      currentBlackH: Math.max(44, Number((blackH * ratio).toFixed(3))),
      currentTotalWidth: Number((whiteCount * currentKeyW).toFixed(3)),
      labelSize: clamp(Math.round(10 * ratio), 0, 10),
    };
  }, [whites.length, keyW, viewportWidth, whiteH, blackW, blackH]);

  // Single source of truth for per-key x/width geometry, built from the
  // fitted (responsive) key sizes actually used for rendering. Shared with
  // any overlay (e.g. FallingNotesPanel) via the render-prop below, instead
  // of each consumer re-deriving its own layout from startMidi/endMidi.
  const geo = useMemo(() => {
    const map = new Map();
    for (const key of whites) {
      map.set(key.midi, {
        x: key.whiteIndex * metrics.currentKeyW,
        w: metrics.currentKeyW,
        isBlack: false,
      });
    }
    for (const key of blacks) {
      const x =
        key.leftWhiteIndex * metrics.currentKeyW +
        metrics.currentKeyW -
        metrics.currentBlackW / 2;
      map.set(key.midi, { x, w: metrics.currentBlackW, isBlack: true });
    }
    return map;
  }, [whites, blacks, metrics.currentKeyW, metrics.currentBlackW]);

  return {
    geo,
    viewportRef,
    viewportWidth,
    effectiveFromMidi,
    effectiveToMidi,
    normalizedActiveMidis,
    activeSet,
    whites,
    blacks,
    keyCount: Math.max(0, effectiveToMidi - effectiveFromMidi + 1),
    ...metrics,
  };
}

export default useKeyboardPanelVm;
