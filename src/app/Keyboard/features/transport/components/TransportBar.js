"use client";

import PropTypes from "prop-types";
import { getPanelFrameProps } from "../../../shared/ui/panelSpecs";
import { Button, PanelFrame } from "../../../shared/ui/playbackScreenUi";
import { useSongPosition } from "../hooks/useSongPosition";
import { useTransportElapsed } from "../hooks/useTransportElapsed";
import { getTransportStatus } from "../model/transportStatus";
import SingleBarControls from "./SingleBarControls";

function formatElapsed(ms) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export default function TransportBar({
  state = "idle",
  statusLabel = "Idle",
  isPlaying = false,
  isPaused: isPausedProp,
  isStopped = true,
  songEvents = [],
  songTime,
  canPlay,
  canPause,
  canStop,
  warmUp,
  play,
  stopAll,
  togglePause,
  loop = false,
  setLoop = null,
  singleBar = null,
  showDiagnostics = false,
  toggleDiagnostics = null,
  children = null,
}) {
  const isPaused = Boolean(isPausedProp);
  const status = getTransportStatus(state);
  const elapsedMs = useTransportElapsed({ isPlaying, isStopped });
  const position = useSongPosition({
    events: songEvents,
    time: songTime,
    isActive: isPlaying || isPaused,
  });

  return (
    <PanelFrame
      {...getPanelFrameProps("transport")}
      titleRight={
        <span
          className={[
            "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
            status?.colorClass ?? getTransportStatus("idle").colorClass,
          ].join(" ")}
        >
          {statusLabel}
        </span>
      }
    >
      <div className="flex h-full flex-col gap-4">
        <div className="text-sm tabular-nums text-zinc-700" aria-live="off">
          <span className="font-semibold text-zinc-900">{formatElapsed(elapsedMs)}</span>
          {" · "}
          {position ? `Battuta ${position.bar}, tempo ${position.beat}` : "Battuta –"}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            disabled={!canPlay}
            onPointerDown={warmUp}
            onClick={play}
          >
            Play
          </Button>

          <Button
            variant="warning"
            disabled={!canPause && !isPaused}
            onClick={togglePause}
          >
            {isPaused ? "Resume" : "Pause"}
          </Button>

          <Button variant="secondary" disabled={!canStop} onClick={stopAll}>
            Stop
          </Button>

          {typeof setLoop === "function" ? (
            <Button
              variant={loop ? "primary" : "ghost"}
              size="compact"
              disabled={Boolean(singleBar?.enabled)}
              onClick={() => setLoop((v) => !v)}
              aria-pressed={loop}
            >
              Loop {loop ? "on" : "off"}
            </Button>
          ) : null}

          {typeof toggleDiagnostics === "function" ? (
            <Button variant="ghost" size="compact" onClick={toggleDiagnostics}>
              {showDiagnostics ? "Hide diagnostics" : "Show diagnostics"}
            </Button>
          ) : null}
        </div>

        {singleBar ? <SingleBarControls {...singleBar} /> : null}

        {children}
      </div>
    </PanelFrame>
  );
}

TransportBar.propTypes = {
  state: PropTypes.string,
  statusLabel: PropTypes.string,
  canPlay: PropTypes.bool,
  canPause: PropTypes.bool,
  canStop: PropTypes.bool,
  isPaused: PropTypes.bool,
  isPlaying: PropTypes.bool,
  isStopped: PropTypes.bool,
  songEvents: PropTypes.array,
  songTime: PropTypes.object,
  warmUp: PropTypes.func.isRequired,
  play: PropTypes.func.isRequired,
  stopAll: PropTypes.func.isRequired,
  togglePause: PropTypes.func.isRequired,
  loop: PropTypes.bool,
  setLoop: PropTypes.func,
  singleBar: PropTypes.shape({
    enabled: PropTypes.bool,
    onToggle: PropTypes.func,
    barIndex: PropTypes.number,
    barCount: PropTypes.number,
    label: PropTypes.string,
    onPrev: PropTypes.func,
    onNext: PropTypes.func,
    disabled: PropTypes.bool,
  }),
  showDiagnostics: PropTypes.bool,
  toggleDiagnostics: PropTypes.func,
  children: PropTypes.node,
};
