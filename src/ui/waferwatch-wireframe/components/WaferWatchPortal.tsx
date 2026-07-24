"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function WaferWatchPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return children;
  return createPortal(
    <div className="waferwatch-wireframe waferwatch-overlay-theme">{children}</div>,
    document.body
  );
}
