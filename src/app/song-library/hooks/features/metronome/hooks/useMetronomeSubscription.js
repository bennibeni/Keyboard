"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getMetronomeService } from "../runtime/MetronomeService";

export function useMetronomeSubscription() {
  const svc = getMetronomeService();
  const state = useSyncExternalStore(
    svc.subscribe,
    svc.getSnapshot,
    svc.getSnapshot,
  );

  return useMemo(
    () => ({
      ...state,
      enable: svc.enable,
      disable: svc.disable,
      tickBeat: svc.tickBeat,
      setGain: svc.setGain,
      reset: svc.reset,
    }),
    [state, svc],
  );
}
