"use client";

import { useMemo } from "react";
import { normalizeMidis } from "../../../shared/music/midi";

export function useNormalizedActiveMidis(rawMidis) {
  return useMemo(() => normalizeMidis(rawMidis), [rawMidis]);
}

export default useNormalizedActiveMidis;
