"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { detectChordFromMidis } from "../../../shared/music/chordDetect";
import { normalizeMidis } from "../../../shared/music/midi";

const DEFAULT_SETTLE_MS = 30;
const DEFAULT_BPM = 120;
const DEFAULT_REFERENCE_MIDI = 60; // middle C (C4) - the pivot register
const DEFAULT_BEAT_MULTIPLIER = 1.0; // base ring-out = this many beats
const DEFAULT_BASS_GAIN_PER_OCTAVE = 0.7; // weight added per octave BELOW reference
const DEFAULT_TREBLE_LOSS_PER_OCTAVE = 0.4; // weight removed per octave ABOVE reference
const DEFAULT_MIN_WEIGHT = 0.35;
const DEFAULT_MAX_WEIGHT = 2.5;
const DEFAULT_MIN_HOLD_MS = 150;
const DEFAULT_MAX_HOLD_MS = 1500;
const DEFAULT_ROLL_BEAT_MULTIPLIER = 0.9; // max gap between attacks of the SAME chord
const DEFAULT_MIN_ROLL_WINDOW_MS = 180;
const DEFAULT_MAX_ROLL_WINDOW_MS = 700;
const DEFAULT_MELODY_CUTOFF_MIDI = 72; // C5 - notes above this are melody, not chord
const DEFAULT_SIMPLIFY_TOP_NOTE = true;
const DEFAULT_SIMPLIFY_MAX_DROPS = 2;
const DEFAULT_SIMPLIFY_MIN_NOTES = 3; // never simplify below a bare triad's worth

// Rough "how complex does this look" ranking of chordDetect.js's template
// kinds, lowest = plainest. Anything unrecognized falls in the middle.
const KIND_TIER = {
  dyad: 0,
  triad: 1,
  sus: 1,
  6: 2,
  add: 2,
  7: 3,
  9: 4,
  11: 5,
  13: 6,
};
function kindTier(kind) {
  return kind in KIND_TIER ? KIND_TIER[kind] : 3;
}

/**
 * isConfident(result) -> is this a reliable enough match to display AND
 * to treat as "a chord just got confirmed" for buffer-cleanup purposes?
 * -------------------------------------------------------------------------
 * `strong` alone (from chordDetect.js) is NOT enough: a bare dyad (just a
 * perfect fifth, kind "dyad") trivially satisfies "strong" any time two
 * notes a fifth apart are both in the buffer - including every single
 * intermediate step while a bigger chord is still being rolled/arpeggiated.
 * Treating that as a confirmed chord would (a) flash a "power chord" label
 * before the real chord finishes forming, and (b) prematurely wipe the
 * ring buffer (see the confirmation-triggered cleanup below), preventing
 * the notes that would complete the real chord from ever combining.
 * Requiring at least triad-tier filters out that noise.
 */
function isConfident(result) {
  return result.strong && kindTier(result.kind) >= 1;
}

/**
 * simplifyByDroppingTop(midisAscending, chordOpts)
 * -------------------------------------------------------------------------
 * A single extra note at the TOP of an otherwise-plain chord - a passing
 * tone, a melodic ornament, an added color note that isn't really part of
 * the harmony - is a very common way a simple triad/seventh gets
 * misread as something like "add9", "sus", or a slash chord with an
 * extra extension (e.g. "Bm(add9)/Gb" instead of the intended "Bm/Gb").
 *
 * This repeatedly tries dropping the single highest note and re-running
 * detection: if the result WITHOUT that note is both a strong match and
 * musically simpler (lower kind-tier, or a shorter/plainer symbol at the
 * same tier) than the result WITH it, the simpler reading wins. This
 * repeats up to `maxDrops` times, and never reduces below `minNotes`
 * remaining notes (so it can't collapse a real chord down to a bare
 * dyad). If dropping a note makes the match WEAK or no simpler, dropping
 * stops immediately and the best result found so far is kept - a
 * genuinely-played 9th/11th/13th chord (exact/strong match using all its
 * notes) is left alone.
 */
function simplifyByDroppingTop(midisAscending, chordOpts, opts) {
  let current = midisAscending;
  let best = chordOpts
    ? detectChordFromMidis(current, chordOpts)
    : detectChordFromMidis(current);

  // Only apply this heuristic to slash/inversion chords (the detected
  // bass note differs from the detected root). A genuine root-position
  // extended chord (a real add9/9/11/13, bass === root) is left
  // completely untouched: there is no way to tell a deliberate color
  // tone from an incidental ornament by pitch content alone once the
  // set forms an exact template match either way - stripping it would
  // silently destroy correctly-played extended chords. In practice,
  // though, an extra color note sitting on top of an inverted/slash
  // voicing (root note nowhere in the bass) is disproportionately more
  // often a passing tone or melodic residue than an intentional
  // "9th-over-inversion" voicing, which is exactly the case this was
  // reported against (e.g. "Bm(add9)/Gb" instead of the intended
  // "Bm/Gb").
  if (
    best.bassPc == null ||
    best.rootPc == null ||
    best.bassPc === best.rootPc
  ) {
    return { result: best, usedMidis: current };
  }

  let drops = 0;

  while (
    current.length > opts.simplifyMinNotes &&
    drops < opts.simplifyMaxDrops
  ) {
    const candidateMidis = current.slice(0, -1); // drop the highest (sorted ascending)
    const candidate = chordOpts
      ? detectChordFromMidis(candidateMidis, chordOpts)
      : detectChordFromMidis(candidateMidis);

    if (!isConfident(candidate)) break; // dropping made it worse/uncertain - stop

    const currentTier = kindTier(best.kind);
    const candidateTier = kindTier(candidate.kind);
    const isSimpler =
      candidateTier < currentTier ||
      (candidateTier === currentTier &&
        candidate.symbol.length < best.symbol.length);

    if (!isSimpler) break; // dropping didn't actually simplify - stop

    best = candidate;
    current = candidateMidis;
    drops += 1;
  }

  return { result: best, usedMidis: current };
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * perNoteWeight(midi, opts) -> multiplier applied to the base hold window
 * -------------------------------------------------------------------------
 * Notes below `referenceMidi` (bass register) get a weight ABOVE 1, growing
 * roughly linearly per octave lower - a bass note anchors the harmony and
 * should keep "counting" toward the chord a bit longer than a treble note.
 * Notes above `referenceMidi` get a weight BELOW 1, so a fast top-voice
 * melody note (or a passing tone) decays quickly and doesn't linger
 * falsely into the next chord. The result is clamped so extreme registers
 * don't produce runaway multipliers - the cap is intentionally modest
 * (2.5x, not more): a bass note should ring a bit longer than a treble
 * note, but it must NOT outlive the roll-window grouping below, or a
 * moving bass line ends up stacking multiple different roots together.
 */
function perNoteWeight(midi, opts) {
  const referenceMidi = opts.referenceMidi;
  const octavesFromRef = (referenceMidi - midi) / 12; // positive = bass, negative = treble
  const raw =
    octavesFromRef >= 0
      ? 1 + octavesFromRef * opts.bassGainPerOctave
      : 1 + octavesFromRef * opts.trebleLossPerOctave; // octavesFromRef negative here
  return clamp(raw, opts.minWeight, opts.maxWeight);
}

/**
 * perNoteHoldMs(midi, opts) -> effective ring-out window for this note, ms
 */
function perNoteHoldMs(midi, opts) {
  const beatMs = 60000 / Math.max(1, opts.bpm);
  const baseHoldMs = beatMs * opts.beatMultiplier;
  const weight = perNoteWeight(midi, opts);
  return clamp(baseHoldMs * weight, opts.minHoldMs, opts.maxHoldMs);
}

/**
 * rollWindowMs(opts) -> max gap (ms) between two note-ATTACKS for them to
 * still count as "the same chord being rolled"
 * -------------------------------------------------------------------------
 * This is the key fix for cross-chord bleeding: if a brand new note is
 * struck more than this long after the previous new note, whatever is
 * merely RINGING (released, not held) in the buffer belongs to a
 * different musical moment and is dropped immediately - it does not get
 * to keep counting toward the new chord just because its individual
 * per-note timer (perNoteHoldMs) hadn't run out yet. Notes still
 * physically HELD are never affected by this - only released leftovers.
 */
function rollWindowMs(opts) {
  const beatMs = 60000 / Math.max(1, opts.bpm);
  return clamp(
    beatMs * opts.rollBeatMultiplier,
    opts.minRollWindowMs,
    opts.maxRollWindowMs,
  );
}

/**
 * useDetectedChord(activeMidis, opts?)
 * -------------------------------------
 * Turns a live, changing set of held MIDI notes into a chord symbol,
 * tolerant of arpeggiated/rolled playing, without letting notes from a
 * PREVIOUS chord (or a passing melodic tone, or a moving bass line) bleed
 * into the current one.
 *
 * Two timing mechanisms work together:
 *
 * 1) Per-note ring-out (perNoteHoldMs): once released, a note keeps
 *    counting toward the chord for a short grace period - longer for bass
 *    notes than treble notes, and shorter at faster tempos. This is what
 *    lets a hand-rolled chord (root, then upper notes, root already
 *    released) still be recognized as one chord.
 *
 * 2) Roll-window grouping (rollWindowMs): if the gap since the last
 *    NEWLY-struck note exceeds this window, any merely-ringing (released)
 *    notes still left in the buffer are cut immediately - they belonged
 *    to the previous chord/phrase, not this one. Without this, a bass
 *    note's longer ring-out window could otherwise survive long enough to
 *    get mixed into the NEXT chord's notes, producing a wrong/overly
 *    complex symbol. Currently HELD notes are never touched by this -
 *    only released leftovers.
 *
 * On top of both, the hook only ever UPDATES the visible symbol when the
 * match is "strong" (see chordDetect.js), or when the buffer empties
 * entirely. Weak/partial intermediate matches - which is exactly what a
 * chord looks like halfway through being rolled, or when a passing tone
 * is briefly mixed in - are computed but never shown, so the display
 * doesn't flicker through a string of tentative guesses on the way to the
 * real chord.
 *
 * A third mechanism sits in front of both of the above: register cutoff.
 * Any note above `melodyCutoffMidi` is dropped BEFORE it ever reaches the
 * buffer - it never gets weighted, never gets ring-out time, never
 * factors into detection at all. This is deliberately blunt: a melody
 * line played above the chord (the far more common real-world case than
 * a chord voiced entirely in the upper register) moves fast and
 * constantly, and no amount of weighting or grouping fully stops its
 * passing tones from occasionally forming a spurious extended/altered
 * match. Excluding that register outright is simpler and more reliable
 * than trying to out-guess it.
 *
 * A fourth mechanism runs on the final buffered set before display, but
 * ONLY for slash/inversion chords (bass note different from the detected
 * root): top-note simplification. A single extra note at the top of an
 * inverted chord - a passing tone, an ornament, a melodic note that
 * slipped in below the register cutoff - very often turns a plain
 * inversion into something that reads as an over-extended slash chord
 * (e.g. "Bm(add9)/Gb" instead of the intended "Bm/Gb"). Before
 * displaying, the hook tries dropping the single highest note and
 * re-checking: if that reading is both a strong match AND simpler, it's
 * used instead. Root-position chords (bass === root) are never touched
 * by this - a genuine add9/9/11/13 chord you actually played is left
 * exactly as detected, since there's no way to tell a deliberate color
 * tone from an ornament by pitch content alone. See
 * simplifyByDroppingTop() above for the exact rule.
 *
 * opts:
 * - melodyCutoffMidi: notes strictly above this MIDI number are ignored
 *   entirely for chord detection (default 72 = C5). Pass `null` to
 *   disable the cutoff and consider the full range again.
 * - simplifyTopNote: enable the drop-highest-note simplification pass
 *   described above (default true)
 * - simplifyMaxDrops: how many notes it's allowed to drop in a row
 *   (default 2)
 * - simplifyMinNotes: never simplify below this many remaining notes
 *   (default 3 - a bare triad's worth)
 * - bpm: current tempo (default 120)
 * - referenceMidi: pivot pitch between "bass" and "treble" (default 60)
 * - beatMultiplier: base ring-out at the reference pitch, in beats (1.0)
 * - bassGainPerOctave / trebleLossPerOctave: per-octave weight change
 *   (defaults 0.7 / 0.4)
 * - minWeight / maxWeight: clamp on the per-note weight (0.35 / 2.5)
 * - minHoldMs / maxHoldMs: absolute floor/ceiling on ring-out (150 / 1500ms)
 * - rollBeatMultiplier: max attack-to-attack gap, in beats, for the SAME
 *   chord group (default 0.9 beats)
 * - minRollWindowMs / maxRollWindowMs: clamp on that gap (180 / 700ms)
 * - holdWindowMs: escape hatch - flat ring-out for every note, skipping
 *   bpm/register weighting
 * - onlyShowStrong: only update the displayed symbol on a strong match
 *   (default true - set false to see every intermediate guess, e.g. for
 *   debugging)
 * - settleMs: debounce window before recomputing (default 30ms)
 * - chordOpts: forwarded to detectChordFromMidis (e.g. { preferFlats: true })
 *
 * Returns: { symbol, strong, activeMidis }
 */
export function useDetectedChord(activeMidis, opts = {}) {
  const weightOpts = useMemo(
    () => ({
      bpm: Number.isFinite(Number(opts.bpm)) ? Number(opts.bpm) : DEFAULT_BPM,
      referenceMidi: Number.isFinite(Number(opts.referenceMidi))
        ? Number(opts.referenceMidi)
        : DEFAULT_REFERENCE_MIDI,
      beatMultiplier: Number.isFinite(Number(opts.beatMultiplier))
        ? Number(opts.beatMultiplier)
        : DEFAULT_BEAT_MULTIPLIER,
      bassGainPerOctave: Number.isFinite(Number(opts.bassGainPerOctave))
        ? Number(opts.bassGainPerOctave)
        : DEFAULT_BASS_GAIN_PER_OCTAVE,
      trebleLossPerOctave: Number.isFinite(Number(opts.trebleLossPerOctave))
        ? Number(opts.trebleLossPerOctave)
        : DEFAULT_TREBLE_LOSS_PER_OCTAVE,
      minWeight: Number.isFinite(Number(opts.minWeight))
        ? Number(opts.minWeight)
        : DEFAULT_MIN_WEIGHT,
      maxWeight: Number.isFinite(Number(opts.maxWeight))
        ? Number(opts.maxWeight)
        : DEFAULT_MAX_WEIGHT,
      minHoldMs: Number.isFinite(Number(opts.minHoldMs))
        ? Number(opts.minHoldMs)
        : DEFAULT_MIN_HOLD_MS,
      maxHoldMs: Number.isFinite(Number(opts.maxHoldMs))
        ? Number(opts.maxHoldMs)
        : DEFAULT_MAX_HOLD_MS,
      rollBeatMultiplier: Number.isFinite(Number(opts.rollBeatMultiplier))
        ? Number(opts.rollBeatMultiplier)
        : DEFAULT_ROLL_BEAT_MULTIPLIER,
      minRollWindowMs: Number.isFinite(Number(opts.minRollWindowMs))
        ? Number(opts.minRollWindowMs)
        : DEFAULT_MIN_ROLL_WINDOW_MS,
      maxRollWindowMs: Number.isFinite(Number(opts.maxRollWindowMs))
        ? Number(opts.maxRollWindowMs)
        : DEFAULT_MAX_ROLL_WINDOW_MS,
    }),
    [
      opts.bpm,
      opts.referenceMidi,
      opts.beatMultiplier,
      opts.bassGainPerOctave,
      opts.trebleLossPerOctave,
      opts.minWeight,
      opts.maxWeight,
      opts.minHoldMs,
      opts.maxHoldMs,
      opts.rollBeatMultiplier,
      opts.minRollWindowMs,
      opts.maxRollWindowMs,
    ],
  );

  // Escape hatch: an explicit flat holdWindowMs bypasses bpm/register
  // weighting entirely for every note (roll-window grouping still applies).
  const flatHoldWindowMs = Number.isFinite(Number(opts.holdWindowMs))
    ? Number(opts.holdWindowMs)
    : null;

  const settleMs = Number.isFinite(Number(opts.settleMs))
    ? Number(opts.settleMs)
    : DEFAULT_SETTLE_MS;
  const onlyShowStrong = opts.onlyShowStrong !== false;
  const chordOpts = opts.chordOpts;

  // undefined (not passed) -> use the default cutoff; explicit null ->
  // disable filtering and consider the full range again.
  const melodyCutoffMidi =
    opts.melodyCutoffMidi === null
      ? null
      : Number.isFinite(Number(opts.melodyCutoffMidi))
        ? Number(opts.melodyCutoffMidi)
        : DEFAULT_MELODY_CUTOFF_MIDI;

  const simplifyTopNote =
    opts.simplifyTopNote !== undefined
      ? !!opts.simplifyTopNote
      : DEFAULT_SIMPLIFY_TOP_NOTE;
  const simplifyMaxDrops = Number.isFinite(Number(opts.simplifyMaxDrops))
    ? Number(opts.simplifyMaxDrops)
    : DEFAULT_SIMPLIFY_MAX_DROPS;
  const simplifyMinNotes = Number.isFinite(Number(opts.simplifyMinNotes))
    ? Number(opts.simplifyMinNotes)
    : DEFAULT_SIMPLIFY_MIN_NOTES;

  const [result, setResult] = useState({
    symbol: "—",
    strong: false,
    activeMidis: [],
  });

  // midi -> { held: boolean, releasedAt: number|null, holdMs: number }
  const bufferRef = useRef(new Map());
  const settleTimerRef = useRef(null);
  const expiryTimerRef = useRef(null);
  // Timestamp of the last genuinely NEW note attack (a midi not already in
  // the buffer) - drives roll-window grouping.
  const lastAttackAtRef = useRef(null);
  // Midi numbers that already contributed to a confirmed (isConfident)
  // chord. Once a note is "spent" this way, its NEXT release decays
  // immediately (holdMs=0) instead of getting a fresh ring-out grace
  // period - see the confirmation-triggered cleanup below for why this
  // matters (a note that was held at confirmation time is deliberately
  // spared from the immediate wipe since it's still physically sounding,
  // but must not get to linger again once it's actually released).
  const spentMidisRef = useRef(new Set());
  const normalizedKey = useMemo(() => {
    const all = normalizeMidis(activeMidis);
    const inRange =
      melodyCutoffMidi == null ? all : all.filter((m) => m <= melodyCutoffMidi);
    return inRange.join(",");
  }, [activeMidis, melodyCutoffMidi]);

  useEffect(() => {
    const heldNow = new Set(
      normalizedKey ? normalizedKey.split(",").map(Number) : [],
    );
    const buffer = bufferRef.current;
    const now = Date.now();

    // Is any note in heldNow a genuinely new attack (not already tracked)?
    let hasNewAttack = false;
    for (const midi of heldNow) {
      if (!buffer.has(midi)) {
        hasNewAttack = true;
        break;
      }
    }

    // Roll-window grouping: if too much time has passed since the last new
    // attack, any leftover RINGING (released, not held) notes belong to a
    // past musical moment - drop them now instead of letting their
    // individual timers run out later and bleed into the new chord.
    // Currently-held notes are never touched here.
    if (hasNewAttack) {
      const lastAttack = lastAttackAtRef.current;
      if (lastAttack != null && now - lastAttack > rollWindowMs(weightOpts)) {
        for (const [midi, entry] of buffer) {
          if (!entry.held) buffer.delete(midi);
        }
      }
      lastAttackAtRef.current = now;
    }

    // Mark newly-pressed notes as held, and (re-)held notes that had
    // started to ring out as held again (cancels their expiry).
    for (const midi of heldNow) {
      const entry = buffer.get(midi);
      if (entry) {
        entry.held = true;
        entry.releasedAt = null;
      } else {
        buffer.set(midi, { held: true, releasedAt: null, holdMs: 0 });
      }
    }

    // Anything in the buffer no longer held starts its ring-out countdown,
    // using a per-note window computed from bpm + this note's register -
    // UNLESS this note already contributed to a previously confirmed
    // chord, in which case it decays immediately instead of getting a
    // fresh grace period (see spentMidisRef doc comment above).
    for (const [midi, entry] of buffer) {
      if (!heldNow.has(midi) && entry.held) {
        entry.held = false;
        entry.releasedAt = now;
        entry.holdMs = spentMidisRef.current.has(midi)
          ? 0
          : flatHoldWindowMs != null
            ? flatHoldWindowMs
            : perNoteHoldMs(midi, weightOpts);
      }
    }

    const purgeExpired = () => {
      const t = Date.now();
      for (const [midi, entry] of buffer) {
        if (!entry.held && entry.releasedAt != null) {
          if (t - entry.releasedAt >= entry.holdMs) {
            buffer.delete(midi);
            spentMidisRef.current.delete(midi);
          }
        }
      }
    };

    const recompute = () => {
      const bufferedMidis = Array.from(buffer.keys()).sort((a, b) => a - b);
      if (!bufferedMidis.length) {
        spentMidisRef.current.clear();
        if (opts.debug) {
          console.log("[chord] buffer vuoto -> —");
        }
        setResult({ symbol: "—", strong: false, activeMidis: [] });
        return;
      }

      const rawDetail = chordOpts
        ? detectChordFromMidis(bufferedMidis, chordOpts)
        : detectChordFromMidis(bufferedMidis);

      const { result: detail, usedMidis } = simplifyTopNote
        ? simplifyByDroppingTop(bufferedMidis, chordOpts, {
            simplifyMaxDrops,
            simplifyMinNotes,
          })
        : { result: rawDetail, usedMidis: bufferedMidis };
      const { symbol, strong } = detail;
      const confident = isConfident(detail);

      if (opts.debug) {
        const heldList = [...buffer.entries()]
          .filter(([, e]) => e.held)
          .map(([m]) => m);
        const ringingList = [...buffer.entries()]
          .filter(([, e]) => !e.held)
          .map(([m, e]) => `${m}(+${Math.round(e.holdMs)}ms)`);
        console.log(
          "[chord] buffer=%o  held=%o  ringing=%o  raw=%s(%s)  simplified=%s(%s,conf=%s)  usedMidis=%o  shown=%s",
          bufferedMidis,
          heldList,
          ringingList,
          rawDetail.symbol,
          rawDetail.strong ? "strong" : "weak",
          symbol,
          strong ? "strong" : "weak",
          confident,
          usedMidis,
          !onlyShowStrong || confident ? symbol : "(nascosto)",
        );
      }

      // Only commit a match to state if it's confident enough (strong AND
      // at least triad-tier - see isConfident doc comment), unless the
      // caller opted out of that filtering. Otherwise silently drop it and
      // keep showing whatever was last confidently displayed. The buffer
      // (and thus a future recompute) is unaffected either way.
      if (!onlyShowStrong || confident) {
        setResult({ symbol, strong, activeMidis: bufferedMidis });
      }

      // Once a chord is confidently confirmed, its already-released tail
      // has done its job - drop it immediately instead of letting it
      // decay on its own per-note timer. Without this, continuous playing
      // with NO pause between chords (e.g. a broken-chord accompaniment
      // pattern moving straight from one chord into the next) lets the
      // outgoing chord's ringing leftovers blend with the incoming
      // chord's first note(s), and that blend frequently matches some
      // template exactly by coincidence - producing a confident-looking
      // but musically meaningless label (observed in practice: "Esus4/B",
      // "A13sus4/D", "Gmaj9(#11)" appearing between two real, correctly-
      // detected chords).
      //
      // A note that's still physically HELD at this exact moment is
      // spared from the wipe (it's genuinely still sounding) but is
      // marked "spent": the NEXT time it's released, it decays
      // immediately rather than getting a fresh grace period, since it
      // already did its job confirming this chord and must not be
      // allowed to bleed into whatever comes next either.
      if (confident) {
        for (const [midi, entry] of buffer) {
          if (entry.held) spentMidisRef.current.add(midi);
        }
        for (const [midi, entry] of buffer) {
          if (!entry.held) {
            buffer.delete(midi);
            spentMidisRef.current.delete(midi);
          }
        }
      }
    };

    function recomputeSoon() {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(recompute, settleMs);
    }

    const scheduleNextExpiry = () => {
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }
      let nextDelay = null;
      for (const entry of buffer.values()) {
        if (!entry.held && entry.releasedAt != null) {
          const remaining = entry.holdMs - (Date.now() - entry.releasedAt);
          if (nextDelay == null || remaining < nextDelay) nextDelay = remaining;
        }
      }
      if (nextDelay != null) {
        expiryTimerRef.current = setTimeout(
          () => {
            purgeExpired();
            scheduleNextExpiry();
            // Same principle as the main effect's gate above: a note aging
            // out on its own (nothing newly struck, nothing to do with
            // this specific timer firing) must NOT trigger a display
            // update unless it empties the buffer entirely. Without this,
            // a merely-ringing note (e.g. a bass note released early
            // relative to the rest of a held block chord) expiring on its
            // own timer would recompute against whatever's left and could
            // show a spurious slash-chord reading the instant it ages out
            // - even though nothing new was ever played. This was the
            // loophole that let that exact bug slip through the earlier
            // hasNewAttack gate, which only covers the main effect body,
            // not this independent timer callback.
            if (buffer.size === 0) {
              recomputeSoon();
            }
          },
          Math.max(0, nextDelay),
        );
      }
    };

    purgeExpired();
    scheduleNextExpiry();

    // Only trigger a display recompute when there's a genuinely new
    // attack, or the buffer just emptied out entirely. A pure release
    // (the buffer shrinking with NO new attack) does NOT recompute here:
    // even a musically simultaneous release of several notes together
    // (e.g. an auto-played block chord ending) is still delivered to
    // this hook as separate state updates, one note at a time - without
    // this guard, the in-between state ("3 of 4 notes still held")
    // would get freshly detected and displayed, often as a spurious
    // slash-chord reading (e.g. showing "Ab/C" for a fraction of a
    // second while a plain "Ab" block chord's bass note happens to be
    // the first of its four notes to be processed as released) - a
    // rendering-order artifact, not a real harmonic event. The eventual
    // natural expiry/empty-buffer transition still recomputes normally
    // via scheduleNextExpiry's own timer chain above, so nothing here
    // prevents the display from correctly clearing once everything has
    // actually finished ringing out.
    if (hasNewAttack || buffer.size === 0) {
      recomputeSoon();
    }

    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, [
    normalizedKey,
    flatHoldWindowMs,
    weightOpts,
    settleMs,
    onlyShowStrong,
    simplifyTopNote,
    simplifyMaxDrops,
    simplifyMinNotes,
    chordOpts,
    opts.debug,
  ]);

  // Clean up the expiry timer on unmount.
  useEffect(() => {
    return () => {
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    };
  }, []);

  return result;
}

export default useDetectedChord;
