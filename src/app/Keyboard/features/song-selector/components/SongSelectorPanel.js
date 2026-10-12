"use client";

import { getPanelFrameProps } from "../../../shared/ui/panelSpecs";
import { PanelFrame, Select } from "../../../shared/ui/playbackScreenUi";

const MODE_LABELS = { major: "maggiore", minor: "minore" };

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "–";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function Fact({ label, value, hint = null }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/70 px-3 py-2 ring-1 ring-violet-100">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="truncate text-sm font-semibold tabular-nums text-zinc-900" title={hint ?? undefined}>
        {value}
      </div>
    </div>
  );
}

// Scheda del brano scelto: chi l'ha scritto e i dati della partitura.
function SongInfo({ info }) {
  const key = info.key?.tonic
    ? `${info.key.tonic} ${MODE_LABELS[info.key.mode] ?? info.key.mode ?? ""}`.trim()
    : "–";
  const meter = info.timeSignature
    ? info.meterChanges > 0
      ? `${info.timeSignature} +${info.meterChanges}`
      : info.timeSignature
    : "–";
  const tempo =
    info.scoreBpm && Math.round(info.scoreBpm) !== Math.round(info.bpm)
      ? `${Math.round(info.bpm)} (${Math.round(info.scoreBpm)})`
      : `${Math.round(info.bpm)}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0">
        <div className="truncate text-base font-bold text-zinc-900" title={info.title ?? undefined}>
          {info.title ?? "Senza titolo"}
        </div>
        <div className="truncate text-sm text-zinc-600">
          {info.composer ?? "Autore non indicato"}
          {info.source ? ` · ${info.source}` : ""}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Fact label="Tonalità" value={key} />
        <Fact
          label="Metro"
          value={meter}
          hint={info.meterChanges > 0 ? `${info.meterChanges} cambi di metro nel brano` : null}
        />
        <Fact
          label="BPM"
          value={tempo}
          hint={info.scoreBpm ? `Tempo della partitura: ${Math.round(info.scoreBpm)} BPM` : null}
        />
        <Fact label="Battute" value={info.bars || "–"} />
        <Fact label="Note" value={info.notes ?? "–"} />
        <Fact label="Durata" value={formatDuration(info.durationSec)} hint={`Al tempo di ${Math.round(info.bpm)} BPM`} />
      </div>
    </div>
  );
}

export default function SongSelectorPanel({
  selectedSongId,
  onChange,
  songOptions = [],
  isLoading = false,
  disabled = false,
  info = null,
}) {
  return (
    <PanelFrame
      {...getPanelFrameProps("songSelector")}
      titleRight={isLoading ? "loading" : null}
    >
      {/* La tonalità (Key) è nel pannello Transport: vedi KeyPicker.js */}
      <div className="flex h-full flex-col gap-5">
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

        {info ? (
          <SongInfo info={info} />
        ) : isLoading ? (
          <div className="text-sm text-zinc-500">Caricamento del brano…</div>
        ) : null}
      </div>
    </PanelFrame>
  );
}
