import { Outlet, NavLink } from "react-router-dom";
import { Rocket } from "lucide-react";
import { useSidebarStats } from "../context/SidebarStatsContext";

export default function AppLayout() {
  const { stats } = useSidebarStats();

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
            to="/"
            end
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Overview
          </NavLink>
          <a>
            Packages {stats && <span>{stats.packages}</span>}
          </a>
          <a>
            Issues Open {stats && <span>{stats.openIssues}</span>}
          </a>
          <a>
            CI Builds {stats && <span>{stats.ciBuilds}</span>}
          </a>
          <a>Package Pick</a>
          <a>Platforms & Tags</a>
          <a>Releases</a>
        </nav>

        <div className="sidebar-footer">
          <a>Documentation</a>
          <a>Help & Support</a>
          <small>
            Rocq Platform Console
            <br />
            v0.1.0
          </small>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
