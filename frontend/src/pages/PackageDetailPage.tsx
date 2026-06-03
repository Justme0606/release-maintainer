import { Link, useParams } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  GitBranch,
  ExternalLink,
  Rocket,
} from "lucide-react";

import { packages } from "../data/mockPackages";

export default function PackageDetailPage() {
  const { releaseId, packageName } = useParams();

  const pkg = packages.find((item) => item.name === packageName);

  if (!pkg) {
    return (
      <section className="panel">
        <h1>Package not found</h1>
        <Link to="/">Back to dashboard</Link>
      </section>
    );
  }

  return (
    <>
      <div className="detail-header">
        <Link to={`/releases/${releaseId}`} className="linkish">
          ← Back to dashboard
        </Link>

        <h1>{pkg.name}</h1>
        <p>{pkg.repo}</p>
      </div>

      <section className="kpi-grid">
        <div className="kpi blue">
          <div>
            <span>Selected Version</span>
            <strong>{pkg.pick}</strong>
          </div>
        </div>

        <div className="kpi green">
          <div>
            <span>Latest OPAM</span>
            <strong>{pkg.opam}</strong>
          </div>
        </div>

        <div className="kpi purple">
          <div>
            <span>Latest Git Tag</span>
            <strong>{pkg.tag}</strong>
          </div>
        </div>

        <div className="kpi yellow">
          <div>
            <span>Please Pick</span>
            <strong>{pkg.issue}</strong>
          </div>
        </div>
      </section>

      <div className="dashboard-layout">
        <section className="dashboard-main">
          <section className="panel">
            <div className="panel-header">
              <h2>Package Timeline</h2>
            </div>

            <div className="horizontal-timeline package-horizontal-timeline">
              <div className="timeline-step done">
                <div className="timeline-icon">
                  <GitBranch size={20} />
                </div>
                <strong>Please Pick</strong>
                <span>Opened</span>
                <small>May 3</small>
              </div>

              <div className="timeline-step done">
                <div className="timeline-icon">
                  <Clock size={20} />
                </div>
                <strong>Maintainer</strong>
                <span>Replied</span>
                <small>May 8</small>
              </div>

              <div className="timeline-step current">
                <div className="timeline-icon">
                  <Rocket size={20} />
                </div>
                <strong>CI Build</strong>
                <span>Success</span>
                <small>May 15</small>
              </div>

              <div className="timeline-step current">
                <div className="timeline-icon">
                  <CheckCircle2 size={20} />
                </div>
                <strong>Validation</strong>
                <span>Waiting</span>
                <small>Now</small>
              </div>

              <div className="timeline-step todo">
                <div className="timeline-icon">
                  <CheckCircle2 size={20} />
                </div>
                <strong>Ready</strong>
                <span>Pending</span>
                <small>—</small>
              </div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2>Please Pick Issue</h2>
            </div>

            <div className="issue-card">
              <div className="issue-header">
                <strong>#1284</strong>
                <span className="pill waiting">waiting-maintainer</span>
              </div>

              <div className="detail-info">
                <span>Author</span>
                <strong>rocq-platform-bot</strong>
              </div>

              <div className="detail-info">
                <span>Opened</span>
                <strong>May 3, 2026</strong>
              </div>

              <div className="detail-info">
                <span>Labels</span>

                <div className="label-group">
                  <span className="pill">please-pick</span>
                  <span className="pill">rocq-9.1</span>
                  <span className="pill waiting">waiting-maintainer</span>
                </div>
              </div>

              <div className="issue-comment">
                Package compiles successfully with Rocq 9.1. Waiting maintainer
                validation before merge.
              </div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2>Build Matrix</h2>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td>Linux</td>
                  <td>
                    <span className="pill ready">SUCCESS</span>
                  </td>
                </tr>

                <tr>
                  <td>macOS</td>
                  <td>
                    <span className="pill ready">SUCCESS</span>
                  </td>
                </tr>

                <tr>
                  <td>Windows</td>
                  <td>
                    <span className="pill ready">SUCCESS</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        </section>

        <aside className="right-panel">
          <section className="side-card">
            <h3>Package Status</h3>

            <div className="status-big waiting">WAITING</div>

            <div className="detail-info">
              <span>Issue opened</span>
              <strong>17 days ago</strong>
            </div>

            <div className="detail-info">
              <span>Last maintainer activity</span>
              <strong>8 days ago</strong>
            </div>

            <div className="detail-info">
              <span>Next action</span>
              <strong>Send reminder</strong>
            </div>
          </section>
          <section className="side-card">
            <h3>Maintainer</h3>

            <div className="detail-info">
              <span>Name</span>
              <strong>John Doe</strong>
            </div>

            <div className="detail-info">
              <span>Status</span>
              <strong>{pkg.status}</strong>
            </div>

            <div className="detail-info">
              <span>Repository</span>
              <strong>{pkg.repo}</strong>
            </div>
          </section>

          <section className="side-card">
            <h3>Actions</h3>

            <button className="action-btn">
              <ExternalLink size={16} />
              Open Repository
            </button>

            <button className="action-btn">
              <GitBranch size={16} />
              Open Please Pick
            </button>

            <button className="action-btn">
              <Rocket size={16} />
              Trigger Build
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}

function TimelineEvent({
  icon,
  title,
  date,
}: {
  icon: React.ReactNode;
  title: string;
  date: string;
}) {
  return (
    <div className="timeline-event">
      <div className="timeline-event-icon">{icon}</div>

      <div>
        <strong>{title}</strong>
        <span>{date}</span>
      </div>
    </div>
  );
}
