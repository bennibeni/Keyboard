"use client";

import { useSongSelector } from "@app/song-library";
import { useState } from "react";
import { KeyboardRollSection } from "./Keyboard/features/keyboard";
import {
  MetronomePanel,
  useMetronomeClick,
} from "./Keyboard/features/metronome";
import { MidiImportPanel } from "./Keyboard/features/midi-import";
import { NowPlayingPanel } from "./Keyboard/features/now-playing";
import { usePlaySong } from "./Keyboard/features/playback-engine";
import { SettingsPanel } from "./Keyboard/features/settings";
import { SongSelectorPanel } from "./Keyboard/features/song-selector";
import { TempoPanel } from "./Keyboard/features/tempo";
import { TransportBar, useDemoTransport } from "./Keyboard/features/transport";
import { SETTINGS } from "./Keyboard/settings";
import { useSongBpmSync } from "./Keyboard/shared/hooks/useSongBpmSync";
import { Panel } from "./Keyboard/shared/ui/Panel";
import { Shell } from "./Keyboard/shared/ui/playbackScreenUi";

import "./globals.css";

export default function Page() {
  const transportVm = useDemoTransport();
  // Defaults to DEFAULT_SONG_ID = catalog[0] = "canon-full" ("Canon in D -
  // Full") - same song as before, now loaded through the real shared
  // registry/normalizer instead of a local static import.
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

  // A MIDI file imported ad-hoc via MidiImportPanel - lives only in this
  // component's state (not in SONG_CATALOG, no persistence), and when
  // present takes over as the actively playing song. importedFileName is
  // display-only, not consumed by any playback logic.
  const [importedSeq, setImportedSeq] = useState(null);
  const [importedFileName, setImportedFileName] = useState(null);

  // Every place downstream that previously read `seq`/`selectedId` reads
  // these instead - one substitution point rather than an if/else at
  // each of the five consumers below. activeSongId is null while an
  // import is active: resolveEngineRoute's ENGINE_OVERRIDES are keyed by
  // SONG_CATALOG id, so a stale catalog id here could accidentally route
  // an imported song onto an override meant for a completely different
  // piece (resolveEngineRoute already treats null songId as "no
  // override, fall through to hint-matching").
  const activeSeq = importedSeq ?? seq;
  const activeSongId = importedSeq ? null : selectedId;

  // Picking a catalog song while an import is active replaces it - the
  // import has no catalog id to "reselect" later, so there's no
  // meaningful way for both to be simultaneously current. Reselecting
  // the same song selector value also naturally clears a stale import.
  const handleSelectSong = (id) => {
    setImportedSeq(null);
    setImportedFileName(null);
    setSelectedId(id);
  };

  const handleMidiImported = (importedSong, fileName) => {
    setImportedSeq(importedSong);
    setImportedFileName(fileName);
  };

  // Re-seeds the Tempo slider to each newly loaded song's own authored
  // bpm - see useSongBpmSync.js for why this needs to run during render
  // rather than in a useEffect.
  useSongBpmSync(activeSeq, setBpm);

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

  return (
    <html lang="en">
      <head>
        <title>Keyboard</title>
        <meta name="description" content="Keyboard" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <Shell>
          <Panel id="songSelector">
            <SongSelectorPanel
              selectedSongId={selectedId}
              onChange={handleSelectSong}
              songOptions={songs}
              isLoading={seqLoading}
              disabled={transportVm.isActive}
              targetKeyTonic={targetKeyTonic}
              onTargetKeyChange={setTargetKeyTonic}
            />
          </Panel>

          <Panel id="midiImport">
            <>
              <MidiImportPanel onImported={handleMidiImported} />
              {importedSeq ? (
                <p className="mt-2 rounded-lg border border-violet-200 bg-violet-100 px-3 py-2 text-sm text-violet-900">
                  In riproduzione:{" "}
                  <span className="font-semibold">{importedFileName}</span> (non
                  dal catalogo)
                </p>
              ) : null}
            </>
          </Panel>

          <Panel id="transport">
            <TransportBar {...transportVm} loop={loop} setLoop={setLoop} />
          </Panel>

          <Panel id="nowPlaying">
            <NowPlayingPanel
              state={transportVm.state}
              isPlaying={transportVm.isPlaying}
              isStopped={transportVm.isStopped}
              bpm={bpm}
            />
          </Panel>

          <Panel id="keyboardRoll">
            <KeyboardRollSection
              events={activeSeq?.events}
              time={activeSeq?.time}
            />
          </Panel>

          <Panel id="tempo">
            <TempoPanel
              bpm={bpm}
              setBpm={setBpm}
              timeSignature={activeSeq?.time?.timeSignature ?? "4/4"}
              bpmMin={SETTINGS.bpmMin.value}
              bpmMax={SETTINGS.bpmMax.value}
            />
          </Panel>

          <Panel id="metronome">
            <MetronomePanel
              metronomeOn={metronomeOn}
              setMetronomeOn={setMetronomeOn}
              metroLevel={metroLevel}
              setMetroLevel={setMetroLevel}
            />
          </Panel>

          <Panel id="settings">
            <SettingsPanel
              overrides={{
                bpm,
                metronomeOn,
                metroLevel,
                loop,
                bassScale,
                rhScale,
                engineRoutingEnabled,
              }}
              editable={{
                bassScale: { onChange: setBassScale },
                rhScale: { onChange: setRhScale },
                engineRoutingEnabled: { onChange: setEngineRoutingEnabled },
              }}
            />
          </Panel>
        </Shell>
      </body>
    </html>
  );
}
