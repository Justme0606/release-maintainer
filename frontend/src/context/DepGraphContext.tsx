// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** React context for sharing dependency graph state across components. */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface GraphNode {
  name: string;
  status: string;
  depth: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface FullGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface DepGraphContextValue {
  getGraph: (releaseId: string) => FullGraph | null;
  fetchGraph: (releaseId: string) => Promise<FullGraph>;
  invalidateGraph: (releaseId: string) => void;
}

const DepGraphContext = createContext<DepGraphContextValue>({
  getGraph: () => null,
  fetchGraph: () => Promise.reject(new Error("no provider")),
  invalidateGraph: () => {},
});

/**
 * Provider that manages a client-side cache of dependency graphs.
 * Graphs are fetched once per release and shared across all components.
 */
export function DepGraphProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<Record<string, FullGraph>>({});

  // Track in-flight requests to avoid duplicate fetches for the same release
  const inflight = useRef<Record<string, Promise<FullGraph> | undefined>>({});

  const getGraph = useCallback(
    (releaseId: string) => cache[releaseId] ?? null,
    [cache],
  );

  const fetchGraph = useCallback(
    async (releaseId: string): Promise<FullGraph> => {
      const cachedGraph = cache[releaseId];
      if (cachedGraph) {
        return cachedGraph;
      }

      const existingPromise = inflight.current[releaseId];
      if (existingPromise) {
        return existingPromise;
      }

      const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
      const promise = fetch(`${apiBase}/api/releases/${releaseId}/dependency-graph`, { credentials: "include" })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Failed to fetch graph: ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          const graph: FullGraph = {
            nodes: data.nodes ?? [],
            edges: data.edges ?? [],
          };

          setCache((prev) => ({
            ...prev,
            [releaseId]: graph,
          }));

          delete inflight.current[releaseId];

          return graph;
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

  const invalidateGraph = useCallback((releaseId: string) => {
    setCache((prev) => {
      const next = { ...prev };
      delete next[releaseId];
      return next;
    });
  }, []);

  return (
    <DepGraphContext.Provider
      value={{
        getGraph,
        fetchGraph,
        invalidateGraph,
      }}
    >
      {children}
    </DepGraphContext.Provider>
  );
}

export function useDepGraph() {
  return useContext(DepGraphContext);
}
