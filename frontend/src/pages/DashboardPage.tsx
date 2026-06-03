import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

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

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/api/releases/${releaseId}`)
      .then((res) => res.json())
      .then(setRelease);
  }, [releaseId]);

  return (
    <>
      <TopBar releaseId={releaseId ?? "latest"} />

      <div className="dashboard-layout">
        <section className="dashboard-main">
          <ReleaseHeader release={release} />
          <KpiGrid />
          <ReleaseTimeline />
          <PackageTable />
          <BottomPanels />
        </section>

        <RightPanel />
      </div>
    </>
  );
}
