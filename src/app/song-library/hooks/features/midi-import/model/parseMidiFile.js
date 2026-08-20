// Parser di file MIDI standard (SMF, formato .mid) scritto da zero, senza
// dipendenze npm - legge un ArrayBuffer (dal File API del browser, via
// file.arrayBuffer()) e produce lo stesso shape "grezzo" che tutti gli
// altri file in song-library/songs/ hanno prima di passare da
// normalizeMusicSeqToCanonical: { meta, time: { bpm, timeSignature },
// events: [{ tBeat, durBeat, notes: [{ midi, velocity, durBeat }] }] }.
// Il chiamante (useMidiImport.js) passa questo risultato a
// normalizeMusicSeqToCanonical, così un file importato attraversa
// esattamente la stessa pipeline (dedup note, ordinamento, stats) di un
// brano già in libreria - nessuna logica di normalizzazione duplicata qui.
//
// Copertura: format 0/1 (multi-traccia standard), running status, eventi
// Note On/Off, meta Set Tempo (0x51) e Time Signature (0x58). NON
// supportato: division in formato SMPTE (raro in pratica - file esportati
// per sync video/film), che qui viene rilevato e sostituito con un
// fallback di 480 tick/quarto invece di far fallire l'intero import.

const META_EVENT = 0xff;
const SYSEX_EVENT = 0xf0;
const SYSEX_EVENT_ESCAPE = 0xf7;

function readVarLen(view, offsetRef) {
  let value = 0;
  let byte;
  do {
    byte = view.getUint8(offsetRef.pos);
    offsetRef.pos += 1;
    value = (value << 7) | (byte & 0x7f);
  } while (byte & 0x80);
  return value;
}

function readChunkHeader(view, offsetRef) {
  const type = String.fromCharCode(
    view.getUint8(offsetRef.pos),
    view.getUint8(offsetRef.pos + 1),
    view.getUint8(offsetRef.pos + 2),
    view.getUint8(offsetRef.pos + 3),
  );
  const length = view.getUint32(offsetRef.pos + 4, false);
  offsetRef.pos += 8;
  return { type, length };
}

function parseHeader(view, offsetRef) {
  const { type, length } = readChunkHeader(view, offsetRef);
  if (type !== "MThd") {
    throw new Error(
      `File MIDI non valido: atteso chunk "MThd" all'inizio, trovato "${type}".`,
    );
  }

  const format = view.getUint16(offsetRef.pos, false);
  const trackCount = view.getUint16(offsetRef.pos + 2, false);
  const divisionRaw = view.getUint16(offsetRef.pos + 4, false);
  // Avanza della lunghezza DICHIARATA dal chunk (di norma 6), non di un
  // valore fisso - un header più lungo del previsto viene comunque
  // saltato correttamente.
  offsetRef.pos += length;

  const isSmpte = (divisionRaw & 0x8000) !== 0;
  if (isSmpte) {
    return { format, trackCount, ticksPerQuarter: 480, smpte: true };
  }
  return { format, trackCount, ticksPerQuarter: divisionRaw, smpte: false };
}

// Estrae dalla singola traccia solo ciò che serve: note on/off (con
// running status risolto) e i meta-eventi di tempo/metrica. Tutto il
// resto (program change, control change, pitch bend, testo, nome
// traccia...) viene scartato consumandone comunque i byte, per non
// disallineare la lettura del resto del file.
function parseTrackEvents(view, offsetRef, trackLength) {
  const trackEnd = offsetRef.pos + trackLength;
  const events = [];
  let tick = 0;
  let runningStatus = null;

  while (offsetRef.pos < trackEnd) {
    const deltaTime = readVarLen(view, offsetRef);
    tick += deltaTime;

    let statusByte = view.getUint8(offsetRef.pos);
    if (statusByte < 0x80) {
      // Running status: questo byte è in realtà il primo data byte di un
      // evento canale ripetuto - non consuma un byte di stato proprio,
      // riusa l'ultimo status byte visto.
      if (runningStatus == null) {
        throw new Error(
          "File MIDI corrotto: running status usato senza un evento precedente.",
        );
      }
      statusByte = runningStatus;
    } else {
      offsetRef.pos += 1;
    }

    if (statusByte === META_EVENT) {
      const metaType = view.getUint8(offsetRef.pos);
      offsetRef.pos += 1;
      const metaLength = readVarLen(view, offsetRef);
      const dataStart = offsetRef.pos;

      if (metaType === 0x51 && metaLength === 3) {
        const microsecondsPerQuarter =
          (view.getUint8(dataStart) << 16) |
          (view.getUint8(dataStart + 1) << 8) |
          view.getUint8(dataStart + 2);
        events.push({ tick, type: "tempo", microsecondsPerQuarter });
      } else if (metaType === 0x58 && metaLength === 4) {
        const numerator = view.getUint8(dataStart);
        const denominatorPow2 = view.getUint8(dataStart + 1);
        events.push({
          tick,
          type: "timeSignature",
          numerator,
          denominator: 2 ** denominatorPow2,
        });
      }

      offsetRef.pos = dataStart + metaLength;
      runningStatus = null; // i meta-eventi non partecipano al running status
      continue;
    }

    if (statusByte === SYSEX_EVENT || statusByte === SYSEX_EVENT_ESCAPE) {
      const sysexLength = readVarLen(view, offsetRef);
      offsetRef.pos += sysexLength;
      runningStatus = null; // anche il sysex azzera il running status
      continue;
    }

    const eventType = statusByte & 0xf0;
    const channel = statusByte & 0x0f;
    runningStatus = statusByte; // gli eventi canale IMPOSTANO il running status

    if (eventType === 0x80 || eventType === 0x90) {
      const note = view.getUint8(offsetRef.pos);
      const velocity = view.getUint8(offsetRef.pos + 1);
      offsetRef.pos += 2;
      // Un Note On con velocity 0 è, per convenzione MIDI, equivalente a
      // un Note Off (permette di restare in running status per l'intero
      // stream di rilasci) - normalizzato qui a un unico tipo "noteOff"
      // così il pairing più sotto non deve gestire il caso speciale.
      const isNoteOff = eventType === 0x80 || velocity === 0;
      events.push({
        tick,
        type: isNoteOff ? "noteOff" : "noteOn",
        channel,
        note,
        velocity,
      });
    } else if (eventType === 0xa0 || eventType === 0xb0 || eventType === 0xe0) {
      offsetRef.pos += 2; // aftertouch poly, control change, pitch bend
    } else if (eventType === 0xc0 || eventType === 0xd0) {
      offsetRef.pos += 1; // program change, channel aftertouch
    } else {
      throw new Error(
        `File MIDI non supportato: status byte 0x${statusByte.toString(16)} sconosciuto.`,
      );
    }
  }

  return events;
}

// Appaia ogni Note On con il successivo Note Off sullo stesso
// track+channel+pitch. Uno stack (non un singolo valore) per chiave,
// così due riattacchi della stessa nota prima del rilascio del
// precedente (stesso canale, stesso pitch) si appaiano in ordine FIFO
// invece di accavallarsi. La chiave include l'indice di traccia - non
// solo canale+pitch - per evitare che due tracce diverse che capitano ad
// usare lo stesso canale MIDI si appaino a vicenda per errore.
function pairNotesIntoTimeline(perTrackEvents) {
  const allEvents = perTrackEvents.flat();
  allEvents.sort((a, b) => a.tick - b.tick);

  const open = new Map();
  const notes = [];

  for (const ev of allEvents) {
    const key = `${ev.track}:${ev.channel}:${ev.note}`;
    if (ev.type === "noteOn") {
      if (!open.has(key)) open.set(key, []);
      open.get(key).push({ tick: ev.tick, velocity: ev.velocity });
    } else if (ev.type === "noteOff") {
      const stack = open.get(key);
      if (stack && stack.length) {
        const start = stack.shift();
        if (ev.tick > start.tick) {
          notes.push({
            startTick: start.tick,
            endTick: ev.tick,
            midi: ev.note,
            velocity: start.velocity,
          });
        }
        // Note di durata zero (noteOn seguito subito dal proprio
        // noteOff sullo stesso tick) scartate: durBeat 0 non è udibile
        // né rappresentabile.
      }
      // Un noteOff senza noteOn aperto corrispondente (file malformato,
      // o nota già suonante prima dell'inizio della traccia) viene
      // ignorato silenziosamente - i file MIDI reali non sono sempre
      // perfettamente ben formati.
    }
  }

  return notes;
}

// Raggruppa le note che iniziano allo stesso tick in un unico "evento"
// canonico (accordo) - stesso shape usato dal resto della libreria: un
// evento per attacco, notes[] per i pitch simultanei.
function groupNotesIntoEvents(notes, ticksPerQuarter) {
  const byTick = new Map();
  for (const n of notes) {
    if (!byTick.has(n.startTick)) byTick.set(n.startTick, []);
    byTick.get(n.startTick).push(n);
  }

  return [...byTick.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([startTick, group]) => {
      const durBeat = Math.max(
        ...group.map((n) => (n.endTick - n.startTick) / ticksPerQuarter),
      );
      return {
        tBeat: startTick / ticksPerQuarter,
        durBeat,
        notes: group.map((n) => ({
          midi: n.midi,
          // La velocity MIDI grezza è 0-127; il resto della libreria
          // tratta note.velocity come un moltiplicatore su scala ~1.0
          // (vedi resolveChordVoicing.js, che usa 1 come default per
          // "piena intensità") - normalizzata qui a 0..1 invece di
          // essere passata grezza.
          velocity: n.velocity / 127,
          durBeat: (n.endTick - n.startTick) / ticksPerQuarter,
        })),
      };
    });
}

// title: usato come meta.title del brano importato - il chiamante passa
// tipicamente il nome del file (senza estensione), dato che lo standard
// SMF non ha un meta-evento "titolo brano" popolato in modo affidabile
// nella pratica.
export function parseMidiFile(arrayBuffer, { title = "Imported MIDI" } = {}) {
  let view;
  try {
    view = new DataView(arrayBuffer);
  } catch {
    throw new Error("File MIDI non leggibile: dati non validi.");
  }

  const offsetRef = { pos: 0 };
  let header;
  try {
    header = parseHeader(view, offsetRef);
  } catch (err) {
    throw err instanceof Error
      ? err
      : new Error("File MIDI non leggibile o corrotto.");
  }

  const perTrackEvents = [];
  const timingEvents = [];

  for (let trackIndex = 0; trackIndex < header.trackCount; trackIndex += 1) {
    if (offsetRef.pos >= view.byteLength) break; // file troncato - importa quel che c'è
    const { type, length } = readChunkHeader(view, offsetRef);
    if (type !== "MTrk") {
      // Chunk non-traccia (raro, ma ammesso dalla spec) - salta i suoi
      // byte e continua invece di fallire l'intero import.
      offsetRef.pos += length;
      continue;
    }

    let trackEvents;
    try {
      trackEvents = parseTrackEvents(view, offsetRef, length);
    } catch (err) {
      throw err instanceof Error
        ? err
        : new Error(`Errore nella traccia ${trackIndex + 1}.`);
    }

    perTrackEvents.push(
      trackEvents
        .filter((e) => e.type === "noteOn" || e.type === "noteOff")
        .map((e) => ({ ...e, track: trackIndex })),
    );
    timingEvents.push(
      ...trackEvents.filter((e) => e.type === "tempo" || e.type === "timeSignature"),
    );
  }

  const notes = pairNotesIntoTimeline(perTrackEvents);
  if (!notes.length) {
    throw new Error("Nessuna nota trovata nel file MIDI.");
  }

  const events = groupNotesIntoEvents(notes, header.ticksPerQuarter);

  // bpm: dal primo evento Set Tempo (per tick) nel file - default 120,
  // che è il tempo implicito per lo standard SMF quando nessun evento di
  // tempo è dichiarato.
  const tempoEvents = timingEvents
    .filter((e) => e.type === "tempo")
    .sort((a, b) => a.tick - b.tick);
  const bpm =
    tempoEvents.length > 0
      ? Math.round(60000000 / tempoEvents[0].microsecondsPerQuarter)
      : 120;

  const sigEvents = timingEvents
    .filter((e) => e.type === "timeSignature")
    .sort((a, b) => a.tick - b.tick);
  const timeSignature =
    sigEvents.length > 0
      ? `${sigEvents[0].numerator}/${sigEvents[0].denominator}`
      : "4/4";

  return {
    meta: {
      title,
      source: {
        format: "MIDI (.mid)",
        family: "midi-import",
        originalSchema: null,
      },
    },
    time: { bpm, timeSignature },
    events,
  };
}

export default parseMidiFile;
