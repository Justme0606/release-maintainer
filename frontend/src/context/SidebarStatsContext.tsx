import { createContext, useContext, useState, type ReactNode } from "react";

export interface SidebarStats {
  packages: number;
  openIssues: number;
  ciBuilds: number;
}

interface SidebarStatsContextValue {
  stats: SidebarStats | null;
  setStats: (s: SidebarStats) => void;
}

const SidebarStatsContext = createContext<SidebarStatsContextValue>({
  stats: null,
  setStats: () => {},
});

export function SidebarStatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<SidebarStats | null>(null);
  return (
    <SidebarStatsContext.Provider value={{ stats, setStats }}>
      {children}
    </SidebarStatsContext.Provider>
  );
}

export function useSidebarStats() {
  return useContext(SidebarStatsContext);
}
