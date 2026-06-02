import { AlertTriangle, CalendarDays, Link2 } from "lucide-react";

export default function BottomPanels() {
  return (
    <section className="bottom-grid">
      <MiniPanel
        title="Upcoming Milestones"
        icon={<CalendarDays size={16} />}
        items={[
          "May 22 · Release Candidate (RC1)",
          "May 25 · RC Validation",
          "May 29 · Final Release",
        ]}
      />

      <MiniPanel
        title="Alerts"
        icon={<AlertTriangle size={16} />}
        items={[
          "4 packages have failing builds",
          "3 packages waiting maintainer > 7 days",
          "2 packages with version mismatch",
        ]}
      />

      <MiniPanel
        title="Release Resources"
        icon={<Link2 size={16} />}
        items={[
          "Package Pick Repository",
          "Rocq Platform CI",
          "Release Procedure",
          "Open Please Pick Issues",
        ]}
      />
    </section>
  );
}

function MiniPanel({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
}) {
  return (
    <section className="panel mini">
      <div className="mini-header">
        {icon}
        <h3>{title}</h3>
      </div>

      {items.map((item) => (
        <p key={item}>{item}</p>
      ))}
    </section>
  );
}
