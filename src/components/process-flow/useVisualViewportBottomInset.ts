"use client";

import { useEffect, useState } from "react";
import { getVisualViewportBottomInset } from "./visualViewportInset";

export function useVisualViewportBottomInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateInset = () => {
      const nextInset = getVisualViewportBottomInset({
        layoutViewportHeight: window.innerHeight,
        visualViewportHeight: viewport.height,
        visualViewportOffsetTop: viewport.offsetTop
      });
      setInset((current) => current === nextInset ? current : nextInset);
    };

    updateInset();
    viewport.addEventListener("resize", updateInset);
    viewport.addEventListener("scroll", updateInset);
    window.addEventListener("resize", updateInset);
    return () => {
      viewport.removeEventListener("resize", updateInset);
      viewport.removeEventListener("scroll", updateInset);
      window.removeEventListener("resize", updateInset);
    };
  }, []);

  return inset;
}
