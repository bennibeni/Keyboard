"use client";

import { useEffect, useRef, useState } from "react";

// Same origin/wall-clock recalibration pattern used elsewhere in R02
// (runScheduledPlayback.js, createMetronomeBeatLoop.js): instead of
// incrementing a counter on every interval tick (which drifts under
// setInterval's imprecision), track when the current run "started" and
// derive elapsed time as now - origin. Origin freezes at pause and resets
// at stop, exactly like the scheduler freezes its beat position.
export function useTransportElapsed({ isPlaying, isStopped }) {
  const [elapsedMs, setElapsedMs] = useState(0);

  const originAtRef = useRef(null);
  const baseElapsedRef = useRef(0);

  useEffect(() => {
    if (isStopped) {
      originAtRef.current = null;
      baseElapsedRef.current = 0;
      return undefined;
    }

    if (!isPlaying) {
      // Paused: keep whatever elapsedMs is already showing, don't tick.
      return undefined;
    }

    originAtRef.current = performance.now();
    const base = baseElapsedRef.current;

    const timer = window.setInterval(() => {
      setElapsedMs(base + (performance.now() - originAtRef.current));
    }, 100);

    return () => {
      window.clearInterval(timer);
      baseElapsedRef.current = base + (performance.now() - originAtRef.current);
    };
  }, [isPlaying, isStopped]);

  return isStopped ? 0 : elapsedMs;
}

export default useTransportElapsed;
