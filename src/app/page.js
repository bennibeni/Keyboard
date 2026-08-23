"use client";

import { KeyboardRollSection } from "./Keyboard/features/keyboard";
import { MetronomePanel } from "./Keyboard/features/metronome";
import { MidiImportPanel } from "./Keyboard/features/midi-import";
import { NowPlayingPanel } from "./Keyboard/features/now-playing";
import { SettingsPanel } from "./Keyboard/features/settings";
import { SongSelectorPanel } from "./Keyboard/features/song-selector";
import { TempoPanel } from "./Keyboard/features/tempo";
import { TransportBar } from "./Keyboard/features/transport";
import { useKeyboardMediator } from "./Keyboard/mediator/useKeyboardMediator";
import { Panel } from "./Keyboard/shared/ui/Panel";
import { Shell } from "./Keyboard/shared/ui/playbackScreenUi";

import "./globals.css";

// ---------------------------------------------------------------------------
// PATTERN: Mediator (GoF) - View side.
//
// Page.js used to own every piece of cross-feature state itself (song
// selection, import, bpm, metronome, loop, scales, routing) plus the
// coordination rules between them. All of that has moved into
// useKeyboardMediator (see Keyboard/mediator/useKeyboardMediator.js), which
// plays the Mediator role between the feature "colleagues"
// (song-selector, midi-import, transport, playback-engine, metronome,
// tempo, keyboard, settings).
//
// Page.js's only remaining job is to lay out the Panels and hand each one
// the slice of the Mediator's view-model it needs (`vm.songSelector`,
// `vm.transportBar`, etc.) - it never wires one feature's output into
// another feature's input itself. If two features need to react to each
// other, that reaction is added to the Mediator, not here.
// ---------------------------------------------------------------------------
export default function Page() {
  const vm = useKeyboardMediator();

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
            <SongSelectorPanel {...vm.songSelector} />
          </Panel>

          <Panel id="midiImport">
            <>
              <MidiImportPanel onImported={vm.midiImport.onImported} />
              {vm.midiImport.importedSeq ? (
                <p className="mt-2 rounded-lg border border-violet-200 bg-violet-100 px-3 py-2 text-sm text-violet-900">
                  In riproduzione:{" "}
                  <span className="font-semibold">
                    {vm.midiImport.importedFileName}
                  </span>{" "}
                  (non dal catalogo)
                </p>
              ) : null}
            </>
          </Panel>

          <Panel id="transport">
            <TransportBar {...vm.transportBar} />
          </Panel>

          <Panel id="nowPlaying">
            <NowPlayingPanel {...vm.nowPlaying} />
          </Panel>

          <Panel id="keyboardRoll">
            <KeyboardRollSection {...vm.keyboardRoll} />
          </Panel>

          <Panel id="tempo">
            <TempoPanel {...vm.tempo} />
          </Panel>

          <Panel id="metronome">
            <MetronomePanel {...vm.metronome} />
          </Panel>

          <Panel id="settings">
            <SettingsPanel {...vm.settings} />
          </Panel>
        </Shell>
      </body>
    </html>
  );
}
