"use client";

// Moved out of shared/ui/playbackScreenUi.js - "what a strong/medium/weak
// beat looks like" is a metronome concept, not a generic UI primitive.
// The generic kit (PanelFrame, Button, Slider...) shouldn't need to know
// what a "beat" is.
const BEAT_PILL_KIND_COLORS = {
  strong: { base: "bg-emerald-300", active: "bg-emerald-600" },
  medium: { base: "bg-emerald-200", active: "bg-emerald-500" },
  weak: { base: "bg-zinc-300", active: "bg-zinc-900" },
};

export function BeatPills({ beatsCount, beatIdx, kinds }) {
  if (!beatsCount || beatIdx == null) return null;

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: beatsCount }, (_, i) => {
        const isActive = i === beatIdx;
        const colors = Array.isArray(kinds)
          ? BEAT_PILL_KIND_COLORS[kinds[i]]
          : null;
        const colorClass = colors
          ? isActive
            ? colors.active
            : colors.base
          : isActive
            ? "bg-zinc-900"
            : "bg-zinc-300";

        return (
          <div
            key={i}
            className={`h-2 w-6 rounded-full transition-all duration-75 ${colorClass} ${
              isActive ? "scale-125" : ""
            }`}
          />
        );
      })}
    </div>
  );
}

export default BeatPills;
