// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Package detail page with dependency graph and issue details. */

import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ExternalLink, GitBranch } from "lucide-react";
import { useDepGraph } from "../context/DepGraphContext";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { FullGraph, GraphNode } from "../context/DepGraphContext";

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
/*  Full release DAG — ReactFlow interactive graph                     */
/* ------------------------------------------------------------------ */

// Layout constants for the ReactFlow dependency graph
const NODE_W = 200;   // Node width in pixels
const NODE_H = 40;    // Node height in pixels
const GAP_X = 80;     // Horizontal gap between columns
const GAP_Y = 12;     // Vertical gap between nodes in a column
const PAD_X = 24;     // Left padding
const PAD_Y = 20;     // Top padding
const MAX_PER_COL = 10; // Max nodes per visual column before splitting

type DepNodeData = {
  label: string;
  status: string;
  isHighlighted: boolean;
  isRelated: boolean;
  releaseId: string;
};

function DepNodeComponent({ data }: NodeProps<Node<DepNodeData>>) {
  const navigate = useNavigate();

  const cls = [
    "dep-flow-node",
    data.isHighlighted ? "highlighted" : "",
    data.isRelated && !data.isHighlighted ? "related" : "",
    !data.isRelated ? "dimmed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const statusColor =
    data.status === "ready"
      ? "#22c55e"
      : data.status === "waiting"
        ? "#f59e0b"
        : data.status === "blocked"
          ? "#ef4444"
          : "#64748b";

  return (
    <div
      className={cls}
      style={{ borderLeftColor: statusColor }}
      onClick={() =>
        navigate(`/releases/${data.releaseId}/packages/${data.label}`)
      }
    >
      <Handle type="target" position={Position.Left} />
      <span className="dep-flow-label">{data.label}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes: NodeTypes = { depNode: DepNodeComponent };

function DependencyDAG({
  graph,
  highlighted,
  releaseId,
}: {
  graph: FullGraph;
  highlighted: string;
  releaseId: string;
}) {
  // BFS in both directions to find all nodes connected to the highlighted package
  const related = useMemo(() => {
    const set = new Set<string>();
    set.add(highlighted);

    const childrenMap = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!childrenMap.has(e.from)) childrenMap.set(e.from, new Set());
      childrenMap.get(e.from)!.add(e.to);
    }
    const queue = [highlighted];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const child of childrenMap.get(cur) ?? []) {
        if (!set.has(child)) {
          set.add(child);
          queue.push(child);
        }
      }
    }

    const parentsMap = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!parentsMap.has(e.to)) parentsMap.set(e.to, new Set());
      parentsMap.get(e.to)!.add(e.from);
    }
    const queue2 = [highlighted];
    while (queue2.length) {
      const cur = queue2.shift()!;
      for (const parent of parentsMap.get(cur) ?? []) {
        if (!set.has(parent)) {
          set.add(parent);
          queue2.push(parent);
        }
      }
    }

    return set;
  }, [graph.edges, highlighted]);

  const { nodes, edges } = useMemo(() => {
    // Group nodes by depth
    const depthGroups = new Map<number, GraphNode[]>();
    for (const n of graph.nodes) {
      const list = depthGroups.get(n.depth) ?? [];
      list.push(n);
      depthGroups.set(n.depth, list);
    }

    const sortedDepths = [...depthGroups.keys()].sort((a, b) => a - b);

    // Split large groups into visual columns of MAX_PER_COL
    const visualColumns: GraphNode[][] = [];
    for (const depth of sortedDepths) {
      const nodesInGroup = depthGroups.get(depth)!;
      for (let i = 0; i < nodesInGroup.length; i += MAX_PER_COL) {
        visualColumns.push(nodesInGroup.slice(i, i + MAX_PER_COL));
      }
    }

    const rfNodes: Node<DepNodeData>[] = [];
    for (let col = 0; col < visualColumns.length; col++) {
      const nodesInCol = visualColumns[col];
      const colX = PAD_X + col * (NODE_W + GAP_X);

      for (let i = 0; i < nodesInCol.length; i++) {
        const n = nodesInCol[i];
        rfNodes.push({
          id: n.name,
          type: "depNode",
          position: { x: colX, y: PAD_Y + i * (NODE_H + GAP_Y) },
          data: {
            label: n.name,
            status: n.status ?? "unknown",
            isHighlighted: n.name === highlighted,
            isRelated: related.has(n.name),
            releaseId,
          },
        });
      }
    }

    const rfEdges: Edge[] = graph.edges.map((e, i) => {
      const isRelated = related.has(e.from) && related.has(e.to);
      return {
        id: `e-${i}`,
        source: e.from,
        target: e.to,
        type: "smoothstep",
        style: {
          stroke: isRelated ? "#3b82f6" : "rgba(148, 163, 184, 0.15)",
          strokeWidth: isRelated ? 2.5 : 2,
        },
        animated: isRelated,
      };
    });

    return { nodes: rfNodes, edges: rfEdges };
  }, [graph.nodes, graph.edges, highlighted, related, releaseId]);

  const onNodeClick = useCallback(() => {
    // Navigation handled inside DepNodeComponent
  }, []);

  if (graph.nodes.length === 0) {
    return <p className="dep-empty">No dependency data available.</p>;
  }

  return (
    <div className="dep-graph" style={{ height: 500 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        minZoom={0.3}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        defaultEdgeOptions={{ type: "smoothstep" }}
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap
          nodeColor={(node) => {
            const d = node.data as DepNodeData;
            if (d.isHighlighted) return "#3b82f6";
            if (!d.isRelated) return "rgba(148, 163, 184, 0.2)";
            return d.status === "ready"
              ? "#22c55e"
              : d.status === "waiting"
                ? "#f59e0b"
                : d.status === "blocked"
                  ? "#ef4444"
                  : "#64748b";
          }}
          style={{ background: "rgba(15, 23, 42, 0.8)" }}
          maskColor="rgba(0, 0, 0, 0.4)"
        />
        <Controls />
      </ReactFlow>
    </div>
  );
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
        onClick={() => navigate(`/releases/${releaseId}/packages/${item.name}`)}
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
              Required by <span className="rel-count">{requiredBy.length}</span>
            </h3>
            <div className="rel-list">{renderList(requiredBy)}</div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Format a date as a human-readable relative time (e.g. "3 days ago"). */
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

/** Map a GitHub label name to a CSS status class for colour-coding. */
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
  const [graphLoading, setGraphLoading] = useState(!graph);

  useEffect(() => {
    fetch(`/api/releases/${releaseId}/`)
      .then((res) => res.json())
      .then((data) => {
        const found = (data.packages_list ?? []).find(
          (p: PackageInfo) => p.name === packageName,
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
      `/api/releases/${releaseId}/packages/${packageName}/issue`,
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
      `/api/releases/${releaseId}/packages/${packageName}/opam`,
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
      setGraphLoading(false);
      return;
    }
    setGraphLoading(true);
    fetchGraph(releaseId)
      .then((g) => {
        setGraph(g);
        setGraphLoading(false);
      })
      .catch(() => setGraphLoading(false));
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
                <a
                  href={pkg.repo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {pkg.repo_url.replace("https://github.com/", "")}
                </a>
              ) : opam?.homepage ? (
                <a
                  href={opam.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {opam.homepage.replace("https://github.com/", "")}
                </a>
              ) : (
                "—"
              )}
            </strong>
          </div>
        </div>
      </section>

      {/* Full dependency graph */}
      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-header">
          <h2>Dependency Graph</h2>
        </div>
        {graphLoading ? (
          <p className="dep-empty">Loading dependency graph...</p>
        ) : graph ? (
          <DependencyDAG
            graph={graph}
            highlighted={pkg.name}
            releaseId={releaseId!}
          />
        ) : (
          <p className="dep-empty">Failed to load dependency graph.</p>
        )}
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
                  <span
                    className={`pill ${issue.state === "open" ? "waiting" : "ready"}`}
                  >
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
