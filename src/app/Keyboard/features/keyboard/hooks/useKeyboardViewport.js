"use client";

import { useLayoutEffect, useRef, useState } from "react";

const DEFAULT_VIEWPORT_WIDTH = 1200;

export function useKeyboardViewport(defaultWidth = DEFAULT_VIEWPORT_WIDTH) {
  const viewportRef = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(defaultWidth);

  // useLayoutEffect, not useEffect: this measures the DOM (clientWidth)
  // and immediately feeds the result back into render via setState. With
  // useEffect (which runs after paint) the keyboard would flash once at
  // DEFAULT_VIEWPORT_WIDTH before snapping to the real container width a
  // frame later. useLayoutEffect runs before paint, so the corrected
  // width is applied in the same paint - see "useEffect vs
  // useLayoutEffect" in https://jsdev.space/react-interview-questions-2026/
  // ("Use useLayoutEffect when measuring or synchronizing with the DOM
  // before the browser paints").
  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;

    const update = () => {
      const nextWidth = Math.round(node.clientWidth || 0);
      if (nextWidth > 0) {
        setViewportWidth(nextWidth);
      }
    };

    update();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return { viewportRef, viewportWidth };
}

export default useKeyboardViewport;
