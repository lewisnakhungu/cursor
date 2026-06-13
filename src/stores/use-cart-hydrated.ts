"use client";

import { useEffect, useState } from "react";
import { useCartStore } from "@/stores/cart-store";

/**
 * True once the persisted cart has been read from sessionStorage.
 * Use this to avoid SSR/client mismatches on cart totals and line counts.
 */
export function useCartHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() =>
    useCartStore.persist.hasHydrated(),
  );

  useEffect(() => {
    if (useCartStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useCartStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}
