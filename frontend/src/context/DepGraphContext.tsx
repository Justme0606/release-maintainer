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

export function DepGraphProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<Record<string, FullGraph>>({});
  // Track in-flight requests to avoid duplicate fetches
  const inflight = useRef<Record<string, Promise<FullGraph>>>({});

  const getGraph = useCallback(
    (releaseId: string) => cache[releaseId] ?? null,
    [cache],
  );

  const fetchGraph = useCallback(
    async (releaseId: string): Promise<FullGraph> => {
      // Return cached data if available
      if (cache[releaseId]) return cache[releaseId];

      // Deduplicate concurrent requests for the same release
      if (inflight.current[releaseId]) return inflight.current[releaseId];

      const promise = fetch(
        `http://127.0.0.1:8000/api/releases/${releaseId}/dependency-graph`,
      )
        .then((res) => res.json())
        .then((data) => {
          const graph: FullGraph = {
            nodes: data.nodes ?? [],
            edges: data.edges ?? [],
          };
          setCache((prev) => ({ ...prev, [releaseId]: graph }));
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
    <DepGraphContext.Provider value={{ getGraph, fetchGraph, invalidateGraph }}>
      {children}
    </DepGraphContext.Provider>
  );
}

export function useDepGraph() {
  return useContext(DepGraphContext);
}
