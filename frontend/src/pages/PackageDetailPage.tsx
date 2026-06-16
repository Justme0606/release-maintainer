import { useEffect, useState, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ExternalLink, GitBranch } from "lucide-react";
import { useDepGraph } from "../context/DepGraphContext";

import type { FullGraph } from "../context/DepGraphContext";

interface PackageInfo {
  name: string;
  pick_version: string;
  opam_version: string | null;
  git_tag: string | null;
  issue_url: string | null;
  repo_url: string | null;
  status: "ready" | "waiting" | "blocked" | "unknown";
  disabled?: boolean;
  disabled_reason?: string | null;
}

interface IssueLabel {
  name: string;
  color: string;
}

interface IssueAssignee {
  login: string;
  avatar_url: string;
}

interface IssueComment {
  author: string;
  author_avatar: string;
  created_at: string;
  body: string;
}

interface IssueDetails {
  number: number;
  title: string;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  author: string;
  author_avatar: string;
  labels: IssueLabel[];
  assignees: IssueAssignee[];
  comments: IssueComment[];
}

interface OpamInfo {
  maintainer?: string;
  authors?: string;
  synopsis?: string;
  description?: string;
  homepage?: string;
  version?: string;
  license?: string;
  "bug-reports"?: string;
  "dev-repo"?: string;
}

/* ------------------------------------------------------------------ */
/*  Package relations — depends on / required by                       */
/* ------------------------------------------------------------------ */

function PackageRelations({
  graph,
  packageName,
  releaseId,
}: {
  graph: FullGraph;
  packageName: string;
  releaseId: string;
}) {
  const navigate = useNavigate();

  const { dependsOn, requiredBy } = useMemo(() => {
    const statusMap = new Map<string, string>();
    for (const n of graph.nodes) statusMap.set(n.name, n.status);

    const deps: { name: string; status: string }[] = [];
    const rdeps: { name: string; status: string }[] = [];

    for (const e of graph.edges) {
      if (e.from === packageName) {
        deps.push({ name: e.to, status: statusMap.get(e.to) ?? "unknown" });
      }
      if (e.to === packageName) {
        rdeps.push({
          name: e.from,
          status: statusMap.get(e.from) ?? "unknown",
        });
      }
    }

    deps.sort((a, b) => a.name.localeCompare(b.name));
    rdeps.sort((a, b) => a.name.localeCompare(b.name));
    return { dependsOn: deps, requiredBy: rdeps };
  }, [graph, packageName]);

  if (dependsOn.length === 0 && requiredBy.length === 0) return null;

  const renderList = (items: { name: string; status: string }[]) =>
    items.map((item) => (
      <button
        key={item.name}
        className="rel-chip"
        onClick={() =>
          navigate(`/releases/${releaseId}/packages/${item.name}`)
        }
      >
        <span className={`rel-chip-bar ${item.status}`} />
        {item.name}
      </button>
    ));

  return (
    <section className="panel" style={{ marginBottom: 18 }}>
      <div className="panel-header">
        <h2>Package Relations</h2>
      </div>
      <div className="rel-grid">
        {dependsOn.length > 0 && (
          <div className="rel-col">
            <h3 className="rel-heading">
              Depends on <span className="rel-count">{dependsOn.length}</span>
            </h3>
            <div className="rel-list">{renderList(dependsOn)}</div>
          </div>
        )}
        {requiredBy.length > 0 && (
          <div className="rel-col">
            <h3 className="rel-heading">
              Required by{" "}
              <span className="rel-count">{requiredBy.length}</span>
            </h3>
            <div className="rel-list">{renderList(requiredBy)}</div>
          </div>
        )}
      </div>
    </section>
  );
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "1 month ago";
  return `${diffMonths} months ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function labelStatusClass(labelName: string): string {
  const lower = labelName.toLowerCase();
  if (lower.includes("waiting")) return "waiting";
  if (lower.includes("blocked")) return "blocked";
  if (lower.includes("ready") || lower.includes("merged")) return "ready";
  return "";
}

export default function PackageDetailPage() {
  const { releaseId, packageName } = useParams();
  const [pkg, setPkg] = useState<PackageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [issue, setIssue] = useState<IssueDetails | null>(null);
  const [issueLoading, setIssueLoading] = useState(true);
  const [opam, setOpam] = useState<OpamInfo | null>(null);
  const { getGraph, fetchGraph } = useDepGraph();
  const [graph, setGraph] = useState<FullGraph | null>(() =>
    releaseId ? getGraph(releaseId) : null,
  );

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/api/releases/${releaseId}`)
      .then((res) => res.json())
      .then((data) => {
        const found = (data.packages_list ?? []).find(
          (p: PackageInfo) => p.name === packageName
        );
        setPkg(found ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [releaseId, packageName]);

  useEffect(() => {
    if (!releaseId || !packageName) return;
    setIssueLoading(true);
    fetch(
      `http://127.0.0.1:8000/api/releases/${releaseId}/packages/${packageName}/issue`
    )
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        setIssue(data);
        setIssueLoading(false);
      })
      .catch(() => setIssueLoading(false));
  }, [releaseId, packageName]);

  useEffect(() => {
    if (!releaseId || !packageName) return;
    fetch(
      `http://127.0.0.1:8000/api/releases/${releaseId}/packages/${packageName}/opam`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setOpam(data))
      .catch(() => setOpam(null));
  }, [releaseId, packageName]);

  useEffect(() => {
    if (!releaseId) return;
    const cached = getGraph(releaseId);
    if (cached) {
      setGraph(cached);
      return;
    }
    fetchGraph(releaseId)
      .then((g) => setGraph(g))
      .catch(() => {});
  }, [releaseId]);

  if (loading) {
    return (
      <section className="panel">
        <p>Loading...</p>
      </section>
    );
  }

  if (!pkg) {
    return (
      <section className="panel">
        <h1>Package not found</h1>
        <Link to="/">Back to dashboard</Link>
      </section>
    );
  }

  // Maintainer from opam metadata (the real package maintainer)
  const opamMaintainers = opam?.maintainer?.split("\n").filter(Boolean) ?? [];
  const opamAuthors = opam?.authors?.split("\n").filter(Boolean) ?? [];
  const opamDescription = opam?.synopsis || opam?.description || null;

  return (
    <>
      <div className="detail-header">
        <Link to={`/releases/${releaseId}`} className="linkish">
          ← Back to dashboard
        </Link>

        <h1>{pkg.name}</h1>
        {opamDescription && (
          <p style={{ opacity: 0.7, margin: "4px 0 0", fontSize: "0.95rem" }}>
            {opamDescription}
          </p>
        )}
      </div>

      <section className="kpi-grid">
        <div className="kpi blue">
          <div>
            <span>Selected Version</span>
            <strong>{pkg.pick_version}</strong>
          </div>
        </div>

        <div className="kpi green">
          <div>
            <span>Latest OPAM</span>
            <strong>{opam?.version ?? pkg.opam_version ?? "—"}</strong>
          </div>
        </div>

        <div className="kpi purple">
          <div>
            <span>Latest Git Tag</span>
            <strong>{pkg.git_tag ?? "—"}</strong>
          </div>
        </div>

        <div className="kpi yellow">
          <div>
            <span>Repository</span>
            <strong>
              {pkg.repo_url ? (
                <a href={pkg.repo_url} target="_blank" rel="noopener noreferrer">
                  {pkg.repo_url.replace("https://github.com/", "")}
                </a>
              ) : opam?.homepage ? (
                <a href={opam.homepage} target="_blank" rel="noopener noreferrer">
                  {opam.homepage.replace("https://github.com/", "")}
                </a>
              ) : (
                "—"
              )}
            </strong>
          </div>
        </div>
      </section>

      {/* Package relations */}
      {graph && graph.edges.length > 0 && (
        <PackageRelations
          graph={graph}
          packageName={pkg.name}
          releaseId={releaseId!}
        />
      )}

      <div className="dashboard-layout">
        <section className="dashboard-main">
          <section className="panel">
            <div className="panel-header">
              <h2>Please Pick Issue</h2>
            </div>

            {issueLoading ? (
              <p style={{ padding: 16, opacity: 0.6 }}>Loading issue...</p>
            ) : issue ? (
              <div className="issue-card">
                <div className="issue-header">
                  <a
                    href={issue.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <strong>#{issue.number}</strong>
                  </a>
                  <span className={`pill ${issue.state === "open" ? "waiting" : "ready"}`}>
                    {issue.state}
                  </span>
                </div>

                <div className="detail-info">
                  <span>Title</span>
                  <strong>{issue.title}</strong>
                </div>

                <div className="detail-info">
                  <span>Author</span>
                  <strong>{issue.author}</strong>
                </div>

                <div className="detail-info">
                  <span>Opened</span>
                  <strong>{formatDate(issue.created_at)}</strong>
                </div>

                {issue.labels.length > 0 && (
                  <div className="detail-info">
                    <span>Labels</span>
                    <div className="label-group">
                      {issue.labels.map((l) => (
                        <span
                          key={l.name}
                          className={`pill ${labelStatusClass(l.name)}`}
                        >
                          {l.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {issue.comments.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <span style={{ opacity: 0.6, fontSize: "0.85rem" }}>
                      Comments ({issue.comments.length})
                    </span>
                    {issue.comments.map((c, i) => (
                      <div key={i} className="issue-comment">
                        <strong>{c.author}</strong>{" "}
                        <span style={{ opacity: 0.6 }}>
                          ({formatTimeAgo(c.created_at)})
                        </span>
                        <br />
                        {c.body}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ padding: 16, opacity: 0.6 }}>No linked issue.</p>
            )}
          </section>
        </section>

        <aside className="right-panel">
          <section className="side-card">
            <h3>Package Status</h3>

            <div className={`status-big ${pkg.status}`}>
              {pkg.status.toUpperCase()}
            </div>

            {issue && (
              <>
                <div className="detail-info">
                  <span>Issue opened</span>
                  <strong>{formatTimeAgo(issue.created_at)}</strong>
                </div>

                <div className="detail-info">
                  <span>Last activity</span>
                  <strong>{formatTimeAgo(issue.updated_at)}</strong>
                </div>
              </>
            )}

            {opam?.license && (
              <div className="detail-info">
                <span>License</span>
                <strong>{opam.license}</strong>
              </div>
            )}
          </section>

          <section className="side-card">
            <h3>Maintainer</h3>

            {opamMaintainers.length > 0 ? (
              opamMaintainers.map((m, i) => (
                <div key={i} className="detail-info">
                  <strong>{m}</strong>
                </div>
              ))
            ) : (
              <div className="detail-info">
                <span>Unknown</span>
              </div>
            )}

            {opamAuthors.length > 0 &&
              opamAuthors.join() !== opamMaintainers.join() && (
              <>
                <h3 style={{ marginTop: 12 }}>Authors</h3>
                {opamAuthors.map((a, i) => (
                  <div key={i} className="detail-info">
                    <strong>{a}</strong>
                  </div>
                ))}
              </>
            )}
          </section>

          <section className="side-card">
            <h3>Actions</h3>

            {(pkg.repo_url || opam?.homepage) && (
              <a
                href={pkg.repo_url ?? opam?.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="action-btn"
              >
                <ExternalLink size={16} />
                Open Repository
              </a>
            )}

            {issue && (
              <a
                href={issue.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="action-btn"
              >
                <GitBranch size={16} />
                Open Please Pick Issue
              </a>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
