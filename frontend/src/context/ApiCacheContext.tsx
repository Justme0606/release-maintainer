// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Generic key-value API cache context with in-flight deduplication. */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CacheEntry = any;

interface ApiCacheContextValue {
  getCached: (key: string) => CacheEntry | null;
  fetchCached: (key: string, url: string) => Promise<CacheEntry>;
  invalidate: (key: string) => void;
}

const ApiCacheContext = createContext<ApiCacheContextValue>({
  getCached: () => null,
  fetchCached: () => Promise.reject(new Error("no provider")),
  invalidate: () => {},
});

/**
 * Provider that manages a generic key-value cache for API responses.
 * Useful for caching issue details, opam metadata, etc.
 */
export function ApiCacheProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<Record<string, CacheEntry>>({});
  const inflight = useRef<Record<string, Promise<CacheEntry> | undefined>>({});

  const getCached = useCallback(
    (key: string) => cache[key] ?? null,
    [cache],
  );

  const fetchCached = useCallback(
    async (key: string, url: string): Promise<CacheEntry> => {
      const cached = cache[key];
      if (cached) return cached;

      const existing = inflight.current[key];
      if (existing) return existing;

      const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
      const promise = fetch(`${apiBase}${url}`)
        .then((res) => {
          if (!res.ok) return null;
          return res.json();
        })
        .then((data) => {
          setCache((prev) => ({ ...prev, [key]: data }));
          delete inflight.current[key];
          return data;
        })
        .catch((err) => {
          delete inflight.current[key];
          throw err;
        });

      inflight.current[key] = promise;
      return promise;
    },
    [cache],
  );

  const invalidate = useCallback((key: string) => {
    setCache((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  return (
    <ApiCacheContext.Provider value={{ getCached, fetchCached, invalidate }}>
      {children}
    </ApiCacheContext.Provider>
  );
}

export function useApiCache() {
  return useContext(ApiCacheContext);
}
