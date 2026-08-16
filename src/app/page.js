"use client";

import { useSongSelector } from "@app/song-library";
import { useState } from "react";
import { KeyboardRollSection } from "./Keyboard/features/keyboard";
import {
  MetronomePanel,
  useMetronomeClick,
} from "./Keyboard/features/metronome";
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
  const { songs, selectedId, setSelectedId, targetKeyTonic, setTargetKeyTonic, seq, seqLoading } =
    useSongSelector();

  const [bpm, setBpm] = useState(SETTINGS.bpm.value);
  const [metronomeOn, setMetronomeOn] = useState(SETTINGS.metronomeOn.value);
  const [metroLevel, setMetroLevel] = useState(SETTINGS.metroLevel.value);
  const [loop, setLoop] = useState(SETTINGS.loop.value);
  const [bassScale, setBassScale] = useState(SETTINGS.bassScale.value);
  const [rhScale, setRhScale] = useState(SETTINGS.rhScale.value);

  // Re-seeds the Tempo slider to each newly loaded song's own authored
  // bpm - see useSongBpmSync.js for why this needs to run during render
  // rather than in a useEffect.
  useSongBpmSync(seq, setBpm);

  usePlaySong({
    song: seq,
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
    song: seq,
    metronomeOn,
    metroLevel,
  });

  return (
    <html>
      <body>
        <Shell>
          <Panel id="songSelector">
            <SongSelectorPanel
              selectedSongId={selectedId}
              onChange={setSelectedId}
              songOptions={songs}
              isLoading={seqLoading}
              disabled={transportVm.isActive}
              targetKeyTonic={targetKeyTonic}
              onTargetKeyChange={setTargetKeyTonic}
            />
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
            <KeyboardRollSection events={seq?.events} time={seq?.time} />
          </Panel>

          <Panel id="tempo">
            <TempoPanel
              bpm={bpm}
              setBpm={setBpm}
              timeSignature={seq?.time?.timeSignature ?? "4/4"}
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
              }}
              editable={{
                bassScale: { onChange: setBassScale },
                rhScale: { onChange: setRhScale },
              }}
            />
          </Panel>
        </Shell>
      </body>
    </html>
  );
}
