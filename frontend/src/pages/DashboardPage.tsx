import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useSidebarStats } from "../context/SidebarStatsContext";
import TopBar from "../components/TopBar";
import ReleaseHeader from "../components/ReleaseHeader";
import KpiGrid from "../components/KpiGrid";
import ReleaseTimeline from "../components/ReleaseTimeline";
import PackageTable from "../components/PackageTable";
import RightPanel from "../components/RightPanel";
import BottomPanels from "../components/BottomPanels";

export default function DashboardPage() {
  const { releaseId } = useParams();
  const [release, setRelease] = useState<any>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { setStats } = useSidebarStats();

  const updateRelease = (data: any) => {
    setLastRefreshedAt(data.last_refreshed_at ?? null);
    setRelease(data);
    setStats({
      packages: data.summary?.packages ?? 0,
      openIssues: data.platform?.open_issues ?? 0,
      ciBuilds: Array.isArray(data.ci_status) ? data.ci_status.length : 0,
    });
  };

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/api/releases/${releaseId}`)
      .then((res) => res.json())
      .then(updateRelease);
  }, [releaseId]);

  const handleRefresh = async () => {
    if (!releaseId || refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch(
        `http://127.0.0.1:8000/api/releases/${releaseId}/refresh`,
        { method: "POST" }
      );
      const data = await res.json();
      updateRelease(data);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <TopBar releaseId={releaseId ?? "latest"} />

      <div className="dashboard-layout-wrapper">
        {refreshing && (
          <div className="refresh-overlay">
            <div className="refresh-spinner">
              <Loader2 size={40} className="spin" />
              <span>Refreshing data...</span>
            </div>
          </div>
        )}

        <div className={`dashboard-layout${refreshing ? " refreshing" : ""}`}>
          <section className="dashboard-main">
            <ReleaseHeader
              release={release}
              ciStatus={release?.ci_status}
              lastRefreshedAt={lastRefreshedAt}
              onRefresh={handleRefresh}
              refreshing={refreshing}
            />
            {release && (
              <KpiGrid
                summary={release.summary}
                openIssues={release.platform?.open_issues ?? 0}
                openPullRequests={release.platform?.open_pull_requests ?? 0}
              />
            )}
            <ReleaseTimeline steps={release?.timeline} />
            <PackageTable packages={release?.packages_list ?? []} />
            <BottomPanels />
          </section>

          <RightPanel recentActivity={release?.recent_activity ?? []} />
        </div>
      </div>
    </>
  );
}
