import { Circle } from "lucide-react";

export default function RightPanel() {
  return (
    <aside className="right-panel">
      <SideCard title="Recent Activity">
        <ActivityItem
          state="success"
          text="CI build #1284 succeeded"
          meta="2h ago · rocq-platform-bot"
        />
        <ActivityItem
          state="danger"
          text="Please pick issue #1284 opened for coq-elpi"
          meta="3h ago · @ocamlpro"
        />
        <ActivityItem
          state="success"
          text="Package mathcomp marked as ready"
          meta="5h ago · @ocamlpro"
        />
        <ActivityItem
          state="danger"
          text="CI build #1281 failed"
          meta="1d ago · rocq-platform-bot"
        />
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
}: {
  state: string;
  text: string;
  meta: string;
}) {
  return (
    <div className={`activity-item ${state}`}>
      <Circle size={10} />
      <div>
        <strong>{text}</strong>
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
