import { createStore } from "zustand/vanilla";
import { RXX_PAGE_KEYS, isRxxPageKey } from "../app/rxx/rxxPages";
export const WRITABLE_PAGE_KEYS = RXX_PAGE_KEYS;

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function assertWritablePageKey(pageKey) {
  if (!isRxxPageKey(pageKey)) {
    throw new Error(
      `[sharedAppStore] Invalid writable page key "${pageKey}". Allowed keys: ${WRITABLE_PAGE_KEYS.join(", ")}`,
    );
  }
}

function makeEmptyPagesState() {
  return Object.fromEntries(WRITABLE_PAGE_KEYS.map((key) => [key, {}]));
}

function resolvePartial(prevSlice, patchOrFn, rootState) {
  if (typeof patchOrFn === "function") {
    const next = patchOrFn(prevSlice, rootState);
    return isPlainObject(next) ? next : {};
  }
  return isPlainObject(patchOrFn) ? patchOrFn : {};
}

export function createSharedAppStore(initialState = {}) {
  const initialPages = {
    ...makeEmptyPagesState(),
    ...(isPlainObject(initialState.pages) ? initialState.pages : {}),
  };

  const initialHome = isPlainObject(initialState.home) ? initialState.home : {};

  return createStore((set, get) => ({
    home: initialHome,
    pages: initialPages,

    setHome(patchOrFn) {
      set((state) => {
        const partial = resolvePartial(state.home, patchOrFn, state);
        return { home: { ...state.home, ...partial } };
      });
    },

    replaceHome(nextHome) {
      set({ home: isPlainObject(nextHome) ? nextHome : {} });
    },

    patchPageInternal(pageKey, patchOrFn) {
      assertWritablePageKey(pageKey);

      set((state) => {
        const prevPage = state.pages[pageKey] ?? {};
        const partial = resolvePartial(prevPage, patchOrFn, state);

        return {
          pages: {
            ...state.pages,
            [pageKey]: { ...prevPage, ...partial },
          },
        };
      });
    },

    replacePageInternal(pageKey, nextPage) {
      assertWritablePageKey(pageKey);

      set((state) => ({
        pages: {
          ...state.pages,
          [pageKey]: isPlainObject(nextPage) ? nextPage : {},
        },
      }));
    },

    resetPageInternal(pageKey) {
      assertWritablePageKey(pageKey);

      set((state) => ({
        pages: {
          ...state.pages,
          [pageKey]: {},
        },
      }));
    },

    replaceSnapshot(snapshot = {}) {
      const nextPages = {
        ...makeEmptyPagesState(),
        ...(isPlainObject(snapshot.pages) ? snapshot.pages : {}),
      };

      set({
        home: isPlainObject(snapshot.home) ? snapshot.home : {},
        pages: nextPages,
      });
    },

    resetAll() {
      set({
        home: {},
        pages: makeEmptyPagesState(),
      });
    },

    getSnapshot() {
      const state = get();
      return {
        home: state.home,
        pages: state.pages,
      };
    },
  }));
}
