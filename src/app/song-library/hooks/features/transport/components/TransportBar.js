"use client";

import PropTypes from "prop-types";
import { getPanelFrameProps } from "../../../shared/ui/panelSpecs";
import { Button, PanelFrame } from "../../../shared/ui/playbackScreenUi";
import { getTransportStatus } from "../model/transportStatus";

export default function TransportBar({
  state = "idle",
  statusLabel = "Idle",
  canPlay,
  canPause,
  canStop,
  isPaused,
  warmUp,
  play,
  stopAll,
  togglePause,
  loop = false,
  setLoop = null,
  showDiagnostics = false,
  toggleDiagnostics = null,
}) {
  const status = getTransportStatus(state);

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
        <div className="flex flex-col gap-2">
          <div className="text-sm text-zinc-700">
            {status?.hint ?? getTransportStatus("idle").hint}
          </div>
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
  warmUp: PropTypes.func.isRequired,
  play: PropTypes.func.isRequired,
  stopAll: PropTypes.func.isRequired,
  togglePause: PropTypes.func.isRequired,
  loop: PropTypes.bool,
  setLoop: PropTypes.func,
  showDiagnostics: PropTypes.bool,
  toggleDiagnostics: PropTypes.func,
};
