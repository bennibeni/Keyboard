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

  const statusLabel = isStopped
    ? "Stopped"
    : isPlaying
      ? "Playing"
      : isPaused
        ? "Paused"
        : isFinished
          ? "Finished"
          : isError
            ? "Error"
            : String(rawState || phase);

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
