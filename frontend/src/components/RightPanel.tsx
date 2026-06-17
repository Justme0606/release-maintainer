// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Collapsible right panel displaying recent activity feed. */

import { useState } from "react";
import { ChevronLeft, ChevronRight, Circle } from "lucide-react";

interface ActivityEvent {
  type: string;
  text: string;
  url: string;
  date: string;
  state: string;
}

/** Number of activity events shown per page. */
const PAGE_SIZE = 4;

/** Format a date string as a relative time (e.g. "3h ago", "2d ago"). */
function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface IssuesByState {
  open: number;
  closed: number;
  draft_prs: number;
}

interface BuildsSummary {
  success: number;
  failed: number;
  running: number;
  cancelled: number;
}

interface RightPanelProps {
  recentActivity?: ActivityEvent[];
  issuesByState?: IssuesByState;
  buildsSummary?: BuildsSummary;
}

export default function RightPanel({ recentActivity = [], issuesByState, buildsSummary }: RightPanelProps) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(recentActivity.length / PAGE_SIZE));
  const pageItems = recentActivity.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <aside className="right-panel">
      <SideCard title="Recent Activity">
        <div className="activity-list">
          {recentActivity.length === 0 && (
            <div className="activity-item info">
              <Circle size={10} />
              <div><strong>No recent activity</strong><span></span></div>
            </div>
          )}
          {pageItems.map((event, i) => (
            <ActivityItem
              key={page * PAGE_SIZE + i}
              state={event.state}
              text={event.text}
              meta={formatRelativeDate(event.date)}
              url={event.url}
            />
          ))}
        </div>
        {totalPages > 1 && (
          <div className="activity-pagination">
            <button disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={14} />
            </button>
            <span>{page + 1} / {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </SideCard>

      <SideCard title="Issues by State">
        {(() => {
          const open = issuesByState?.open ?? 0;
          const closed = issuesByState?.closed ?? 0;
          const draft = issuesByState?.draft_prs ?? 0;
          const total = open + closed + draft;
          const pctOpen = total > 0 ? Math.round((open / total) * 100) : 0;
          const pctClosed = total > 0 ? Math.round((closed / total) * 100) : 0;
          const pctDraft = total > 0 ? 100 - pctOpen - pctClosed : 0;
          const gradient = total > 0
            ? `conic-gradient(#8b5cf6 0% ${pctOpen}%, #22c55e ${pctOpen}% ${pctOpen + pctClosed}%, #64748b ${pctOpen + pctClosed}% 100%)`
            : "conic-gradient(#334155 0% 100%)";
          return (
            <>
              <div className="donut" style={{ background: gradient }}>
                <div>
                  {total}
                  <br />
                  <span>Total</span>
                </div>
              </div>
              <Legend label="Open" value={`${open} (${pctOpen}%)`} />
              <Legend label="Closed" value={`${closed} (${pctClosed}%)`} />
              <Legend label="Draft PRs" value={`${draft} (${pctDraft}%)`} />
            </>
          );
        })()}
      </SideCard>

      <SideCard title="Builds Summary">
        {(() => {
          const success = buildsSummary?.success ?? 0;
          const failed = buildsSummary?.failed ?? 0;
          const running = buildsSummary?.running ?? 0;
          const cancelled = buildsSummary?.cancelled ?? 0;
          const total = success + failed + running + cancelled;
          const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
          return (
            <>
              <Bar label="Success" value={`${success} (${pct(success)}%)`} percent={pct(success)} />
              <Bar label="Failed" value={`${failed} (${pct(failed)}%)`} percent={pct(failed)} />
              <Bar label="Running" value={`${running} (${pct(running)}%)`} percent={pct(running)} />
              <Bar label="Cancelled" value={`${cancelled} (${pct(cancelled)}%)`} percent={pct(cancelled)} />
            </>
          );
        })()}
      </SideCard>

      <SideCard title="Packages by Status">
        <div className="status-line">
          <i style={{ width: "83%" }} />
          <b style={{ width: "12%" }} />
          <em style={{ width: "5%" }} />
        </div>

        <Legend label="Ready" value="118 (83%)" />
        <Legend label="Waiting" value="17 (12%)" />
        <Legend label="Blocked" value="7 (5%)" />
      </SideCard>
    </aside>
  );
}

function SideCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="side-card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function ActivityItem({
  state,
  text,
  meta,
  url,
}: {
  state: string;
  text: string;
  meta: string;
  url?: string;
}) {
  return (
    <div className={`activity-item ${state}`}>
      <Circle size={10} />
      <div>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer"><strong>{text}</strong></a>
        ) : (
          <strong>{text}</strong>
        )}
        <span>{meta}</span>
      </div>
    </div>
  );
}

function Legend({ label, value }: { label: string; value: string }) {
  return (
    <div className="legend">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Bar({
  label,
  value,
  percent,
}: {
  label: string;
  value: string;
  percent: number;
}) {
  return (
    <div className="bar-row">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>

      <div className="bar">
        <i style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
