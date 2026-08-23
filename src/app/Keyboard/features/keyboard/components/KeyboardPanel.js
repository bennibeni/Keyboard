"use client";

import { memo, useMemo } from "react";
import useKeyboardPanelVm from "../hooks/useKeyboardPanelVm";
import usePlayableKeyboard from "../hooks/usePlayableKeyboard";

const WhiteKey = memo(function WhiteKey({
  k,
  keyW,
  whiteH,
  labelSize,
  isActive,
  isFirst,
  isLast,
  onPress,
  onRelease,
}) {
  return (
    <button
      type="button"
      className={[
        "relative shrink-0 touch-none border transition-all duration-75 focus:z-30 focus:outline-none focus:ring-2 focus:ring-sky-400",
        isFirst ? "rounded-bl-2xl" : "",
        isLast ? "rounded-br-2xl" : "",
        isActive
          ? "bg-sky-200 border-sky-400 shadow-[0_0_0_2px_rgba(56,189,248,0.35)]"
          : "bg-zinc-100/95 border-zinc-800",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width: keyW, height: whiteH }}
      title={`${k.name} (${k.midi})`}
      aria-label={`Suona ${k.name}`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onPress(k.midi, `pointer:${event.pointerId}`);
      }}
      onPointerUp={(event) => onRelease(`pointer:${event.pointerId}`)}
      onPointerCancel={(event) => onRelease(`pointer:${event.pointerId}`)}
      onLostPointerCapture={(event) => onRelease(`pointer:${event.pointerId}`)}
    >
      {k.label && labelSize >= 8 ? (
        <span
          className="absolute bottom-1 left-0 right-0 select-none text-center font-bold text-zinc-500"
          style={{ fontSize: labelSize }}
        >
          {k.label}
        </span>
      ) : null}
    </button>
  );
});

const BlackKey = memo(function BlackKey({ k, keyW, blackW, blackH, isActive, onPress, onRelease }) {
  const left = k.leftWhiteIndex * keyW + keyW - blackW / 2;

  return (
    <button
      type="button"
      className={[
        "absolute top-0 z-20 touch-none rounded-b-md border transition-all duration-75 focus:outline-none focus:ring-2 focus:ring-sky-300",
        isActive
          ? "bg-sky-400 border-sky-300 shadow-[0_0_0_2px_rgba(56,189,248,0.45)]"
          : "bg-zinc-900 border-zinc-950",
      ].join(" ")}
      style={{ left, width: blackW, height: blackH }}
      title={`${k.name} (${k.midi})`}
      aria-label={`Suona ${k.name}`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onPress(k.midi, `pointer:${event.pointerId}`);
      }}
      onPointerUp={(event) => onRelease(`pointer:${event.pointerId}`)}
      onPointerCancel={(event) => onRelease(`pointer:${event.pointerId}`)}
      onLostPointerCapture={(event) => onRelease(`pointer:${event.pointerId}`)}
    />
  );
});

export default function KeyboardPanel({
  activeMidis = [],
  fromMidi = 21,
  toMidi = 108,
  startMidi,
  endMidi,
  keyW = 28,
  whiteH = 148,
  blackW = 18,
  blackH = 92,
  children = null,
}) {
  const playable = usePlayableKeyboard({
    fromMidi: startMidi ?? fromMidi,
    toMidi: endMidi ?? toMidi,
  });
  const combinedActiveMidis = useMemo(
    () => [...new Set([...activeMidis, ...playable.activeMidis])],
    [activeMidis, playable.activeMidis],
  );
  const {
    viewportRef,
    effectiveFromMidi,
    effectiveToMidi,
    activeSet,
    whites,
    blacks,
    geo,
    keyCount,
    currentKeyW,
    currentWhiteH,
    currentBlackW,
    currentBlackH,
    currentTotalWidth,
    labelSize,
  } = useKeyboardPanelVm({
    activeMidis: combinedActiveMidis,
    fromMidi,
    toMidi,
    startMidi,
    endMidi,
    keyW,
    whiteH,
    blackW,
    blackH,
  });

  const overlay =
    typeof children === "function"
      ? children({
          startMidi: effectiveFromMidi,
          endMidi: effectiveToMidi,
          keyW: currentKeyW,
          blackW: currentBlackW,
          totalWidth: currentTotalWidth,
          geo,
        })
      : children;

  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-50/70 p-4 sm:p-5 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Keyboard
        </div>

        <div className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200">
          {keyCount} keys
        </div>
      </div>

      <div ref={viewportRef} className="mt-4 w-full overflow-hidden">
        <div
          className="mx-auto flex flex-col items-center"
          style={{ width: currentTotalWidth, maxWidth: "100%" }}
        >
          {overlay ? (
            <div className="w-full overflow-hidden rounded-t-2xl border border-zinc-200 bg-zinc-950">
              {overlay}
            </div>
          ) : null}

          <div
            className={
              overlay
                ? "relative overflow-hidden rounded-b-2xl"
                : "relative overflow-hidden rounded-2xl"
            }
            style={{ width: currentTotalWidth, height: currentWhiteH }}
          >
            <div className="absolute left-0 top-0 flex">
              {whites.map((k, index) => (
                <WhiteKey
                  key={k.midi}
                  k={k}
                  keyW={currentKeyW}
                  whiteH={currentWhiteH}
                  labelSize={labelSize}
                  isActive={activeSet.has(k.midi)}
                  isFirst={index === 0}
                  isLast={index === whites.length - 1}
                  onPress={playable.press}
                  onRelease={playable.release}
                />
              ))}
            </div>

            <div className="absolute left-0 top-0">
              {blacks.map((k) => (
                <BlackKey
                  key={k.midi}
                  k={k}
                  keyW={currentKeyW}
                  blackW={currentBlackW}
                  blackH={currentBlackH}
                  isActive={activeSet.has(k.midi)}
                  onPress={playable.press}
                  onRelease={playable.release}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
        <div>
          MIDI Range: {effectiveFromMidi}..{effectiveToMidi}
        </div>
        <div>White keys: {whites.length}</div>
        <div>Black keys: {blacks.length}</div>
        <div>A–L / W–P: suona con la tastiera del computer</div>
      </div>
    </section>
  );
}
