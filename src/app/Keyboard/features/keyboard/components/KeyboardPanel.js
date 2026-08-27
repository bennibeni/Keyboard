"use client";

import { useMemo } from "react";
import useKeyboardPanelVm from "../hooks/useKeyboardPanelVm";
import usePlayableKeyboard from "../hooks/usePlayableKeyboard";
import KeyboardPanelView from "./KeyboardPanelView";

// ---------------------------------------------------------------------------
// PATTERN: Container/Wrapper component - the "smart" half.
//
// This component owns everything KeyboardPanelView.js (the dumb View) must
// NOT know about:
//   - wiring live keyboard input + the audio engine (usePlayableKeyboard,
//     which itself goes through KeyboardEngineProxy - see
//     runtime/keyboardEngineProxy.js)
//   - computing the geometry/viewport/responsive-sizing viewmodel
//     (useKeyboardPanelVm)
//   - merging externally-driven active notes (e.g. a song currently
//     playing) with live-played ones into a single `activeSet`
//   - resolving the `children` render-prop (used by KeyboardRollSection to
//     inject FallingNotesPanel as an overlay) into a plain `overlay` node
//
// Previously all of this - hooks AND markup - lived in one file
// (KeyboardPanel.js). Splitting it means KeyboardPanelView.js can be
// reasoned about, tested, or restyled without touching any audio/viewmodel
// logic, and this Container can change how the viewmodel is computed
// without touching a single line of markup.
// ---------------------------------------------------------------------------
export default function KeyboardPanel({
  activeMidis = [],
  bpm,
  melodyCutoffMidi,
  debugChord,
  fromMidi = 21,
  toMidi = 108,
  startMidi,
  endMidi,
  keyW = 28,
  whiteH = 148,
  blackW = 18,
  blackH = 92,
  children = null,
}) {
  const playable = usePlayableKeyboard({
    fromMidi: startMidi ?? fromMidi,
    toMidi: endMidi ?? toMidi,
  });

  const combinedActiveMidis = useMemo(
    () => [...new Set([...activeMidis, ...playable.activeMidis])],
    [activeMidis, playable.activeMidis],
  );

  const {
    viewportRef,
    effectiveFromMidi,
    effectiveToMidi,
    activeSet,
    whites,
    blacks,
    geo,
    keyCount,
    currentKeyW,
    currentWhiteH,
    currentBlackW,
    currentBlackH,
    currentTotalWidth,
    labelSize,
    detectedChord,
  } = useKeyboardPanelVm({
    activeMidis: combinedActiveMidis,
    bpm,
    melodyCutoffMidi,
    debugChord,
    fromMidi,
    toMidi,
    startMidi,
    endMidi,
    keyW,
    whiteH,
    blackW,
    blackH,
  });

  // Resolved here, not in the View - KeyboardPanelView only ever sees a
  // plain `overlay` node, never the render-prop function itself.
  const overlay =
    typeof children === "function"
      ? children({
          startMidi: effectiveFromMidi,
          endMidi: effectiveToMidi,
          keyW: currentKeyW,
          blackW: currentBlackW,
          totalWidth: currentTotalWidth,
          geo,
        })
      : children;

  return (
    <KeyboardPanelView
      keyCount={keyCount}
      effectiveFromMidi={effectiveFromMidi}
      effectiveToMidi={effectiveToMidi}
      whites={whites}
      blacks={blacks}
      activeSet={activeSet}
      currentKeyW={currentKeyW}
      currentWhiteH={currentWhiteH}
      currentBlackW={currentBlackW}
      currentBlackH={currentBlackH}
      currentTotalWidth={currentTotalWidth}
      labelSize={labelSize}
      detectedChord={detectedChord}
      overlay={overlay}
      viewportRef={viewportRef}
      onPress={playable.press}
      onRelease={playable.release}
    />
  );
}
