// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Top navigation bar with release selector and settings. */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, LogOut, User, Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import CreateDraftReleaseModal from "./CreateDraftReleaseModal";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

type ReleaseOption = {
  id: string;
  name: string;
};

type TopBarProps = {
  releaseId: string;
  rocqVersion?: string;
  status?: string;
};

export default function TopBar({ releaseId, rocqVersion, status }: TopBarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(apiUrl("/api/releases/"), { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        const releasesList = data.releases ?? data;
        setReleases(Array.isArray(releasesList) ? releasesList : []);
      })
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

  // Close actions menu on outside click
  useEffect(() => {
    if (!actionsOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [actionsOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    navigate("/");
    await logout();
  };

  const handleCreateDraftRelease = () => {
    setActionsOpen(false);
    setCreateModalOpen(true);
  };

  const handleReleaseCreated = (releaseId: string) => {
    // Refresh releases list and navigate to new release
    fetch(apiUrl("/api/releases/"), { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        const releasesList = data.releases ?? data;
        setReleases(Array.isArray(releasesList) ? releasesList : []);
      })
      .catch((err) => console.error("Failed to fetch releases", err));

    navigate(`/app/releases/${releaseId}`);
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

      {rocqVersion && <div className="selector">{rocqVersion}</div>}

      <span className={`status-badge${status === "released" ? " released" : ""}`}>
        {status === "in_progress" ? "IN PROGRESS" : status === "released" ? "RELEASED" : ""}
      </span>

      <div className="topbar-spacer" />

      {/* Admin Actions Menu */}
      {user?.role === "admin" && (
        <div className="topbar-menu" ref={actionsRef}>
          <button
            className="topbar-menu-trigger"
            onClick={() => setActionsOpen((v) => !v)}
            aria-label="Actions menu"
            title="Admin actions"
          >
            <Plus size={18} />
          </button>

          {actionsOpen && (
            <div className="topbar-dropdown">
              <button
                className="topbar-dropdown-item"
                onClick={handleCreateDraftRelease}
              >
                <Plus size={14} />
                Create Draft Release
              </button>
            </div>
          )}
        </div>
      )}

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

      <CreateDraftReleaseModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={handleReleaseCreated}
      />
    </header>
  );
}
