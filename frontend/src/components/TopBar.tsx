import { Search, Settings } from "lucide-react";

export default function TopBar() {
  return (
    <header className="topbar">
      <div className="selector">Release 2026.01</div>
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
