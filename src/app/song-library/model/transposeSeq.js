// Pure transposition logic - given a canonical seq (song-canonical@1, see
// normalizeMusicSeqToCanonical.js) and a target tonic note name, returns a
// NEW seq with every note.midi/midis shifted by the semitone offset needed
// to move the song's own declared key (seq.meta.key.tonic) to the target
// tonic. Mode (major/minor) is preserved - this is a real transposition
// (same interval content, different starting pitch), not a major<->minor
// reharmonization, which is a different and much harder problem.
//
// Deliberately does NOT mutate the input seq: `entry.load()` in
// songRegistry.js resolves through a cached dynamic import(), so the same
// seq object is reused across every load of the same song - mutating it
// in place would corrupt subsequent loads (including at a different
// target key, or with no transposition at all).

const NOTE_TO_PITCH_CLASS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Accepts "D", "D#", "Db", case-insensitively. Returns 0-11, or null if
// the name doesn't parse - callers treat null as "can't transpose"
// rather than guessing.
export function noteNameToPitchClass(name) {
  if (typeof name !== "string") return null;
  const m = name.trim().match(/^([A-Ga-g])([#b]?)$/);
  if (!m) return null;
  const base = NOTE_TO_PITCH_CLASS[m[1].toUpperCase()];
  if (base == null) return null;
  const accidental = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return ((base + accidental) % 12 + 12) % 12;
}

// Smallest-distance signed semitone offset from sourceTonic to
// targetTonic, in (-6, 6] - e.g. going from C to B is -1 (down a
// semitone), not +11 (up almost two octaves), even though both reach the
// same pitch class. Minimizing the shift also minimizes how many notes
// end up pushed outside the sample-resolvable/keyboard-visible MIDI
// range (see usePlaySong.js's playChord catch and FallingNotesPanel's
// geo.has(midi) check - both already silently drop out-of-range notes,
// which is exactly the "lascia perdere quella nota" behavior this
// feature was designed around; keeping the shift small just means fewer
// notes hit that path in the first place).
export function computeTransposeSemitones(sourceTonic, targetTonic) {
  const src = noteNameToPitchClass(sourceTonic);
  const tgt = noteNameToPitchClass(targetTonic);
  if (src == null || tgt == null) return 0;
  const diff = ((tgt - src) % 12 + 12) % 12; // 0..11
  return diff > 6 ? diff - 12 : diff;
}

function transposeEvents(events, semitones) {
  if (!Array.isArray(events) || !semitones) return events;
  return events.map((ev) => ({
    ...ev,
    midis: Array.isArray(ev.midis)
      ? ev.midis.map((m) => m + semitones)
      : ev.midis,
    notes: Array.isArray(ev.notes)
      ? ev.notes.map((n) => ({ ...n, midi: n.midi + semitones }))
      : ev.notes,
  }));
}

// targetTonic = null/undefined means "keep the original key" - returns
// seq unchanged (same reference, not even a shallow copy, since there's
// nothing to do). If the seq has no declared key (seq.meta.key is
// missing - see the ~1 song in the library still without one), returns
// seq unchanged too: there's no source tonic to compute an offset from,
// and guessing one would silently mistranspose every note.
export function transposeSeqToKey(seq, targetTonic) {
  if (!targetTonic) return seq;

  const sourceTonic = seq?.meta?.key?.tonic;
  if (!sourceTonic) return seq;

  const semitones = computeTransposeSemitones(sourceTonic, targetTonic);
  if (!semitones) return seq;

  return {
    ...seq,
    events: transposeEvents(seq.events, semitones),
    meta: {
      ...seq.meta,
      key: {
        ...seq.meta.key,
        tonic: targetTonic,
      },
    },
  };
}

export default transposeSeqToKey;
