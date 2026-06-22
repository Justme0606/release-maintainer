// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Top navigation bar with release selector and settings. */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

type ReleaseOption = {
  id: string;
  name: string;
};

export default function TopBar({ releaseId }: { releaseId: string }) {
  const navigate = useNavigate();
  const [releases, setReleases] = useState<ReleaseOption[]>([]);

  useEffect(() => {
    fetch(apiUrl("/api/releases/"))
      .then((res) => res.json())
      .then((data) => setReleases(data.releases ?? data))
      .catch((err) => console.error("Failed to fetch releases", err));
  }, []);

  return (
    <header className="topbar">
      <select
        className="selector release-select"
        value={releaseId}
        onChange={(event) => navigate(`/releases/${event.target.value}`)}
      >
        {releases.map((release) => (
          <option key={release.id} value={release.id}>
            {release.name}
          </option>
        ))}
      </select>

      <div className="selector">Rocq 9.1.0</div>

      <span className="status-badge">IN PROGRESS</span>

      <div className="topbar-spacer" />

      <Settings size={18} />
    </header>
  );
}
