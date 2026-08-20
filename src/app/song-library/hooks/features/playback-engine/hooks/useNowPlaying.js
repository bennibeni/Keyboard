"use client";

import { useSyncExternalStore } from "react";
import { getNowPlayingStore } from "../runtime/NowPlayingStore";

const EMPTY_SNAPSHOT = { tBeat: 0, activeMidis: [] };

// Stable across renders (not created inside the component/hook body) -
// store.subscribe.bind(store) or an inline getSnapshot arrow function
// would be a NEW reference every call, forcing useSyncExternalStore to
// tear down and recreate the subscription on every single event instead
// of keeping one stable listener for the component's whole lifetime.
const store = getNowPlayingStore();
const subscribe = (onStoreChange) => store.subscribe(onStoreChange);
const getSnapshot = () => store.getSnapshot();
const getServerSnapshot = () => EMPTY_SNAPSHOT;

export function useNowPlaying() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default useNowPlaying;
