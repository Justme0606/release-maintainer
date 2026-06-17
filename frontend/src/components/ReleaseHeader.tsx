// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Release header banner with CI status and refresh controls. */

import { RefreshCw } from "lucide-react";

/** CI workflow run status as returned by the backend. */
type CiStatus = {
  name: string;
  status: string;
  conclusion: string | null;
  html_url?: string;
};

type ReleaseHeaderProps = {
  release: {
    id?: string;
    name?: string;
    description?: string;
    published_at?: string;
    draft?: boolean;
    prerelease?: boolean;
    status?: string;
    summary?: {
      packages: number;
      ready: number;
      waiting: number;
      blocked: number;
    };
  } | null;
  ciStatus?: CiStatus[];
  lastRefreshedAt?: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
};

/** Map a CI run to its indicator dot colour. */
function ciDot(ci: CiStatus) {
  if (ci.status !== "completed") return "#f59e0b"; // yellow — in progress
  if (ci.conclusion === "success") return "#22c55e"; // green
  return "#ef4444"; // red — failure
}

/** Map a CI run to a human-readable label. */
function ciLabel(ci: CiStatus) {
  if (ci.status !== "completed") return "In progress";
  if (ci.conclusion === "success") return "Passing";
  return "Failing";
}

export default function ReleaseHeader({
  release,
  ciStatus,
  lastRefreshedAt,
  onRefresh,
  refreshing,
}: ReleaseHeaderProps) {
  const packages = release?.summary?.packages ?? 0;
  const ready = release?.summary?.ready ?? 0;
  const progress = packages > 0 ? Math.round((ready / packages) * 100) : 0;

  return (
    <section className="release-header">
      <div>
        <h1>Release {release?.name ?? "Loading..."}</h1>

        <p>{release?.description ?? "Loading release information..."}</p>

        {release?.published_at && (
          <p>Published {new Date(release.published_at).toLocaleDateString()}</p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem" }}>
          {lastRefreshedAt && (
            <small style={{ opacity: 0.7 }}>
              Last updated: {new Date(lastRefreshedAt).toLocaleString()}
            </small>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.3rem 0.7rem",
                fontSize: "0.85rem",
                cursor: refreshing ? "not-allowed" : "pointer",
                opacity: refreshing ? 0.6 : 1,
              }}
            >
              <RefreshCw size={14} className={refreshing ? "spin" : ""} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          )}
        </div>
      </div>

      <div className="progress-block">
        <span>Overall Progress</span>
        <strong>{progress}%</strong>

        <div className="progress-bar">
          <i style={{ width: `${progress}%` }} />
        </div>

        <small>{ready} / {packages} packages ready</small>
      </div>

      <div className="next-card ci-status-card">
        <span>CI Status</span>
        {ciStatus && ciStatus.length > 0 ? (
          <ul className="ci-status-list">
            {ciStatus.map((ci) => (
              <li key={ci.name}>
                <a
                  href={ci.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ci-status-link"
                >
                  <span
                    className="ci-dot"
                    style={{ background: ciDot(ci) }}
                  />
                  <strong>{ci.name}</strong>
                  <small>{ciLabel(ci)}</small>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <small>No CI data</small>
        )}
      </div>
    </section>
  );
}
