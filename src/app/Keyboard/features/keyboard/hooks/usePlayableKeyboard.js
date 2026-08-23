"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getKeyboardInstrument } from "../runtime/keyboardInstrument";

const COMPUTER_KEYS = {
  a: 60,
  w: 61,
  s: 62,
  e: 63,
  d: 64,
  f: 65,
  t: 66,
  g: 67,
  y: 68,
  h: 69,
  u: 70,
  j: 71,
  k: 72,
  o: 73,
  l: 74,
  p: 75,
  ";": 76,
};

function isTypingTarget(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))
  );
}

export function usePlayableKeyboard({ fromMidi = 21, toMidi = 108 } = {}) {
  const [activeMidis, setActiveMidis] = useState([]);
  const pressesRef = useRef(new Map());
  const instrumentRef = useRef(null);

  if (instrumentRef.current == null) {
    instrumentRef.current = getKeyboardInstrument();
  }

  const refreshActive = useCallback(() => {
    setActiveMidis([
      ...new Set([...pressesRef.current.values()].map((x) => x.midi)),
    ]);
  }, []);

  const press = useCallback(
    async (midi, token) => {
      if (pressesRef.current.has(token)) return;
      const entry = { midi, voiceId: null, released: false };
      pressesRef.current.set(token, entry);
      refreshActive();

      try {
        const engine = instrumentRef.current;
        await engine.unlock();
        const voiceId = await engine.playNote(midi, { velocity: 0.85 });
        entry.voiceId = voiceId;
        if (entry.released && voiceId != null) {
          // The pointer/key may have been released while an uncached sample
          // was still loading. Let that late voice sound briefly instead of
          // starting and stopping it in the same instant (an audible chop).
          window.setTimeout(() => engine.stopNote(voiceId, 45), 140);
        }
      } catch {
        pressesRef.current.delete(token);
        refreshActive();
      }
    },
    [refreshActive],
  );

  const release = useCallback(
    (token) => {
      const entry = pressesRef.current.get(token);
      if (!entry) return;
      entry.released = true;
      if (entry.voiceId != null)
        instrumentRef.current.stopNote(entry.voiceId, 35);
      pressesRef.current.delete(token);
      refreshActive();
    },
    [refreshActive],
  );

  useEffect(() => {
    const activePresses = pressesRef.current;

    // Warm the entire visible keyboard, including notes played by pointer.
    // Decoding can
    // happen while the AudioContext is suspended; sound is unlocked by the
    // first actual user gesture.
    const low = Math.max(21, Math.round(Number(fromMidi) || 21));
    const high = Math.min(108, Math.round(Number(toMidi) || 108));
    const visibleMidis = Array.from(
      { length: Math.max(0, high - low + 1) },
      (_, index) => low + index,
    );
    instrumentRef.current.preload(visibleMidis).catch(() => {});

    const down = (event) => {
      if (
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        isTypingTarget(event.target)
      )
        return;
      const key = event.key.toLowerCase();
      const midi = COMPUTER_KEYS[key];
      if (midi == null) return;
      event.preventDefault();
      press(midi, `key:${key}`);
    };
    const up = (event) => {
      const key = event.key.toLowerCase();
      if (COMPUTER_KEYS[key] == null) return;
      release(`key:${key}`);
    };
    const releaseComputerKeys = () => {
      for (const token of [...activePresses.keys()]) {
        if (token.startsWith("key:")) release(token);
      }
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", releaseComputerKeys);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", releaseComputerKeys);
      for (const token of [...activePresses.keys()]) release(token);
    };
  }, [fromMidi, press, release, toMidi]);

  return { activeMidis, press, release };
}

export default usePlayableKeyboard;
