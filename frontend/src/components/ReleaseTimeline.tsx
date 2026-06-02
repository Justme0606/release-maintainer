import {
  Activity,
  Boxes,
  CheckCircle2,
  GitBranch,
  Rocket,
  ShieldCheck,
} from "lucide-react";

const timeline = [
  { label: "Package Pick", state: "done", date: "May 1", icon: Boxes },
  { label: "Please Pick", state: "current", date: "May 3", icon: GitBranch },
  { label: "Validation", state: "done", date: "May 12", icon: ShieldCheck },
  { label: "CI Build", state: "current", date: "May 15", icon: Activity },
  { label: "Release Candidate", state: "todo", date: "May 22", icon: Rocket },
  { label: "Final Release", state: "todo", date: "May 29", icon: CheckCircle2 },
];

export default function ReleaseTimeline() {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Release Timeline</h2>
        <button>View full timeline</button>
      </div>

      <div className="horizontal-timeline">
        {timeline.map((item) => {
          const Icon = item.icon;

          return (
            <div className={`timeline-step ${item.state}`} key={item.label}>
              <div className="timeline-icon">
                <Icon size={20} />
              </div>

              <strong>{item.label}</strong>
              <span>
                {item.state === "done"
                  ? "Completed"
                  : item.state === "current"
                    ? "In Progress"
                    : "Pending"}
              </span>
              <small>{item.date}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
