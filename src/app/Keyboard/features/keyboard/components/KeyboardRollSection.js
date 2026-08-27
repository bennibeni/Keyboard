"use client";

import { memo, useMemo } from "react";
import { parseTimeSignatureStr } from "../../../shared/music/timeSignature";
import { resolveTimeSignatureAt } from "../../playback-engine/model/resolveTimeSignatureAt";
import { useNowPlaying } from "../../playback-engine/hooks/useNowPlaying";
import FallingNotesPanel from "./FallingNotesPanel";
import KeyboardPanel from "./KeyboardPanel";
import {
  buildNoteTimeline,
  START_MIDI,
  END_MIDI,
  KEY_W,
  WHITE_H,
  BLACK_W,
  BLACK_H,
} from "../model";

function KeyboardRollSection({ events = [], time, bpm, melodyCutoffMidi, debugChord }) {
  const { tBeat: currentBeat, activeMidis } = useNowPlaying();
  const timeline = useMemo(() => buildNoteTimeline(events), [events]);

  // Resolved at the current beat position rather than fixed once for the
  // whole song, so a song with real timeChanges (see
  // features/playback-engine/model/resolveTimeSignatureAt.js) gets correct bar
  // lines even after a mid-piece signature change.
  const beatsPerBar = useMemo(() => {
    const tsStr = resolveTimeSignatureAt(currentBeat, time);
    const { num } = parseTimeSignatureStr(tsStr);
    return Number.isFinite(num) && num > 0 ? num : 4;
  }, [currentBeat, time]);

  return (
    <KeyboardPanel
      activeMidis={activeMidis}
      bpm={bpm}
      melodyCutoffMidi={melodyCutoffMidi}
      debugChord={debugChord}
      startMidi={START_MIDI}
      endMidi={END_MIDI}
      keyW={KEY_W}
      whiteH={WHITE_H}
      blackW={BLACK_W}
      blackH={BLACK_H}
    >
      {({ startMidi, endMidi, keyW, blackW, totalWidth, geo }) => (
        <FallingNotesPanel
          timeline={timeline}
          currentBeat={currentBeat}
          beatsPerBar={beatsPerBar}
          startMidi={startMidi}
          endMidi={endMidi}
          keyW={keyW}
          blackW={blackW}
          totalWidth={totalWidth}
          geo={geo}
        />
      )}
    </KeyboardPanel>
  );
}

export default memo(KeyboardRollSection);
