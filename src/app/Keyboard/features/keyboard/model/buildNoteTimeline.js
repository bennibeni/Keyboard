export function buildNoteTimeline(events) {
  const safeEvents = Array.isArray(events) ? events : [];
  const timeline = [];

  safeEvents.forEach((event, eventIndex) => {
    const eventStart = Number(event?.tBeat ?? event?.t ?? 0);
    const eventDur = Number(event?.durBeat ?? event?.dur ?? 0);
    const eventEnd = eventStart + eventDur;
    const notes = Array.isArray(event?.notes) ? event.notes : [];

    notes.forEach((note, noteIndex) => {
      const offsetBeat = Number(note?.offsetBeat ?? note?.offset ?? 0);
      const noteStart = eventStart + offsetBeat;
      const fallbackDur = Math.max(0, eventEnd - noteStart);
      const noteDur = Number(note?.durBeat ?? note?.dur ?? fallbackDur);
      const noteEnd = noteStart + noteDur;
      const midi = Number(note?.midi);
      if (!Number.isFinite(midi)) return;

      timeline.push({
        id: `${eventIndex}:${noteIndex}:${midi}:${noteStart}:${noteEnd}`,
        midi,
        startBeat: noteStart,
        endBeat: noteEnd,
      });
    });
  });

  return timeline.sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);
}

export default buildNoteTimeline;
