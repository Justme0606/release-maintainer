import TopBar from "../components/TopBar";
import ReleaseHeader from "../components/ReleaseHeader";
import KpiGrid from "../components/KpiGrid";
import ReleaseTimeline from "../components/ReleaseTimeline";
import PackageTable from "../components/PackageTable";
import RightPanel from "../components/RightPanel";
import BottomPanels from "../components/BottomPanels";

export default function DashboardPage() {
  return (
    <>
      <TopBar />

      <div className="dashboard-layout">
        <section className="dashboard-main">
          <ReleaseHeader />
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
