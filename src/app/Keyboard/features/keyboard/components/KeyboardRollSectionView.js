"use client";

import { memo } from "react";
import FallingNotesPanel from "./FallingNotesPanel";
import KeyboardPanel from "./KeyboardPanel";

// ---------------------------------------------------------------------------
// PATTERN: Container/Wrapper component - the "dumb" View half, same split
// as KeyboardPanel.js / KeyboardPanelView.js.
//
// This component's only job is composition: given a timeline, a current
// beat, a time-signature-derived beatsPerBar, and the visible MIDI range,
// it wires KeyboardPanel's render-prop to inject FallingNotesPanel as the
// overlay. It never calls useNowPlaying, never builds the note timeline,
// and never resolves a time signature - all of that is "smart" work that
// belongs to the Container (KeyboardRollSection.js), not here.
//
// Note this View is still "dumb" in the Container/Wrapper sense even
// though it renders other components rather than raw DOM elements (unlike
// KeyboardPanelView.js) - what matters for the pattern is that it has no
// business logic of its own, only presentation/composition from props.
// ---------------------------------------------------------------------------
function KeyboardRollSectionView({
  activeMidis,
  timeline,
  currentBeat,
  beatsPerBar,
  startMidi,
  endMidi,
  keyW,
  whiteH,
  blackW,
  blackH,
}) {
  return (
    <KeyboardPanel
      activeMidis={activeMidis}
      startMidi={startMidi}
      endMidi={endMidi}
      keyW={keyW}
      whiteH={whiteH}
      blackW={blackW}
      blackH={blackH}
    >
      {({ startMidi: geoStartMidi, endMidi: geoEndMidi, keyW: geoKeyW, blackW: geoBlackW, totalWidth, geo }) => (
        <FallingNotesPanel
          timeline={timeline}
          currentBeat={currentBeat}
          beatsPerBar={beatsPerBar}
          startMidi={geoStartMidi}
          endMidi={geoEndMidi}
          keyW={geoKeyW}
          blackW={geoBlackW}
          totalWidth={totalWidth}
          geo={geo}
        />
      )}
    </KeyboardPanel>
  );
}

export default memo(KeyboardRollSectionView);
