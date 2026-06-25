// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** React context for caching release data in memory across navigations. */

/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReleaseData = any;

interface ReleaseContextValue {
  getRelease: (releaseId: string) => ReleaseData | null;
  fetchRelease: (releaseId: string) => Promise<ReleaseData>;
  invalidateRelease: (releaseId: string) => void;
}

const ReleaseContext = createContext<ReleaseContextValue>({
  getRelease: () => null,
  fetchRelease: () => Promise.reject(new Error("no provider")),
  invalidateRelease: () => {},
});

/**
 * Provider that manages a client-side cache of release data.
 * Releases are fetched once per releaseId and shared across all components.
 */
export function ReleaseProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<Record<string, ReleaseData>>({});
  const inflight = useRef<Record<string, Promise<ReleaseData> | undefined>>({});

  const getRelease = useCallback(
    (releaseId: string) => cache[releaseId] ?? null,
    [cache],
  );

  const fetchRelease = useCallback(
    async (releaseId: string): Promise<ReleaseData> => {
      const cached = cache[releaseId];
      if (cached) return cached;

      const existing = inflight.current[releaseId];
      if (existing) return existing;

      const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
      const fetchResult = fetch(`${apiBase}/api/releases/${releaseId}`, { credentials: "include" });

      if (!fetchResult || !fetchResult.then) {
        throw new Error("Fetch is not available");
      }

      const promise = fetchResult
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to fetch release: ${res.status}`);
          return res.json();
        })
        .then((data) => {
          setCache((prev) => ({ ...prev, [releaseId]: data }));
          delete inflight.current[releaseId];
          return data;
        })
        .catch((err) => {
          delete inflight.current[releaseId];
          throw err;
        });

      inflight.current[releaseId] = promise;
      return promise;
    },
    [cache],
  );

  const invalidateRelease = useCallback((releaseId: string) => {
    setCache((prev) => {
      const next = { ...prev };
      delete next[releaseId];
      return next;
    });
  }, []);

  return (
    <ReleaseContext.Provider value={{ getRelease, fetchRelease, invalidateRelease }}>
      {children}
    </ReleaseContext.Provider>
  );
}

export function useRelease() {
  return useContext(ReleaseContext);
}
