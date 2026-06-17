// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Filterable and searchable package status table. */

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Search } from "lucide-react";

interface PackageInfo {
  name: string;
  pick_version: string;
  opam_version: string | null;
  git_tag: string | null;
  issue_url: string | null;
  status: "ready" | "waiting" | "blocked" | "unknown";
  disabled?: boolean;
  disabled_reason?: string | null;
}

interface PackageTableProps {
  packages: PackageInfo[];
}

/** Number of packages displayed per page. */
const PAGE_SIZE = 20;

type Filter = "all" | "ready" | "waiting" | "blocked" | "unknown" | "disabled";

/** Available filter buttons shown above the table. */
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "waiting", label: "Waiting" },
  { value: "blocked", label: "Blocked" },
  { value: "disabled", label: "Disabled" },
  { value: "unknown", label: "Unknown" },
];

export default function PackageTable({ packages }: PackageTableProps) {
  const navigate = useNavigate();
  const { releaseId } = useParams();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const filtered = packages.filter((p) => {
    if (filter === "disabled") {
      if (!p.disabled) return false;
    } else if (filter !== "all") {
      if (p.status !== filter) return false;
    }
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const pagePackages = filtered.slice(start, start + PAGE_SIZE);

  const handleFilter = (f: Filter) => {
    setFilter(f);
    setPage(0);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  return (
    <section className="panel package-table-panel">
      <div className="panel-header">
        <h2>Packages ({filtered.length}{filter !== "all" ? ` / ${packages.length}` : ""})</h2>

        <div className="filters">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={filter === f.value ? "active" : ""}
              onClick={() => handleFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
          <div className="search package-search">
            <Search size={14} />
            <input
              placeholder="Search packages..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Package</th>
              <th>Pick Version</th>
              <th>OPAM Version</th>
              <th>Git Tag</th>
              <th>Issue</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {pagePackages.map((pkg) => (
              <tr
                className={`clickable-row${pkg.disabled ? " disabled-row" : ""}`}
                key={pkg.name}
                onClick={() =>
                  navigate(`/releases/${releaseId}/packages/${pkg.name}`)
                }
              >
                <td>
                  <strong>{pkg.name}</strong>
                  {pkg.disabled && pkg.disabled_reason && (
                    <small className="disabled-reason">{pkg.disabled_reason}</small>
                  )}
                </td>
                <td>{pkg.pick_version}</td>
                <td>{pkg.opam_version ?? "—"}</td>
                <td>{pkg.git_tag ?? "—"}</td>
                <td>
                  {pkg.issue_url ? (
                    <a
                      href={pkg.issue_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="linkish"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Issue
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {pkg.disabled ? (
                    <span className="pill disabled">disabled</span>
                  ) : (
                    <span className={`pill ${pkg.status}`}>{pkg.status}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            disabled={safePage === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Prev
          </button>
          <span>
            {safePage + 1} / {totalPages}
          </span>
          <button
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </section>
  );
}
