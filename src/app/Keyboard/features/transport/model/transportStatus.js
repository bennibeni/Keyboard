// Single source of truth for how each transport FSM state (see
// features/transport/hooks/useTransportController.js's FSM: idle |
// playing | paused | ready | error) is presented across the app.
//
// Previously this same 5-state vocabulary was duplicated with slightly
// different wording in two unrelated places: shared/ui/playbackScreenUi.js
// (STATUS_MSG/statusColors, used by TransportBar) and
// features/now-playing/components/NowPlayingPanel.js (STATE_TEXT/
// STATUS_TEXT). Consolidated here so both consumers read the same data
// and a future wording change only happens in one place. Field names
// keep each original's own role distinct (primaryText/statusText for
// NowPlayingPanel's big label + status card, hint/colorClass for
// TransportBar's status line + badge) rather than forcing them into one
// generic "label" that would lose that distinction.
const TRANSPORT_STATUS = {
  idle: {
    primaryText: "Idle",
    statusText: "Waiting for Play.",
    hint: "Ready. Press Play or Space.",
    colorClass: "border-zinc-200 bg-zinc-50 text-zinc-900",
  },
  playing: {
    primaryText: "Running",
    statusText: "Transport running.",
    hint: "Playing…",
    colorClass: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  paused: {
    primaryText: "Paused",
    statusText: "Transport paused.",
    hint: "Paused — Space or Resume to continue.",
    colorClass: "border-amber-200 bg-amber-50 text-amber-900",
  },
  ready: {
    primaryText: "Stopped",
    statusText: "Transport stopped.",
    hint: "Finished. Press Play to replay.",
    colorClass: "border-sky-200 bg-sky-50 text-sky-900",
  },
  error: {
    primaryText: "Error",
    statusText: "Transport error.",
    hint: "Error during playback. Check console.",
    colorClass: "border-rose-200 bg-rose-50 text-rose-900",
  },
};

// Returns null for an unrecognized state, deliberately - callers each had
// their own fallback behavior (TransportBar falls back to idle's hint;
// NowPlayingPanel falls back to the raw state string), so this stays a
// plain lookup rather than baking one specific fallback in for everyone.
export function getTransportStatus(state) {
  return TRANSPORT_STATUS[state] ?? null;
}

export { TRANSPORT_STATUS };
export default getTransportStatus;
