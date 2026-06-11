"use client";

/**
 * React hook that opens (and memoises) the AfyaSmart IndexedDB instance.
 *
 * Returns null until the DB is open (typically < 10 ms).  Components should
 * treat null as "not yet ready" and render nothing or a skeleton.
 *
 * The hook is a thin wrapper over openAfyaDB() so that React components
 * don't need to manage the Promise themselves.
 */

import { useEffect, useState } from "react";
import { openAfyaDB, type AfyaDB } from "@/lib/offline/db";

export function useOfflineDB(): AfyaDB | null {
  const [db, setDb] = useState<AfyaDB | null>(null);

  useEffect(() => {
    let cancelled = false;
    openAfyaDB().then((instance) => {
      if (!cancelled) setDb(instance);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return db;
}
