function isObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toNonNegativeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function cleanUndefined(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function normalizeTimeSignature(value, fallback = "4/4") {
  if (typeof value !== "string") return fallback;
  const s = value.trim();
  return /^\d+\s*\/\s*\d+$/.test(s) ? s.replace(/\s+/g, "") : fallback;
}

function uniqueNumbers(values) {
  return [...new Set(values.filter(Number.isFinite))];
}

function normalizeNote(note, fallbackDurBeat = 0) {
  if (isFiniteNumber(note)) {
    const midi = Math.round(note);
    if (midi < 0 || midi > 127) return null;

    return {
      midi,
      velocity: 1,
      durBeat: fallbackDurBeat,
    };
  }

  if (!isObject(note)) return null;

  const midi = Math.round(Number(note.midi));
  if (!Number.isFinite(midi) || midi < 0 || midi > 127) return null;

  const rawVel = note.velocity ?? note.vel ?? note.gain ?? 1;
  const velocity = Number(rawVel);

  return cleanUndefined({
    midi,
    velocity: Number.isFinite(velocity) ? velocity : 1,
    durBeat: toNonNegativeNumber(note.durBeat ?? note.dur, fallbackDurBeat),
    staff: Number.isFinite(Number(note.staff))
      ? Math.round(Number(note.staff))
      : undefined,
    voice:
      typeof note.voice === "string" || typeof note.voice === "number"
        ? String(note.voice)
        : undefined,
    meta: isObject(note.meta) ? note.meta : undefined,
  });
}

function mergeSameMidiNotes(notes) {
  const byMidi = new Map();

  for (const note of notes) {
    const prev = byMidi.get(note.midi);

    if (!prev) {
      byMidi.set(note.midi, { ...note });
      continue;
    }

    byMidi.set(
      note.midi,
      cleanUndefined({
        midi: note.midi,
        velocity: Math.max(
          toFiniteNumber(prev.velocity, 1),
          toFiniteNumber(note.velocity, 1),
        ),
        durBeat: Math.max(
          toNonNegativeNumber(prev.durBeat, 0),
          toNonNegativeNumber(note.durBeat, 0),
        ),
        staff: prev.staff === note.staff ? prev.staff : undefined,
        voice: prev.voice === note.voice ? prev.voice : undefined,
        meta: cleanUndefined({
          mergedDuplicateCount:
            Math.max(toFiniteNumber(prev?.meta?.mergedDuplicateCount, 1), 1) +
            1,
        }),
      }),
    );
  }

  return [...byMidi.values()].sort((a, b) => a.midi - b.midi);
}

function normalizeEvent(event, index) {
  if (!isObject(event)) return null;

  const eventDurBeat = toNonNegativeNumber(event.durBeat ?? event.dur, 0);

  const rawNotes = Array.isArray(event.notes)
    ? event.notes
    : Array.isArray(event.midis)
      ? event.midis.map((midi) => ({
          midi,
          velocity: event.velocity ?? 1,
          durBeat: eventDurBeat,
        }))
      : [];

  const sourceNotes = rawNotes
    .map((note) => normalizeNote(note, eventDurBeat))
    .filter(Boolean);

  if (!sourceNotes.length) return null;

  const notes = mergeSameMidiNotes(sourceNotes);
  const velocities = uniqueNumbers(notes.map((n) => n.velocity));

  const mergedMeta = cleanUndefined({
    ...(isObject(event.meta) ? event.meta : {}),
    bar: Number.isFinite(Number(event.bar)) ? Number(event.bar) : undefined,
    beatInBar: Number.isFinite(Number(event.beatInBar))
      ? Number(event.beatInBar)
      : undefined,
    sourceEventDurBeat: eventDurBeat,
    sourceNoteCount: sourceNotes.length,
  });

  return cleanUndefined({
    id:
      typeof event.id === "string"
        ? event.id
        : `ev${String(index + 1).padStart(4, "0")}`,
    kind: typeof event.kind === "string" ? event.kind : "notes",

    tBeat: toNonNegativeNumber(event.tBeat ?? event.t, 0),

    // keep the onset slice duration
    durBeat: eventDurBeat,

    midis: notes.map((n) => n.midi),
    notes,

    velocity: velocities.length === 1 ? velocities[0] : undefined,
    label: typeof event.label === "string" ? event.label : undefined,
    lyrics: typeof event.lyrics === "string" ? event.lyrics : undefined,
    meta: Object.keys(mergedMeta).length ? mergedMeta : undefined,
    _srcIndex: index,
  });
}

function normalizeTimeChanges(rawChanges) {
  if (!Array.isArray(rawChanges) || !rawChanges.length) return undefined;

  const out = rawChanges
    .filter(isObject)
    .map((c) => ({
      tBeat: toNonNegativeNumber(c.tBeat ?? c.t, 0),
      timeSignature: normalizeTimeSignature(c.timeSignature, "4/4"),
    }))
    .sort((a, b) => a.tBeat - b.tBeat);

  return out.length ? out : undefined;
}

function deriveInstrument(meta) {
  if (isObject(meta.instrument)) return meta.instrument;

  const partName =
    Array.isArray(meta.parts) && meta.parts.length > 0
      ? meta.parts
          .map((p) => p?.name)
          .filter(Boolean)
          .join(", ")
      : undefined;

  if (!partName) return undefined;

  return {
    family: partName.toLowerCase(),
    format:
      typeof meta?.source?.format === "string" ? meta.source.format : undefined,
    name: partName,
  };
}

export default function normalizeMusicSeqToCanonical(input) {
  const srcMeta = isObject(input?.meta) ? input.meta : {};
  const srcTime = isObject(input?.time)
    ? input.time
    : isObject(srcMeta.time)
      ? srcMeta.time
      : {};
  const srcEvents = Array.isArray(input?.events) ? input.events : [];

  const events = srcEvents
    .map(normalizeEvent)
    .filter(Boolean)
    .sort((a, b) => {
      if (a.tBeat !== b.tBeat) return a.tBeat - b.tBeat;
      if (a.durBeat !== b.durBeat) return a.durBeat - b.durBeat;
      return a._srcIndex - b._srcIndex;
    })
    .map(({ _srcIndex, ...event }) => event);

  const eventCount = events.length;
  const noteCount = events.reduce((sum, ev) => sum + ev.notes.length, 0);
  const durationBeats = events.reduce(
    (max, ev) =>
      Math.max(
        max,
        ev.tBeat +
          Math.max(
            ev.durBeat,
            ...ev.notes.map((note) => toNonNegativeNumber(note.durBeat, 0)),
          ),
      ),
    0,
  );

  return {
    meta: cleanUndefined({
      schema: "song-canonical@1",
      originalSchema:
        typeof srcMeta.schema === "string" ? srcMeta.schema : undefined,
      createdAt:
        typeof srcMeta.createdAt === "string" ? srcMeta.createdAt : undefined,
      title: typeof srcMeta.title === "string" ? srcMeta.title : "Untitled",
      // Every source file in songs/ actually uses `composers` (a plural
      // array - e.g. amazing-grace.js, someone-like-you-easy-piano.
      // canonical.js), not the singular `composer` string this checked for
      // exclusively - meaning meta.composer silently normalized to
      // undefined for every song in the library until now. Singular
      // `composer` kept as a fallback for robustness, not because
      // anything currently provides it.
      composer:
        Array.isArray(srcMeta.composers) && srcMeta.composers.length
          ? srcMeta.composers.filter((c) => typeof c === "string").join(", ")
          : typeof srcMeta.composer === "string"
            ? srcMeta.composer
            : undefined,
      source: isObject(srcMeta.source) ? srcMeta.source : undefined,
      parts: Array.isArray(srcMeta.parts) ? srcMeta.parts : undefined,
      key: isObject(srcMeta.key) ? srcMeta.key : undefined,
      instrument: deriveInstrument(srcMeta),
      stats: cleanUndefined({
        eventCount,
        noteCount,
        durationBeats,
        sourceStats: isObject(srcMeta.stats) ? srcMeta.stats : undefined,
      }),
    }),

    time: cleanUndefined({
      bpm: toFiniteNumber(srcTime.bpm, 120),
      timeSignature: normalizeTimeSignature(srcTime.timeSignature, "4/4"),
      unit: typeof srcTime.unit === "string" ? srcTime.unit : undefined,
      // Preserved rather than dropped - nothing in R02 currently reads
      // this (playback there uses a single user-set time signature from
      // settings, not the song's own changes), but silently discarding
      // real source data during normalization is a data-loss bug waiting
      // for a consumer, not a deliberate simplification. R04's
      // resolveTimeSignatureAt relies on this being here.
      timeChanges: normalizeTimeChanges(srcTime.timeChanges),
    }),

    events,
  };
}
