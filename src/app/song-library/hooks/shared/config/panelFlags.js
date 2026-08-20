"use client";

// Per-panel on/off switch, read once by Page.js when it builds the panel
// list (see PANEL_REGISTRY there). Flipping a value here hides that panel
// from the Shell without touching Page.js's JSX or the panel's own
// component/hooks - useMetronomeClick still runs and audio still plays
// even if metronome=false here, since this only gates the *visual*
// panel, not the underlying feature. If a future flag needs to also
// silence the feature itself (not just hide its panel), gate the
// relevant hook call in Page.js on the same flag - PANEL_FLAGS doesn't
// try to guess that automatically, to avoid a flag silently changing
// audio behavior as a surprising side effect of a "just hide this panel"
// intent.
export const PANEL_FLAGS = {
  songSelector: true,
  midiImport: true,
  transport: true,
  nowPlaying: true,
  keyboardRoll: true,
  tempo: true,
  metronome: true,
  settings: false,
};

export function isPanelEnabled(id) {
  return PANEL_FLAGS[id] !== false;
}

export default PANEL_FLAGS;
