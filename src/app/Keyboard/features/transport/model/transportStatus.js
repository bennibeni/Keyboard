// Single source of truth for how each transport FSM state (see
// features/transport/hooks/useTransportController.js's FSM: idle |
// playing | paused | ready | error) is presented across the app.
//
// primaryText is the badge label (see hooks/transportUi.js), colorClass the
// badge colors in TransportBar. (statusText/hint served the removed
// "Now playing" panel and TransportBar's old hint line.)
const TRANSPORT_STATUS = {
  idle: {
    primaryText: "Idle",
    colorClass: "border-zinc-200 bg-zinc-50 text-zinc-900",
  },
  playing: {
    primaryText: "Running",
    colorClass: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  paused: {
    primaryText: "Paused",
    colorClass: "border-amber-200 bg-amber-50 text-amber-900",
  },
  ready: {
    primaryText: "Stopped",
    colorClass: "border-sky-200 bg-sky-50 text-sky-900",
  },
  error: {
    primaryText: "Error",
    colorClass: "border-rose-200 bg-rose-50 text-rose-900",
  },
};

// Returns null for an unrecognized state, deliberately - callers pick their
// own fallback (TransportBar uses idle's colors, transportUi the raw state).
export function getTransportStatus(state) {
  return TRANSPORT_STATUS[state] ?? null;
}

export { TRANSPORT_STATUS };
export default getTransportStatus;
