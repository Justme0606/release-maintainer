// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Release Board — kanban view of packages grouped by status. */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ExternalLink, MessageSquare } from "lucide-react";
import { useRelease } from "../context/ReleaseContext";

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

type Column = "ready" | "waiting" | "blocked" | "disabled";

const COLUMNS: { key: Column; label: string; color: string }[] = [
  { key: "ready", label: "Ready", color: "#22c55e" },
  { key: "waiting", label: "Waiting", color: "#f59e0b" },
  { key: "blocked", label: "Blocked", color: "#ef4444" },
  { key: "disabled", label: "Disabled", color: "#64748b" },
];

export default function ReleaseBoardPage() {
  const navigate = useNavigate();
  const { fetchRelease } = useRelease();
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [releaseName, setReleaseName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<Set<Column>>(
    new Set(["ready", "waiting", "blocked", "disabled"]),
  );

  useEffect(() => {
    fetchRelease("in-progress")
      .then((data) => {
        setPackages(data.packages_list ?? []);
        setReleaseId(data.id ?? data.release_id ?? null);
        setReleaseName(data.description ?? data.name ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = packages.filter(
    (p) => !search || p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const grouped: Record<Column, PackageInfo[]> = {
    ready: [],
    waiting: [],
    blocked: [],
    disabled: [],
  };

  for (const pkg of filtered) {
    if (pkg.disabled) {
      grouped.disabled.push(pkg);
    } else if (pkg.status === "ready") {
      grouped.ready.push(pkg);
    } else if (pkg.status === "waiting") {
      grouped.waiting.push(pkg);
    } else if (pkg.status === "blocked") {
      grouped.blocked.push(pkg);
    } else {
      grouped.blocked.push(pkg);
    }
  }

  const totalShown = filtered.length;

  const toggleColumn = (col: Column) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) {
        next.delete(col);
      } else {
        next.add(col);
      }
      return next;
    });
  };

  const showAll = () => {
    setVisibleColumns(new Set(["ready", "waiting", "blocked", "disabled"]));
  };

  const allVisible = visibleColumns.size === 4;

  return (
    <div className="release-board-page">
      <header className="topbar">
        <h1 style={{ margin: 0, fontSize: 24 }}>
          Release Board
          {releaseName && (
            <span
              style={{
                color: "#94a3b8",
                fontWeight: 400,
                marginLeft: 10,
                fontSize: 18,
              }}
            >
              {releaseName}
            </span>
          )}
        </h1>
        <div className="topbar-spacer" />
        <span style={{ color: "#94a3b8", fontSize: 14 }}>
          {totalShown} package{totalShown !== 1 ? "s" : ""}
        </span>
      </header>

      <div className="board-toolbar">
        <div className="search board-search">
          <Search size={14} />
          <input
            placeholder="Search packages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filters">
          <button className={allVisible ? "active" : ""} onClick={showAll}>
            All
          </button>
          {COLUMNS.map((col) => (
            <button
              key={col.key}
              className={
                visibleColumns.has(col.key) && !allVisible ? "active" : ""
              }
              onClick={() => toggleColumn(col.key)}
            >
              {col.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p style={{ color: "#94a3b8" }}>Loading...</p>}

      {!loading && (
        <div className="kanban-container">
          {COLUMNS.filter((col) => visibleColumns.has(col.key)).map((col) => (
            <div className="kanban-column" key={col.key}>
              <div
                className="kanban-column-header"
                style={{ borderTopColor: col.color }}
              >
                <span className="kanban-column-title">{col.label}</span>
                <span
                  className="kanban-column-count"
                  style={{ background: col.color + "28", color: col.color }}
                >
                  {grouped[col.key].length}
                </span>
              </div>

              <div className="kanban-column-body">
                {grouped[col.key].map((pkg) => (
                  <div
                    key={pkg.name}
                    className="kanban-card"
                    onClick={() =>
                      releaseId
                        ? navigate(
                            `/app/releases/${releaseId}/packages/${pkg.name}`,
                          )
                        : undefined
                    }
                  >
                    <div className="kanban-card-top">
                      <strong className="kanban-card-name">{pkg.name}</strong>
                      <span
                        className={`pill ${pkg.disabled ? "disabled" : pkg.status}`}
                      >
                        {pkg.disabled ? "disabled" : pkg.status}
                      </span>
                    </div>

                    {pkg.disabled && pkg.disabled_reason && (
                      <small className="kanban-card-reason">
                        {pkg.disabled_reason}
                      </small>
                    )}

                    <div className="kanban-card-fields">
                      <div>
                        <span>Pick</span>
                        <strong>{pkg.pick_version}</strong>
                      </div>
                      <div>
                        <span>Opam</span>
                        <strong>{pkg.opam_version ?? "—"}</strong>
                      </div>
                      <div>
                        <span>Tag</span>
                        <strong>{pkg.git_tag ?? "—"}</strong>
                      </div>
                    </div>

                    <div className="kanban-card-links">
                      {pkg.issue_url && (
                        <a
                          href={pkg.issue_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open issue"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MessageSquare size={14} />
                        </a>
                      )}
                      {pkg.repo_url && (
                        <a
                          href={pkg.repo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open repository"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}

                {grouped[col.key].length === 0 && (
                  <p className="kanban-empty">No packages</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
