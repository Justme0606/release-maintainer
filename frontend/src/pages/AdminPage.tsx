// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Admin page for managing users and releases. */

import { useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

interface UserInfo {
  username: string;
  role: string;
}

interface ReleaseInfo {
  id: string;
  name?: string;
  description?: string;
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [releases, setReleases] = useState<ReleaseInfo[]>([]);

  useEffect(() => {
    fetch(apiUrl("/api/admin/users"), { credentials: "include" })
      .then((res) => res.json())
      .then(setUsers)
      .catch(() => {});

    fetch(apiUrl("/api/releases/"), { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setReleases(data.releases ?? data))
      .catch(() => {});
  }, []);

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Administration</h1>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-header">
          <h2>Users</h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.username}>
                  <td>
                    <strong>{u.username}</strong>
                  </td>
                  <td>
                    <span className={`pill ${u.role === "admin" ? "ready" : ""}`}>
                      {u.role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Releases</h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.id}</strong>
                  </td>
                  <td>{r.name ?? "—"}</td>
                  <td>{r.description ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
