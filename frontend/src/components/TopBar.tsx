import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Settings } from "lucide-react";

type ReleaseOption = {
  id: string;
  name: string;
};

export default function TopBar({ releaseId }: { releaseId: string }) {
  const navigate = useNavigate();
  const [releases, setReleases] = useState<ReleaseOption[]>([]);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/releases")
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

      <div className="search">
        <Search size={16} />
        <input placeholder="Search packages..." />
      </div>

      <Settings size={18} />
    </header>
  );
}
