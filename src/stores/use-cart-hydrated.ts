"use client";

import { useEffect, useState } from "react";
import { useCartStore } from "@/stores/cart-store";

/**
 * True once the persisted cart has been read from sessionStorage.
 * Use this to avoid SSR/client mismatches on cart totals and line counts.
 */
export function useCartHydrated(): boolean {
  const persist = useCartStore.persist;

  const [hydrated, setHydrated] = useState(() => {
    if (!persist?.hasHydrated) return true;
    return persist.hasHydrated();
  });

  useEffect(() => {
    if (!persist?.onFinishHydration) {
      setHydrated(true);
      return;
    }
    if (persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return persist.onFinishHydration(() => setHydrated(true));
  }, [persist]);

  return hydrated;
}
