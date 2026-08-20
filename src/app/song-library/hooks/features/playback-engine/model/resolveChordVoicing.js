import { clamp } from "../../../shared/music/math";
import { deriveAccentForEvent } from "./accents";
import { resolveTimeSignatureAt } from "./resolveTimeSignatureAt";

// accentParams' "strong" case peaks at velMul=1.35 (see model/accents.js).
// Without pre-scaling the base velocity down first, a strong beat on a
// note that's already near full volume would just clip to the same
// ceiling as everything else, erasing the intended contrast - same
// reasoning as R02's strongVelMul headroom.
const ACCENT_STRONG_PEAK = 1.35;

// Pure chord-voicing logic, previously buried inside usePlaySong.js's
// playChord closure - no React, no audio engine, just event+settings in,
// per-note {midi, velocity, durationMs} out. Extracted so this can be
// reasoned about (and unit-tested, if that ever happens - see the
// earlier review's note on test coverage) independently of the
// scheduling/engine-lifecycle concerns that now stay in usePlaySong.js.
//
// `event` is one canonical-shaped event (song-canonical@1, see
// @app/song-library): { tBeat|t, notes: [{ midi, velocity|vel }] }.
// `songTime` is the song's top-level `time` object, used to resolve
// which time signature is in effect at this event (see
// resolveTimeSignatureAt.js).
export function resolveChordVoicing({
  event,
  songTime,
  sustainMs,
  bassScale,
  rhScale,
  accentsEnabled,
  accentAmount,
  chordHeadroom,
  minNoteMs,
  maxNoteMs,
}) {
  const notes = event?.notes || [];
  const chordScale = chordHeadroom / Math.sqrt(Math.max(1, notes.length));
  const baseDurationMs = clamp(sustainMs, minNoteMs, maxNoteMs);

  // Same idea as R02's deriveAccentForEvent: strong/medium/weak beats
  // within the bar get different velocity and ring length, instead of
  // every note landing at the same flat intensity. Signature is
  // re-resolved per event (honors song.time.timeChanges if the song has
  // any) rather than frozen once for the whole piece.
  const tBeats = Number(event?.t ?? event?.tBeat) || 0;
  const ap = deriveAccentForEvent({
    tBeats,
    timeSignatureStr: resolveTimeSignatureAt(tBeats, songTime),
    accentAmount,
    accentsEnabled,
    quant: 0.5,
  });
  const accentHeadroom = accentsEnabled ? 1 / ACCENT_STRONG_PEAK : 1;
  const durationMs = clamp(baseDurationMs * ap.stopMul, minNoteMs, maxNoteMs);

  // The lowest-pitched note in the chord is treated as "the bass" and
  // scaled separately from the rest. R02's playChordBuffered.js does
  // this too (bassScale/rhScale), but picks the FIRST note in the array
  // as a proxy for bass, which only works if notes happen to be ordered
  // by pitch. Finding the actual minimum midi is more robust regardless
  // of how the source data orders notes within an event.
  const minMidi =
    notes.length > 0 ? Math.min(...notes.map((n) => Number(n?.midi))) : null;

  return notes.map((note) => {
    const rawVel = Number(note?.velocity ?? note?.vel);
    const isBass = Number(note?.midi) === minMidi;
    const registerScale = isBass ? bassScale : rhScale;
    const baseVel =
      (Number.isFinite(rawVel) ? rawVel : 1) *
      chordScale *
      accentHeadroom *
      registerScale;
    const velocity = clamp(baseVel * ap.velMul * ap.velNorm, 0, 1);

    return { midi: note.midi, velocity, durationMs };
  });
}

export default resolveChordVoicing;
