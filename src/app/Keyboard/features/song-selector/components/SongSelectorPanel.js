"use client";

import { getPanelFrameProps } from "../../../shared/ui/panelSpecs";
import { PanelFrame, Select } from "../../../shared/ui/playbackScreenUi";

// 12 toniche, notazione con diesis - transposeSeq.js accetta anche i
// bemolli (noteNameToPitchClass parsa entrambi), ma un solo set coerente
// nel selettore evita l'ambiguità enarmonica ("D#" o "Eb"?) che non ha
// un'unica risposta corretta senza sapere il contesto armonico del brano.
const KEY_TONICS = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

const KEY_LABELS = {
  major: "maggiore",
  minor: "minore",
};

export default function SongSelectorPanel({
  selectedSongId,
  onChange,
  songOptions = [],
  isLoading = false,
  disabled = false,
  targetKeyTonic = null,
  onTargetKeyChange = null,
}) {
  // `key` viene da SONG_CATALOG (song-library/model/songRegistry.js),
  // disponibile subito senza dover caricare il brano - vedi il commento
  // lì per perché è una duplicazione deliberata di seq.meta.key.
  const selectedSong = songOptions.find((o) => o.id === selectedSongId);
  const sourceKey = selectedSong?.key ?? null;
  const keyKnown = Boolean(sourceKey?.tonic);

  return (
    <PanelFrame
      {...getPanelFrameProps("songSelector")}
      titleRight={isLoading ? "loading" : null}
    >
      <div className="flex h-full flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        {/* xl:items-start (was xl:items-end): the "Key" column has an
            extra helper line below its select ("Originale: ..." / tonalità
            sconosciuta) that "Select song" doesn't have. Bottom-aligning
            the two columns as whole blocks made the two <select>s land at
            different heights, since the taller column's extra trailing
            text pushed everything above it up. Top-aligning instead lines
            up the labels (same height on both columns) and, as a direct
            result, the selects themselves - the asymmetric trailing text
            is free to make its own column taller without affecting the
            other one. */}
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

        {onTargetKeyChange && (
          <div className="w-full xl:max-w-xs">
            <div className="mb-2 text-xs font-extrabold uppercase tracking-widest text-zinc-500">
              Key
            </div>
            <Select
              value={targetKeyTonic ?? ""}
              onChange={(value) => onTargetKeyChange(value || null)}
              disabled={disabled || isLoading || !keyKnown}
              options={[
                { value: "", label: "Originale" },
                ...KEY_TONICS.map((tonic) => ({ value: tonic, label: tonic })),
              ]}
            />
            <div className="mt-1.5 text-xs text-zinc-500">
              {keyKnown
                ? `Originale: ${sourceKey.tonic} ${KEY_LABELS[sourceKey.mode] ?? sourceKey.mode}`
                : "Tonalità originale sconosciuta - trasposizione non disponibile"}
            </div>
          </div>
        )}
      </div>
    </PanelFrame>
  );
}
