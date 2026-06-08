import { useState } from "react";
import { ChevronLeft, ChevronRight, Circle } from "lucide-react";

interface ActivityEvent {
  type: string;
  text: string;
  url: string;
  date: string;
  state: string;
}

const PAGE_SIZE = 4;

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

interface RightPanelProps {
  recentActivity?: ActivityEvent[];
}

export default function RightPanel({ recentActivity = [] }: RightPanelProps) {
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
        <div className="donut">
          <div>
            53
            <br />
            <span>Total</span>
          </div>
        </div>

        <Legend label="Open" value="34 (64%)" />
        <Legend label="Closed" value="15 (28%)" />
        <Legend label="Expired" value="2 (4%)" />
        <Legend label="Draft" value="2 (4%)" />
      </SideCard>

      <SideCard title="Builds Summary">
        <Bar label="Success" value="128 (89%)" percent={89} />
        <Bar label="Failed" value="10 (7%)" percent={7} />
        <Bar label="Running" value="4 (3%)" percent={3} />
        <Bar label="Cancelled" value="2 (1%)" percent={1} />
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
