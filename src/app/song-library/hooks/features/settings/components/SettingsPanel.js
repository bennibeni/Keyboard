"use client";

import { getPanelFrameProps } from "../../../shared/ui/panelSpecs";
import { PanelFrame, Row, Slider } from "../../../shared/ui/playbackScreenUi";
import { SETTINGS } from "../../../settings";

function formatValue(value, unit) {
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = typeof value === "number" ? String(value) : `"${value}"`;
  return unit ? `${text} ${unit}` : text;
}

// `editable` is a map of { [settingKey]: { onChange } } - only keys present
// there get an interactive control instead of plain text. Everything else
// (the majority of SETTINGS) stays exactly as it was: read-only display.
export default function SettingsPanel({ overrides = {}, editable = {} }) {
  const entries = Object.entries(SETTINGS);
  const hasEditable = Object.keys(editable).length > 0;

  return (
    <PanelFrame
      {...getPanelFrameProps("settings")}
      titleRight={hasEditable ? "alcuni modificabili" : "read-only"}
    >
      <div className="flex flex-col gap-3">
        {entries.map(([key, setting]) => {
          const value = key in overrides ? overrides[key] : setting.value;
          const edit = editable[key];

          return (
            <Row key={key} label={setting.label}>
              <div className="flex w-full flex-col gap-1">
                {!edit ? (
                  <span className="font-mono text-sm font-bold text-zinc-900">
                    {formatValue(value, setting.unit)}
                  </span>
                ) : typeof setting.value === "boolean" ? (
                  <label className="flex w-fit items-center gap-2 text-sm font-bold text-zinc-900">
                    <input
                      type="checkbox"
                      checked={!!value}
                      onChange={(e) => edit.onChange(e.target.checked)}
                      className="h-4 w-4 accent-zinc-900"
                    />
                    {value ? "on" : "off"}
                  </label>
                ) : (
                  <div className="flex items-center gap-3">
                    <Slider
                      min={setting.min ?? 0}
                      max={setting.max ?? 1}
                      step={setting.step ?? 0.01}
                      value={value}
                      onChange={(v) => edit.onChange(Number(v))}
                      className="h-2 cursor-pointer"
                    />
                    <span className="w-16 shrink-0 text-right font-mono text-sm font-bold text-zinc-900">
                      {formatValue(value, setting.unit)}
                    </span>
                  </div>
                )}
                {setting.description ? (
                  <span className="text-xs text-zinc-500">
                    {setting.description}
                  </span>
                ) : null}
              </div>
            </Row>
          );
        })}
      </div>
    </PanelFrame>
  );
}
