"use client";

import { createContext, useContext, useState } from "react";
import { useStore } from "zustand";
import { createSharedAppStore } from "./sharedAppStore";

const SharedAppContext = createContext(null);

export function SharedAppProvider({ children, initialState }) {
  const [store] = useState(() => createSharedAppStore(initialState));

  return (
    <SharedAppContext.Provider value={store}>
      {children}
    </SharedAppContext.Provider>
  );
}

export function useSharedAppStore(selector) {
  const store = useContext(SharedAppContext);

  if (!store) {
    throw new Error("useSharedAppStore must be used inside SharedAppProvider");
  }

  return useStore(store, selector);
}

export function useSharedAppStoreApi() {
  const store = useContext(SharedAppContext);

  if (!store) {
    throw new Error(
      "useSharedAppStoreApi must be used inside SharedAppProvider",
    );
  }

  return store;
}
