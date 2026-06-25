// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** KPI summary grid displaying package status counters. */

import {
  Boxes,
  CheckCircle2,
  Clock,
  CircleOff,
  GitBranch,
  GitPullRequest,
  TriangleAlert,
} from "lucide-react";

interface KpiGridProps {
  summary: {
    packages: number;
    ready: number;
    waiting: number;
    blocked: number;
    disabled?: number;
  };
  openIssues: number;
  openPullRequests: number;
}

export default function KpiGrid({ summary, openIssues, openPullRequests }: KpiGridProps) {
  if (!summary) {
    return null;
  }

  return (
    <section className="kpi-grid">
      <Kpi title="Packages" value={summary.packages ?? 0} icon={<Boxes />} />
      <Kpi title="Ready" value={summary.ready ?? 0} icon={<CheckCircle2 />} />
      <Kpi title="Waiting" value={summary.waiting ?? 0} icon={<Clock />} />
      <Kpi title="Blocked" value={summary.blocked ?? 0} icon={<TriangleAlert />} />
      <Kpi title="Disabled" value={summary.disabled ?? 0} icon={<CircleOff />} />
      <Kpi title="Issues Open" value={openIssues} icon={<GitBranch />} href="https://github.com/rocq-prover/platform/issues" />
      <Kpi title="Pull Requests" value={openPullRequests} icon={<GitPullRequest />} href="https://github.com/rocq-prover/platform/pulls" />
    </section>
  );
}

function Kpi({
  title,
  value,
  icon,
  href,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  href?: string;
}) {
  return (
    <div className="kpi blue">
      <div>
        <span>{title}</span>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="kpi-link">
            <strong>{value}</strong>
          </a>
        ) : (
          <strong>{value}</strong>
        )}
      </div>

      {icon}
    </div>
  );
}
