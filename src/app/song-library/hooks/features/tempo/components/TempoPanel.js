"use client";

import { getPanelFrameProps } from "../../../shared/ui/panelSpecs";
import { PanelFrame, Slider } from "../../../shared/ui/playbackScreenUi";

export default function TempoPanel({
  bpm,
  setBpm,
  timeSignature,
  bpmMin = 30,
  bpmMax = 260,
}) {
  return (
    <PanelFrame
      {...getPanelFrameProps("settings")}
      title="Tempo"
      titleRight={timeSignature}
      minHeightClass="min-h-[6rem]"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-20 text-sm font-semibold text-zinc-600">BPM</div>
          <Slider
            min={bpmMin}
            max={bpmMax}
            step={1}
            value={bpm}
            onChange={setBpm}
            className="h-2 cursor-pointer"
          />
          <span className="w-12 text-right text-sm font-semibold tabular-nums text-zinc-500">
            {Math.round(bpm)}
          </span>
        </div>
      </div>
    </PanelFrame>
  );
}
