// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Public landing page — entry point for learning Rocq and tracking releases. */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Rocket,
  ExternalLink,
  BookOpen,
  Download,
  GraduationCap,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

interface ReleaseStatus {
  name: string | null;
  total: number;
  ready: number;
  progress: number;
}

export default function LandingPage() {
  const [status, setStatus] = useState<ReleaseStatus | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/public/release-status"))
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-header-brand">
          <Rocket size={28} />
          <strong>Rocq Platform</strong>
        </div>
        <Link to="/login" className="landing-signin">
          Sign in
        </Link>
      </header>

      <section className="landing-hero">
        <h1>The Rocq Platform</h1>
        <p>
          A comprehensive distribution of the Rocq interactive theorem prover
          together with a curated set of libraries and plugins. Get started with
          formal verification, learn proof techniques, and join the community.
        </p>
      </section>

      {/* Getting Started */}
      <section className="landing-section">
        <h2>
          <Download size={20} />
          Get Started
        </h2>
        <div className="links-grid">
          <a
            href="https://rocq-prover.org/download"
            target="_blank"
            rel="noopener noreferrer"
            className="link-card"
          >
            <strong>Install Rocq</strong>
            <span>
              Download and install the Rocq Platform on Linux, macOS, or
              Windows.
            </span>
            <ExternalLink size={16} />
          </a>
          <a
            href="https://rocq-prover.org/doc"
            target="_blank"
            rel="noopener noreferrer"
            className="link-card"
          >
            <strong>Documentation</strong>
            <span>
              Reference manual, standard library documentation, and tutorials.
            </span>
            <ExternalLink size={16} />
          </a>
          <a
            href="https://github.com/rocq-prover/platform"
            target="_blank"
            rel="noopener noreferrer"
            className="link-card"
          >
            <strong>Platform Repository</strong>
            <span>
              Source repository for the Rocq Platform packaging and release
              process.
            </span>
            <ExternalLink size={16} />
          </a>
          <a
            href="https://opam.ocaml.org"
            target="_blank"
            rel="noopener noreferrer"
            className="link-card"
          >
            <strong>opam Registry</strong>
            <span>
              OCaml package registry where Rocq packages are published.
            </span>
            <ExternalLink size={16} />
          </a>
        </div>
      </section>

      {/* Learn */}
      <section className="landing-section">
        <h2>
          <GraduationCap size={20} />
          Learn Rocq
        </h2>
        <div className="links-grid">
          <a
            href="https://softwarefoundations.cis.upenn.edu/lf-current/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="link-card"
          >
            <strong>Vol. 1 — Logical Foundations</strong>
            <span>
              Functional programming, basic logic, and computer-assisted theorem
              proving. The recommended starting point.
            </span>
            <ExternalLink size={16} />
          </a>
          <a
            href="https://softwarefoundations.cis.upenn.edu/plf-current/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="link-card"
          >
            <strong>Vol. 2 — Programming Language Foundations</strong>
            <span>
              Operational semantics, Hoare logic, and static type systems.
            </span>
            <ExternalLink size={16} />
          </a>
          <a
            href="https://softwarefoundations.cis.upenn.edu/vfa-current/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="link-card"
          >
            <strong>Vol. 3 — Verified Functional Algorithms</strong>
            <span>
              Specification and mechanical verification of fundamental data
              structures.
            </span>
            <ExternalLink size={16} />
          </a>
          <a
            href="https://softwarefoundations.cis.upenn.edu/qc-current/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="link-card"
          >
            <strong>Vol. 4 — QuickChick</strong>
            <span>
              Property-based random testing combined with formal specification
              and proof.
            </span>
            <ExternalLink size={16} />
          </a>
          <a
            href="https://softwarefoundations.cis.upenn.edu/vc-current/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="link-card"
          >
            <strong>Vol. 5 — Verifiable C</strong>
            <span>
              Specifying and verifying real-world C programs using the Verified
              Software Toolchain.
            </span>
            <ExternalLink size={16} />
          </a>
          <a
            href="https://softwarefoundations.cis.upenn.edu/slf-current/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="link-card"
          >
            <strong>Vol. 6 — Separation Logic Foundations</strong>
            <span>
              Modular verification of imperative programs and building
              verification tools.
            </span>
            <ExternalLink size={16} />
          </a>
          <a
            href="https://softwarefoundations.cis.upenn.edu/secf-current/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="link-card"
          >
            <strong>Vol. 7 — Security Foundations</strong>
            <span>
              Setting rigorous security goals and developing provable
              enforcement mechanisms.
            </span>
            <ExternalLink size={16} />
          </a>
        </div>
      </section>

      {/* Community & Resources */}
      <section className="landing-section">
        <h2>
          <BookOpen size={20} />
          Community & Resources
        </h2>
        <div className="links-grid">
          <a
            href="https://rocq-prover.org"
            target="_blank"
            rel="noopener noreferrer"
            className="link-card"
          >
            <strong>Rocq Prover</strong>
            <span>Official website of the Rocq interactive theorem prover.</span>
            <ExternalLink size={16} />
          </a>
          <a
            href="https://rocq-prover.zulipchat.com"
            target="_blank"
            rel="noopener noreferrer"
            className="link-card"
          >
            <strong>Zulip Chat</strong>
            <span>
              Community chat for questions, discussions, and announcements.
            </span>
            <ExternalLink size={16} />
          </a>
          <a
            href="https://coq.discourse.group"
            target="_blank"
            rel="noopener noreferrer"
            className="link-card"
          >
            <strong>Discourse Forum</strong>
            <span>
              Discussion forum for longer questions, RFCs, and project updates.
            </span>
            <ExternalLink size={16} />
          </a>
          <a
            href="https://github.com/rocq-prover/rocq"
            target="_blank"
            rel="noopener noreferrer"
            className="link-card"
          >
            <strong>Rocq Source Code</strong>
            <span>
              Main repository for the Rocq proof assistant on GitHub.
            </span>
            <ExternalLink size={16} />
          </a>
        </div>
      </section>

      {/* Release Status */}
      {status && status.total > 0 && (
        <section className="landing-status">
          <h2>Current Release Status</h2>
          {status.name && (
            <p className="landing-status-name">{status.name}</p>
          )}
          <div className="landing-progress-bar">
            <div
              className="landing-progress-fill"
              style={{ width: `${status.progress}%` }}
            />
          </div>
          <div className="landing-progress-label">
            <span>
              {status.ready} / {status.total} packages ready
            </span>
            <span>{status.progress}%</span>
          </div>
        </section>
      )}
    </div>
  );
}
