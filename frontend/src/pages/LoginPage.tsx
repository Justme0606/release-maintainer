// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Login page with username/password form. */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Rocket } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate("/app");
    } catch (err: any) {
      setError(err.message || "Invalid credentials");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={handleSubmit}>
        <div className="login-brand">
          <Rocket size={32} />
          <div>
            <strong>Rocq Platform</strong>
            <span>Release Dashboard</span>
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <label className="login-label">
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="login-label">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        <button type="submit" className="login-submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>

        <Link to="/" className="login-back">
          ← Back to home
        </Link>
      </form>
    </div>
  );
}
