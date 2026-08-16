"use client";

import { getPanelFrameProps } from "../../../shared/ui/panelSpecs";
import { PanelFrame, Select } from "../../../shared/ui/playbackScreenUi";

export default function SongSelectorPanel({
  selectedSongId,
  onChange,
  songOptions = [],
  isLoading = false,
  disabled = false,
}) {
  return (
    <PanelFrame
      {...getPanelFrameProps("songSelector")}
      titleRight={isLoading ? "loading" : null}
    >
      <div className="flex h-full flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="w-full xl:max-w-md">
          <div className="mb-2 text-xs font-extrabold uppercase tracking-widest text-zinc-500">
            Select song
          </div>
          <Select
            value={selectedSongId}
            onChange={onChange}
            disabled={disabled || isLoading}
            options={songOptions.map((option) => ({
              value: option.id,
              label: option.label,
            }))}
            className="xl:min-w-md"
          />
        </div>
      </div>
    </PanelFrame>
  );
}
