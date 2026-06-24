// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Top navigation bar with release selector and settings. */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, LogOut, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

type ReleaseOption = {
  id: string;
  name: string;
};

export default function TopBar({ releaseId }: { releaseId: string }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(apiUrl("/api/releases/"), { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setReleases(data.releases ?? data))
      .catch((err) => console.error("Failed to fetch releases", err));
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    navigate("/");
    await logout();
  };

  return (
    <header className="topbar">
      <select
        className="selector release-select"
        value={releaseId}
        onChange={(event) => navigate(`/app/releases/${event.target.value}`)}
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

      <div className="topbar-menu" ref={menuRef}>
        <button
          className="topbar-menu-trigger"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="User menu"
        >
          <Settings size={18} />
        </button>

        {menuOpen && (
          <div className="topbar-dropdown">
            {user && (
              <div className="topbar-dropdown-user">
                <User size={14} />
                <span>{user.username}</span>
                <span className="topbar-dropdown-role">{user.role}</span>
              </div>
            )}
            <button className="topbar-dropdown-item" onClick={handleLogout}>
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
