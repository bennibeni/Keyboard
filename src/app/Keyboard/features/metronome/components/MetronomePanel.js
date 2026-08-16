"use client";

import PropTypes from "prop-types";
import { getPanelFrameProps } from "../../../shared/ui/panelSpecs";
import { PanelFrame, Slider } from "../../../shared/ui/playbackScreenUi";
import { BeatPills } from "./BeatPills";
import { useMetronomeSubscription } from "../hooks/useMetronomeSubscription";

export default function MetronomePanel({
  metronomeOn,
  setMetronomeOn,
  metroLevel,
  setMetroLevel,
}) {
  const metro = useMetronomeSubscription();

  const beats = metro.beatsCount > 0 ? metro.beatsCount : 4;
  const activeBeat =
    metro.running && metro.beatIdx != null ? metro.beatIdx : null;

  return (
    <PanelFrame
      {...getPanelFrameProps("metronome")}
      titleRight={metronomeOn ? `${Math.round(metroLevel * 100)}%` : "off"}
    >
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-zinc-700">
            Click track synced to the current time signature.
          </div>

          <button
            type="button"
            onClick={() => setMetronomeOn((v) => !v)}
            className={[
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
              metronomeOn ? "bg-zinc-900" : "bg-zinc-300",
            ].join(" ")}
            aria-pressed={metronomeOn}
          >
            <span
              className={[
                "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200",
                metronomeOn ? "translate-x-5" : "translate-x-0",
              ].join(" ")}
            />
          </button>
        </div>

        <BeatPills beatsCount={beats} beatIdx={activeBeat} kinds={metro.kinds} />

        <div className="flex items-center gap-3">
          <div className="w-16 text-sm font-semibold text-zinc-600">Level</div>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={metroLevel}
            onChange={setMetroLevel}
            disabled={!metronomeOn}
            className="h-2 cursor-pointer disabled:cursor-not-allowed"
          />
          <span className="w-12 text-right text-sm font-semibold tabular-nums text-zinc-500">
            {Math.round(metroLevel * 100)}%
          </span>
        </div>
      </div>
    </PanelFrame>
  );
}

MetronomePanel.propTypes = {
  metronomeOn: PropTypes.bool,
  setMetronomeOn: PropTypes.func.isRequired,
  metroLevel: PropTypes.number,
  setMetroLevel: PropTypes.func.isRequired,
};
