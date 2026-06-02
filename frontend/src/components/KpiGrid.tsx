import {
  Activity,
  Boxes,
  CheckCircle2,
  Clock,
  GitBranch,
  TriangleAlert,
} from "lucide-react";

export default function KpiGrid() {
  return (
    <section className="kpi-grid">
      <Kpi title="Packages" value="142" icon={<Boxes />} />
      <Kpi title="Ready" value="118" icon={<CheckCircle2 />} />
      <Kpi title="Waiting" value="17" icon={<Clock />} />
      <Kpi title="Blocked" value="7" icon={<TriangleAlert />} />
      <Kpi title="Issues Open" value="53" icon={<GitBranch />} />
      <Kpi title="Failing Builds" value="4" icon={<Activity />} />
    </section>
  );
}

function Kpi({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="kpi blue">
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>

      {icon}
    </div>
  );
}
