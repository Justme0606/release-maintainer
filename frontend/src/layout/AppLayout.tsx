// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Shell layout with sidebar navigation and content outlet. */

import { Outlet, NavLink } from "react-router-dom";
import { Rocket, Shield } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function AppLayout() {
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Rocket size={28} />
          <div>
            <strong>Rocq Platform</strong>
            <span>Release Dashboard</span>
          </div>
        </div>

        <nav>
          <NavLink
            to="/app"
            end
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Overview
          </NavLink>
          <NavLink
            to="/app/release-board"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Release Board
          </NavLink>
          <a>Platforms & Tags</a>
          <a>Releases</a>
          {user?.role === "admin" && (
            <NavLink
              to="/app/admin"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <Shield size={16} style={{ marginRight: 6 }} />
              Admin
            </NavLink>
          )}
        </nav>

        <div className="sidebar-footer">
          <a>Documentation</a>
          <NavLink
            to="/app/help"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Help & Support
          </NavLink>
        </div>

        <small className="sidebar-version">
          Rocq Platform Console v0.1.0
          <br />
          rev{" "}
          <a href={__GIT_COMMIT_URL__} target="_blank" rel="noopener noreferrer">
            {__GIT_COMMIT__}
          </a>
        </small>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
