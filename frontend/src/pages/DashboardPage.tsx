import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import TopBar from "../components/TopBar";
import ReleaseHeader from "../components/ReleaseHeader";
import KpiGrid from "../components/KpiGrid";
import ReleaseTimeline from "../components/ReleaseTimeline";
import PackageTable from "../components/PackageTable";
import RightPanel from "../components/RightPanel";
import BottomPanels from "../components/BottomPanels";

function ZoneLoader({
  loading,
  children,
}: {
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`zone-wrapper${loading ? " loading" : ""}`}>
      {children}
      {loading && (
        <div className="zone-overlay">
          <Loader2 className="spin" size={24} />
        </div>
      )}
    </div>
  );
}

type ZoneLoading = {
  header: boolean;
  timeline: boolean;
  packages: boolean;
  activity: boolean;
};

export default function DashboardPage() {
  const { releaseId } = useParams();
  const [release, setRelease] = useState<any>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState<ZoneLoading>({
    header: false,
    timeline: false,
    packages: false,
    activity: false,
  });
  const isRefreshing = Object.values(loading).some(Boolean);

  const updateRelease = (data: any) => {
    setLastRefreshedAt(data.last_refreshed_at ?? null);
    setRelease(data);
  };

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/api/releases/${releaseId}`)
      .then((res) => res.json())
      .then(updateRelease);
  }, [releaseId]);

  const handleRefresh = async () => {
    if (!releaseId || isRefreshing) return;

    setLoading({ header: true, timeline: true, packages: true, activity: true });

    const refreshZone = async (zone: keyof ZoneLoading) => {
      try {
        const res = await fetch(
          `http://127.0.0.1:8000/api/releases/${releaseId}/refresh/${zone}`,
          { method: "POST" }
        );
        const data = await res.json();

        setRelease((prev: any) => {
          if (!prev) return prev;
          switch (zone) {
            case "header":
              return {
                ...prev,
                summary: { ...prev.summary, ...data.summary },
                ci_status: data.ci_status,
                issues_by_state: data.issues_by_state ?? prev.issues_by_state,
                builds_summary: data.builds_summary ?? prev.builds_summary,
                platform: { ...prev.platform, ...data.platform },
              };
            case "timeline":
              return { ...prev, timeline: data.timeline };
            case "packages":
              return {
                ...prev,
                packages_list: data.packages_list,
                summary: { ...prev.summary, ...data.summary },
              };
            case "activity":
              return { ...prev, recent_activity: data.recent_activity };
            default:
              return prev;
          }
        });
      } finally {
        setLoading((prev) => ({ ...prev, [zone]: false }));
      }
    };

    const zones: (keyof ZoneLoading)[] = ["header", "timeline", "packages", "activity"];
    for (const zone of zones) {
      await refreshZone(zone);
    }
  };

  return (
    <>
      <TopBar releaseId={releaseId ?? "latest"} />

      <div className="dashboard-layout">
        <section className="dashboard-main">
          <ZoneLoader loading={loading.header}>
            <div>
              <ReleaseHeader
                release={release}
                ciStatus={release?.ci_status}
                lastRefreshedAt={lastRefreshedAt}
                onRefresh={handleRefresh}
                refreshing={isRefreshing}
              />
              {release && (
                <KpiGrid
                  summary={release.summary}
                  openIssues={release.platform?.open_issues ?? 0}
                  openPullRequests={release.platform?.open_pull_requests ?? 0}
                />
              )}
            </div>
          </ZoneLoader>
          <ZoneLoader loading={loading.timeline}>
            <ReleaseTimeline steps={release?.timeline} />
          </ZoneLoader>
          <ZoneLoader loading={loading.packages}>
            <PackageTable packages={release?.packages_list ?? []} />
          </ZoneLoader>
          <BottomPanels />
        </section>

        <ZoneLoader loading={loading.activity}>
          <RightPanel
            recentActivity={release?.recent_activity ?? []}
            issuesByState={release?.issues_by_state}
            buildsSummary={release?.builds_summary}
          />
        </ZoneLoader>
      </div>
    </>
  );
}
