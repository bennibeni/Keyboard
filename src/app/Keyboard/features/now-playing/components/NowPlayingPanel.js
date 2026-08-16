"use client";

import { getPanelFrameProps } from "../../../shared/ui/panelSpecs";
import { PanelFrame } from "../../../shared/ui/playbackScreenUi";
import { getTransportStatus } from "../../transport/model/transportStatus";
import { useTransportElapsed } from "../hooks/useTransportElapsed";

function formatElapsed(ms) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatBeat(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.00$/, "");
}

// beat = elapsed time expressed in units of "one beat at this bpm", derived
// from the same elapsedMs clock as the Elapsed field - so it starts at 0,
// climbs continuously while playing, freezes on pause, resets on stop,
// exactly like Elapsed does.
function elapsedToBeat(ms, bpm) {
  const n = Number(bpm);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return (Math.max(0, ms) / 60000) * n;
}

export default function NowPlayingPanel({
  state,
  isPlaying,
  isStopped,
  bpm = 120,
}) {
  const elapsedMs = useTransportElapsed({ isPlaying, isStopped });
  const elapsedText = formatElapsed(elapsedMs);
  const beatText = formatBeat(elapsedToBeat(elapsedMs, bpm));
  const status = getTransportStatus(state);
  const primaryText = status?.primaryText ?? state;
  const statusText = status?.statusText ?? "—";

  return (
    <PanelFrame {...getPanelFrameProps("nowPlaying")} titleRight={`${bpm} BPM`}>
      <div className="flex h-full flex-col gap-3">
        <div>
          <div className="text-lg font-semibold text-zinc-900">
            {primaryText}
          </div>
          <div className="mt-1 text-sm text-zinc-600">
            Elapsed {elapsedText} · Beat {beatText}
          </div>
        </div>

        <div className="mt-auto rounded-2xl border border-white/70 bg-white/80 px-3 py-2 text-sm text-zinc-600 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500">
            Status
          </div>
          <div className="mt-1 font-semibold text-zinc-900">{statusText}</div>
        </div>
      </div>
    </PanelFrame>
  );
}
