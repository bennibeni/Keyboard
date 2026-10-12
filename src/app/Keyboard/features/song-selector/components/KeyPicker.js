"use client";

import {
  computeTransposeSemitones,
  noteNameToPitchClass,
} from "@app/song-library/model/transposeSeq";

// Tonalità di destinazione scelta su una piccola tastiera di un'ottava.
// Le toniche usano i diesis: transposeSeq.js accetta anche i bemolli, ma un
// solo set coerente evita l'ambiguità enarmonica ("D#" o "Eb"?).
const WHITES = [
  { pc: 0, name: "C" },
  { pc: 2, name: "D" },
  { pc: 4, name: "E" },
  { pc: 5, name: "F" },
  { pc: 7, name: "G" },
  { pc: 9, name: "A" },
  { pc: 11, name: "B" },
];
// `after` = indice del tasto bianco a cui il nero sta a destra
const BLACKS = [
  { pc: 1, name: "C#", after: 0 },
  { pc: 3, name: "D#", after: 1 },
  { pc: 6, name: "F#", after: 3 },
  { pc: 8, name: "G#", after: 4 },
  { pc: 10, name: "A#", after: 5 },
];
const WHITE_W = 30;
const WHITE_H = 76;
const BLACK_W = 20;
const BLACK_H = 46;

const MODE_LABELS = { major: "maggiore", minor: "minore" };

function describeShift(semitones) {
  if (!semitones) return "nessuna trasposizione";
  const n = Math.abs(semitones);
  return `${semitones > 0 ? "+" : "−"}${n} ${n === 1 ? "semitono" : "semitoni"} ${semitones > 0 ? "su" : "giù"}`;
}

// `sourceKey` viene da SONG_CATALOG (song-library/model/songRegistry.js),
// disponibile subito senza dover caricare il brano.
export default function KeyPicker({
  sourceKey = null,
  targetKeyTonic = null,
  onTargetKeyChange,
  disabled = false,
}) {
  const sourcePc = noteNameToPitchClass(sourceKey?.tonic);
  const keyKnown = sourcePc != null;
  const inactive = disabled || !keyKnown;
  const targetPc = targetKeyTonic ? noteNameToPitchClass(targetKeyTonic) : sourcePc;
  const mode = MODE_LABELS[sourceKey?.mode] ?? sourceKey?.mode ?? "";
  const shift = keyKnown && targetKeyTonic ? computeTransposeSemitones(sourceKey.tonic, targetKeyTonic) : 0;
  const isTransposed = keyKnown && targetKeyTonic != null && targetPc !== sourcePc;

  // Premere la tonica originale equivale a "Originale" (nessuna trasposizione)
  const choose = (key) => {
    if (inactive) return;
    onTargetKeyChange?.(key.pc === sourcePc ? null : key.name);
  };

  const keyButton = (key, isBlack, style) => {
    const selected = keyKnown && key.pc === targetPc;
    const original = keyKnown && key.pc === sourcePc;
    const semis = keyKnown ? computeTransposeSemitones(sourceKey.tonic, key.name) : 0;
    const tone = selected
      ? "bg-amber-400 text-amber-950 border-amber-600"
      : isBlack
        ? "bg-zinc-900 text-zinc-300 border-zinc-950 hover:bg-zinc-700"
        : "bg-white text-zinc-500 border-zinc-300 hover:bg-amber-50";
    return (
      <button
        key={key.name}
        type="button"
        disabled={inactive}
        onClick={() => choose(key)}
        aria-pressed={selected}
        aria-label={`${key.name} ${mode}${original ? " (originale)" : ` (${describeShift(semis)})`}`}
        title={original ? `${key.name} ${mode} · originale` : `${key.name} ${mode} · ${describeShift(semis)}`}
        className={[
          "absolute top-0 flex flex-col items-center justify-end rounded-b-md border pb-1 text-[10px] font-bold transition-colors",
          "focus-visible:z-30 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-500",
          isBlack ? "z-20" : "z-10",
          tone,
          inactive ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        ].join(" ")}
        style={style}
      >
        {original ? (
          <span
            aria-hidden="true"
            className={`mb-0.5 h-1.5 w-1.5 rounded-full ${selected ? "bg-amber-950" : "bg-sky-500"}`}
          />
        ) : null}
        {isBlack ? null : key.name}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <div>
        <div className="mb-1.5 text-xs font-extrabold uppercase tracking-widest text-zinc-500">
          Key
        </div>
        <div
          role="group"
          aria-label="Tonalità di destinazione"
          className="relative"
          style={{ width: WHITES.length * WHITE_W, height: WHITE_H }}
        >
          {WHITES.map((key, i) =>
            keyButton(key, false, { left: i * WHITE_W, width: WHITE_W, height: WHITE_H }),
          )}
          {BLACKS.map((key) =>
            keyButton(key, true, {
              left: (key.after + 1) * WHITE_W - BLACK_W / 2,
              width: BLACK_W,
              height: BLACK_H,
            }),
          )}
        </div>
      </div>

      <div className="flex min-w-[10rem] flex-col gap-1 pb-0.5 text-xs text-zinc-600">
        {keyKnown ? (
          <>
            <div>
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-sky-500 align-middle" />
              Originale: <span className="font-semibold text-zinc-800">{sourceKey.tonic} {mode}</span>
            </div>
            <div>
              Suona in:{" "}
              <span className="font-semibold text-zinc-900">
                {isTransposed ? targetKeyTonic : sourceKey.tonic} {mode}
              </span>{" "}
              <span className="tabular-nums text-zinc-500">· {describeShift(isTransposed ? shift : 0)}</span>
            </div>
            <button
              type="button"
              disabled={inactive || !isTransposed}
              onClick={() => onTargetKeyChange?.(null)}
              className="mt-0.5 self-start rounded-lg border border-zinc-300 bg-white px-2 py-0.5 font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Torna all&apos;originale
            </button>
            {disabled ? (
              <div className="text-[11px] text-zinc-500">Ferma la riproduzione per cambiare tonalità.</div>
            ) : null}
          </>
        ) : (
          <div className="max-w-[14rem]">
            Tonalità originale sconosciuta: trasposizione non disponibile.
          </div>
        )}
      </div>
    </div>
  );
}
