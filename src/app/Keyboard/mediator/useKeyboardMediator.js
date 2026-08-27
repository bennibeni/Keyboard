"use client";

import { useState } from "react";
import { useSongSelector } from "@app/song-library";
import { usePlaySong } from "../features/playback-engine";
import { useMetronomeClick } from "../features/metronome";
import { useDemoTransport } from "../features/transport";
import { useSongBpmSync } from "../shared/hooks/useSongBpmSync";
import { SETTINGS } from "../settings";

// ---------------------------------------------------------------------------
// PATTERN: Mediator (GoF).
//
// Colleagues: song-selector, midi-import, transport, playback-engine,
// metronome, tempo, keyboard, settings - each feature folder under
// Keyboard/features/* knows nothing about the others. song-selector doesn't
// know playback-engine exists; metronome doesn't know transport exists; etc.
// Every one of them talks only to this hook (get state / call a callback),
// never directly to a sibling feature.
//
// Mediator: this hook. It is the ONLY place that knows how the colleagues
// need to react to one another - e.g. "selecting a catalog song must clear
// an active MIDI import", "loading a new song must re-seed the bpm slider",
// "transport state + bpm + the active song must reach both the playback
// engine and the metronome click together". That coordination logic used to
// live inline in Page.js's body; it's formalized here as its own unit so
// Page.js can be reduced to a pure View (see page.js).
//
// Concretely, `activeSeq`/`activeSongId` are the Mediator's own derived
// state (imported song wins over catalog song) - a piece of coordination
// knowledge that must NOT leak into any single feature, since more than one
// feature depends on it (playback-engine, metronome, keyboard-roll, tempo).
// ---------------------------------------------------------------------------
export function useKeyboardMediator() {
  const transportVm = useDemoTransport();

  // Defaults to DEFAULT_SONG_ID = catalog[0] = "canon-full" ("Canon in D -
  // Full") - loaded through the shared registry/normalizer.
  const {
    songs,
    selectedId,
    setSelectedId,
    targetKeyTonic,
    setTargetKeyTonic,
    seq,
    seqLoading,
  } = useSongSelector();

  const [bpm, setBpm] = useState(SETTINGS.bpm.value);
  const [metronomeOn, setMetronomeOn] = useState(SETTINGS.metronomeOn.value);
  const [metroLevel, setMetroLevel] = useState(SETTINGS.metroLevel.value);
  const [loop, setLoop] = useState(SETTINGS.loop.value);
  const [bassScale, setBassScale] = useState(SETTINGS.bassScale.value);
  const [rhScale, setRhScale] = useState(SETTINGS.rhScale.value);
  const [engineRoutingEnabled, setEngineRoutingEnabled] = useState(
    SETTINGS.engineRoutingEnabled.value,
  );

  // A MIDI file imported ad-hoc via MidiImportPanel - lives only in the
  // Mediator's own state (not in SONG_CATALOG, no persistence), and when
  // present takes over as the actively playing song. importedFileName is
  // display-only, not consumed by any playback logic.
  const [importedSeq, setImportedSeq] = useState(null);
  const [importedFileName, setImportedFileName] = useState(null);

  // Every place downstream that previously read `seq`/`selectedId` reads
  // these instead - one substitution point rather than an if/else at each
  // consumer. activeSongId is null while an import is active:
  // resolveEngineRoute's ENGINE_OVERRIDES are keyed by SONG_CATALOG id, so a
  // stale catalog id here could accidentally route an imported song onto an
  // override meant for a completely different piece (resolveEngineRoute
  // already treats null songId as "no override, fall through to
  // hint-matching").
  const activeSeq = importedSeq ?? seq;
  const activeSongId = importedSeq ? null : selectedId;

  // Picking a catalog song while an import is active replaces it - the
  // import has no catalog id to "reselect" later, so there's no meaningful
  // way for both to be simultaneously current. Reselecting the same song
  // selector value also naturally clears a stale import.
  //
  // This is exactly the kind of cross-colleague reaction a Mediator exists
  // to own: song-selector itself only ever calls "onChange(id)" and has no
  // idea that midi-import state even exists.
  const handleSelectSong = (id) => {
    setImportedSeq(null);
    setImportedFileName(null);
    setSelectedId(id);
  };

  // Symmetric reaction for the other direction: midi-import itself only
  // ever calls "onImported(song, fileName)" and has no idea that it is
  // pre-empting whatever the song-selector currently has selected.
  const handleMidiImported = (importedSong, fileName) => {
    setImportedSeq(importedSong);
    setImportedFileName(fileName);
  };

  // Re-seeds the Tempo slider to each newly loaded song's own authored bpm -
  // see useSongBpmSync.js for why this needs to run during render rather
  // than in a useEffect.
  useSongBpmSync(activeSeq, setBpm);

  // The two "runtime" colleagues that actually produce sound. Neither one
  // talks to the other directly - both receive their inputs (song, bpm,
  // transport state) from the Mediator and report back through it
  // (onFinished -> transportVm.finish).
  usePlaySong({
    song: activeSeq,
    songId: activeSongId,
    routingEnabled: engineRoutingEnabled,
    isPlaying: transportVm.isPlaying,
    isPaused: transportVm.isPaused,
    bpm,
    sustainMs: SETTINGS.sustainMs.value,
    loop,
    bassScale,
    rhScale,
    onFinished: transportVm.finish,
  });

  useMetronomeClick({
    isPlaying: transportVm.isPlaying,
    isPaused: transportVm.isPaused,
    bpm,
    song: activeSeq,
    metronomeOn,
    metroLevel,
  });

  // The View (page.js) never sees the individual pieces of state above in
  // isolation - it only sees this single view-model object, grouped by the
  // feature panel that consumes each slice. This is what keeps page.js a
  // thin renderer instead of a second place where colleagues could end up
  // coordinating with each other directly.
  return {
    transportVm,

    songSelector: {
      selectedSongId: selectedId,
      onChange: handleSelectSong,
      songOptions: songs,
      isLoading: seqLoading,
      disabled: transportVm.isActive,
      targetKeyTonic,
      onTargetKeyChange: setTargetKeyTonic,
    },

    midiImport: {
      onImported: handleMidiImported,
      importedSeq,
      importedFileName,
    },

    transportBar: {
      ...transportVm,
      loop,
      setLoop,
    },

    nowPlaying: {
      state: transportVm.state,
      isPlaying: transportVm.isPlaying,
      isStopped: transportVm.isStopped,
      bpm,
    },

    keyboardRoll: {
      events: activeSeq?.events,
      time: activeSeq?.time,
      bpm,
    },

    tempo: {
      bpm,
      setBpm,
      timeSignature: activeSeq?.time?.timeSignature ?? "4/4",
      bpmMin: SETTINGS.bpmMin.value,
      bpmMax: SETTINGS.bpmMax.value,
    },

    metronome: {
      metronomeOn,
      setMetronomeOn,
      metroLevel,
      setMetroLevel,
    },

    settings: {
      overrides: {
        bpm,
        metronomeOn,
        metroLevel,
        loop,
        bassScale,
        rhScale,
        engineRoutingEnabled,
      },
      editable: {
        bassScale: { onChange: setBassScale },
        rhScale: { onChange: setRhScale },
        engineRoutingEnabled: { onChange: setEngineRoutingEnabled },
      },
    },
  };
}

export default useKeyboardMediator;
