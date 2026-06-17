// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Release timeline component showing milestone progression. */

import {
  Boxes,
  CheckCircle2,
  GitBranch,
  Rocket,
  ShieldCheck,
} from "lucide-react";

type TimelineStep = {
  label: string;
  date: string;
  state: "done" | "current" | "todo";
};

interface ReleaseTimelineProps {
  steps?: TimelineStep[];
}

/** Map each milestone label to its Lucide icon. */
const ICONS: Record<string, typeof Boxes> = {
  "Package Pick": Boxes,
  "Please Pick": GitBranch,
  "Validation": ShieldCheck,
  "Release Candidate": Rocket,
  "Final Release": CheckCircle2,
};

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ReleaseTimeline({ steps }: ReleaseTimelineProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Release Timeline</h2>
      </div>

      <div className="horizontal-timeline">
        {(steps ?? []).map((item) => {
          const Icon = ICONS[item.label] ?? Boxes;

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
              <small>{formatDate(item.date)}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
