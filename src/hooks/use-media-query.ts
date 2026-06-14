"use client";

import { useEffect, useState } from "react";

/**
 * Client-only breakpoint check. Returns false on first render to match SSR.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export function useIsMobileLayout(): boolean {
  return useMediaQuery("(max-width: 1023px)");
}
