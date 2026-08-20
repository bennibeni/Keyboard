import { getTransportStatus } from "../model/transportStatus";

function toFiniteCount(value, fallback = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeTransportPhase(rawState) {
  if (rawState === "idle" || rawState === "stopped") return "stopped";
  if (rawState === "playing") return "playing";
  if (rawState === "paused") return "paused";
  if (rawState === "ready" || rawState === "finished") return "finished";
  if (rawState === "error") return "error";
  return rawState || "stopped";
}

export function deriveTransportUi(
  rawState,
  { eventsLen = 1, mustRefresh = false } = {},
) {
  const phase = normalizeTransportPhase(rawState);
  const isStopped = phase === "stopped";
  const isPlaying = phase === "playing";
  const isPaused = phase === "paused";
  const isFinished = phase === "finished";
  const isError = phase === "error";

  // Sourced from transportStatus.js's TRANSPORT_STATUS (single source of
  // truth for FSM-state wording) rather than a locally hardcoded string
  // per phase - previously this duplicated that vocabulary with slightly
  // different wording (e.g. "idle" showed label "Stopped" here but hint
  // "Ready. Press Play or Space." from transportStatus.js), a mismatch
  // visible in TransportBar's badge. rawState (the raw FSM state: idle |
  // playing | paused | ready | error) is TRANSPORT_STATUS's own key
  // space, so it's looked up directly rather than via the phase-
  // normalized value.
  const statusLabel =
    getTransportStatus(rawState)?.primaryText ?? String(rawState || phase);

  const safeEventsLen = Math.max(0, toFiniteCount(eventsLen, 1));

  return {
    phase,
    statusLabel,
    isStopped,
    isPlaying,
    isPaused,
    isFinished,
    isError,
    canPlay: (isStopped || isFinished) && safeEventsLen > 0 && !mustRefresh,
    canPause: isPlaying && !mustRefresh,
    canStop: isPlaying || isPaused || isError,
  };
}
