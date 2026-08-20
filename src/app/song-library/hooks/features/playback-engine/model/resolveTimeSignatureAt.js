"use client";

// Resolves which time signature is in effect at a given beat position -
// necessary because a signature read once and frozen for the whole piece
// goes out of phase the moment the piece actually changes signature
// mid-way (see time.timeChanges in R02's
// features/song-library/songs/someone-like-you-easy-piano.canonical.js
// for a real example: 4/4 -> 2/4 -> 4/4 -> 2/4 -> 4/4).
//
// Canon in D itself has no timeChanges (stays 4/4 throughout, 102 bars) -
// this exists so a different piece loaded later doesn't silently get
// wrong/drifting accents.
//
// Takes the canonical `time` object directly (i.e. song.time, after
// normalizeMusicSeqToCanonical - see @app/song-library), not a raw song's
// own meta.time shape. normalizeMusicSeqToCanonical now preserves
// timeChanges rather than dropping it (that was a real gap - see the
// comment there), which this relies on.
//
// Deliberately takes only (tBeats, time) - no bpm. Bar position is a
// beat-space concept, entirely independent of tempo; bpm only matters
// when converting beats to wall-clock ms elsewhere (runScheduledPlayback.js).
// Mixing bpm into this resolution would make the accent phase depend on
// whatever tempo the user happens to have chosen, which is wrong - the
// same note is on the same beat of the same bar regardless of how fast
// it's played.
export function resolveTimeSignatureAt(tBeats, time) {
  const base = time?.timeSignature || "4/4";
  const rawChanges = time?.timeChanges;

  if (!Array.isArray(rawChanges) || rawChanges.length === 0) {
    return base;
  }

  const t = Number(tBeats) || 0;

  // Sorted defensively rather than assumed - this runs once per event
  // triggered, and timeChanges lists are tiny (a handful of entries even
  // for a piece that modulates meter repeatedly), so the cost is
  // negligible either way.
  const changes = [...rawChanges]
    .map((c) => ({
      tBeat: Number(c?.tBeat) || 0,
      timeSignature: c?.timeSignature || base,
    }))
    .sort((a, b) => a.tBeat - b.tBeat);

  let current = base;
  for (const change of changes) {
    if (change.tBeat > t) break;
    current = change.timeSignature;
  }

  return current;
}

export default resolveTimeSignatureAt;
