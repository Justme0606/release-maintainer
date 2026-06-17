// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Bottom dashboard panels for milestones, links and alerts. */

import { AlertTriangle, CalendarDays, Link2 } from "lucide-react";

interface TimelineStep {
  label: string;
  date: string;
  state: "done" | "current" | "todo";
}

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function BottomPanels({ timeline }: { timeline?: TimelineStep[] }) {
  return (
    <section className="bottom-grid">
      <section className="panel mini">
        <div className="mini-header">
          <CalendarDays size={16} />
          <h3>Upcoming Milestones</h3>
        </div>
        {(timeline ?? []).map((step) => (
          <p
            key={step.label}
            style={step.state === "done" ? { opacity: 0.4 } : undefined}
          >
            {formatDate(step.date)} · {step.label}
          </p>
        ))}
      </section>

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
