"use client";

import { useMemo } from "react";
import { buildKeyboardLayout } from "../model";

const PX_PER_BEAT = 80;
const PLAYHEAD_Y = 280;

function buildMidiGeometry({ startMidi, endMidi, keyW, blackW }) {
  const { whites, blacks } = buildKeyboardLayout({ startMidi, endMidi });
  const geo = new Map();

  for (const key of whites) {
    geo.set(key.midi, {
      x: key.whiteIndex * keyW,
      w: keyW,
      isBlack: false,
    });
  }

  for (const key of blacks) {
    const x = key.leftWhiteIndex * keyW + keyW - blackW / 2;
    geo.set(key.midi, { x, w: blackW, isBlack: true });
  }

  return geo;
}

// timeline is sorted by startBeat (see buildNoteTimeline.js), so a binary
// search finds the visible window's boundaries in O(log n) instead of
// scanning every note in the song on every single step. This matters a
// lot for a dense, fast piece like Take Five (1194 notes, 166 BPM): a
// plain .filter() over the whole timeline, re-run on every note onset
// (including fast melodic runs firing many times per second), was real,
// measurable per-step overhead - not a leak, but a cost that compounds
// visibly during the piece's busiest passages, which is exactly the
// "slows down at a certain point" symptom.
function lowerBound(arr, matches) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (matches(arr[mid])) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function beatToY(beat, currentBeat) {
  return PLAYHEAD_Y - (beat - currentBeat) * PX_PER_BEAT;
}

export default function FallingNotesPanel({
  timeline = [],
  currentBeat = 0,
  beatsPerBar = 4,
  startMidi = 24,
  endMidi = 96,
  keyW = 28,
  blackW = 18,
  totalWidth,
  geo: geoProp,
}) {
  // Prefer the geometry computed once by KeyboardPanel/useKeyboardPanelVm
  // (passed down via the render-prop) so the falling-notes columns line up
  // exactly with the rendered keys instead of being derived a second time
  // from startMidi/endMidi. Falls back to a local computation only when
  // used standalone, without a KeyboardPanel parent.
  const ownGeo = useMemo(
    () =>
      geoProp
        ? null
        : buildMidiGeometry({ startMidi, endMidi, keyW, blackW }),
    [geoProp, startMidi, endMidi, keyW, blackW],
  );
  const geo = geoProp ?? ownGeo;

  const fittedWidth = useMemo(() => {
    if (Number.isFinite(totalWidth) && totalWidth > 0) return totalWidth;
    const { whites } = buildKeyboardLayout({ startMidi, endMidi });
    return whites.length * keyW;
  }, [startMidi, endMidi, keyW, totalWidth]);

  const lookaheadBeats = PLAYHEAD_Y / PX_PER_BEAT;
  const tailBeats = 0;

  // Computed once per song load (timeline is stable across steps), used
  // as a safety margin so a long-ringing note that started before the
  // window isn't missed by the binary search below.
  const maxNoteDurBeats = useMemo(() => {
    let max = 0;
    for (const note of timeline) {
      const d = note.endBeat - note.startBeat;
      if (d > max) max = d;
    }
    return max;
  }, [timeline]);

  const visibleNotes = useMemo(() => {
    const upperLimit = currentBeat + lookaheadBeats;
    const lowerLimit = currentBeat - tailBeats - maxNoteDurBeats;

    const startIdx = lowerBound(timeline, (n) => n.startBeat >= lowerLimit);
    const endIdx = lowerBound(timeline, (n) => n.startBeat >= upperLimit);

    const out = [];
    for (let i = startIdx; i < endIdx; i += 1) {
      const note = timeline[i];
      const midi = Number(note.midi);
      if (!Number.isFinite(midi) || !geo.has(midi)) continue;
      if (
        note.endBeat > currentBeat - tailBeats &&
        note.startBeat < currentBeat + lookaheadBeats
      ) {
        out.push(note);
      }
    }
    return out;
  }, [timeline, currentBeat, lookaheadBeats, tailBeats, geo, maxNoteDurBeats]);

  const barLines = useMemo(() => {
    const lines = [];
    const firstBar = Math.floor((currentBeat - tailBeats) / beatsPerBar);
    const lastBar = Math.ceil((currentBeat + lookaheadBeats) / beatsPerBar) + 1;

    for (let bar = firstBar; bar <= lastBar; bar += 1) {
      const barBeat = bar * beatsPerBar;
      const y = beatToY(barBeat, currentBeat);
      if (y >= 0 && y <= PLAYHEAD_Y) {
        lines.push({ label: `bar ${bar + 1}`, y });
      }
    }

    return lines;
  }, [currentBeat, beatsPerBar, lookaheadBeats, tailBeats]);

  return (
    <div
      className="relative overflow-hidden bg-zinc-950"
      style={{ width: fittedWidth, height: PLAYHEAD_Y }}
    >
      {[...geo.entries()]
        .filter(([, col]) => col.isBlack)
        .map(([midi, col]) => (
          <div
            key={`shade-${midi}`}
            className="absolute top-0 bottom-0 bg-black/30"
            style={{ left: col.x, width: col.w }}
          />
        ))}

      {[...geo.entries()]
        .filter(([, col]) => !col.isBlack)
        .map(([midi, col]) => (
          <div
            key={`div-${midi}`}
            className="absolute top-0 bottom-0 w-px bg-white/4"
            style={{ left: col.x }}
          />
        ))}

      {barLines.map(({ label, y }) => (
        <div
          key={label}
          className="pointer-events-none absolute left-0 right-0"
          style={{ top: Math.round(y) }}
        >
          <div className="h-px bg-white/15" />
          <span
            className="absolute left-1 select-none text-[10px] leading-none text-white/25"
            style={{ top: -11 }}
          >
            {label}
          </span>
        </div>
      ))}

      {visibleNotes.map((note) => {
        const midi = Number(note.midi);
        const col = geo.get(midi);
        if (!col) return null;

        const yTop = beatToY(note.endBeat, currentBeat);
        const yBottom = beatToY(note.startBeat, currentBeat);

        const top = Math.max(0, yTop);
        const bottom = Math.min(PLAYHEAD_Y, yBottom);
        const height = bottom - top;
        if (height <= 0) return null;

        const isSounding =
          note.startBeat <= currentBeat && note.endBeat > currentBeat;

        return (
          <div
            key={note.id}
            className={[
              "absolute rounded-sm",
              isSounding
                ? "bg-emerald-400"
                : col.isBlack
                  ? "bg-violet-500"
                  : "bg-violet-300",
            ].join(" ")}
            style={{
              left: col.x + 1,
              top,
              width: Math.max(2, col.w - 2),
              height: Math.max(4, height),
            }}
          />
        );
      })}
    </div>
  );
}
