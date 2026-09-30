"use client";

import { useEffect } from "react";

/**
 * Marks <html data-hydrated> once React has taken over the page. Until then, globals.css shows
 * buttons and form controls as disabled, because a click before hydration would be lost.
 */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
