"use client";

import { useEffect } from "react";
import PropTypes from "prop-types";
import { Button } from "../../../shared/ui/playbackScreenUi";

// Modalità "battuta singola": una battuta suonata a ciclo finché non si sceglie
// la precedente o la successiva (anche con le frecce ← → della tastiera del
// computer). La battuta si può scegliere anche a trasporto fermo: Play parte da lì.
export default function SingleBarControls({
  enabled = false,
  onToggle,
  barIndex = 0,
  barCount = 0,
  label = null,
  onPrev,
  onNext,
  disabled = false,
}) {
  const canPrev = enabled && barIndex > 0;
  const canNext = enabled && barIndex < barCount - 1;

  useEffect(() => {
    if (!enabled) return undefined;
    function onKey(e) {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target?.isContentEditable) {
        return;
      }
      if (e.key === "ArrowLeft" && canPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && canNext) {
        e.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, canPrev, canNext, onPrev, onNext]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={enabled ? "primary" : "ghost"}
        size="compact"
        disabled={disabled}
        onClick={onToggle}
        aria-pressed={enabled}
        title="Ripete una sola battuta finché non scegli la precedente o la successiva"
      >
        Battuta singola {enabled ? "on" : "off"}
      </Button>

      {enabled ? (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="compact"
            disabled={!canPrev}
            onClick={onPrev}
            aria-label="Battuta precedente"
            title="Battuta precedente (←)"
          >
            ◀
          </Button>
          <span className="min-w-[8.5rem] text-center text-sm tabular-nums text-zinc-700" aria-live="polite">
            <span className="font-semibold text-zinc-900">Battuta {label ?? barIndex + 1}</span>
            <span className="text-zinc-500">
              {" "}
              · {barIndex + 1}/{barCount}
            </span>
          </span>
          <Button
            variant="ghost"
            size="compact"
            disabled={!canNext}
            onClick={onNext}
            aria-label="Battuta successiva"
            title="Battuta successiva (→)"
          >
            ▶
          </Button>
        </div>
      ) : null}
    </div>
  );
}

SingleBarControls.propTypes = {
  enabled: PropTypes.bool,
  onToggle: PropTypes.func.isRequired,
  barIndex: PropTypes.number,
  barCount: PropTypes.number,
  label: PropTypes.string,
  onPrev: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};
