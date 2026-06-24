// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Help & Support page with FAQ, glossary, workflow, links, and system info. */

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  HelpCircle,
  BookOpen,
  ExternalLink,
  GitBranch,
  Server,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

type FaqItem = { question: string; answer: string };
type GlossaryItem = { term: string; description: string; status: string };
type WorkflowStep = { step: number; title: string; description: string };
type LinkItem = { label: string; url: string; description: string };

type HelpContent = {
  faq: FaqItem[];
  glossary: GlossaryItem[];
  workflow: WorkflowStep[];
  links: LinkItem[];
};

type SystemInfo = {
  app_name: string;
  version: string;
  services: {
    mongodb: { status: string };
    redis: { status: string };
  };
};

export default function HelpPage() {
  const [content, setContent] = useState<HelpContent | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [openFaq, setOpenFaq] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch(apiUrl("/api/help/"), { credentials: "include" })
      .then((res) => res.json())
      .then(setContent)
      .catch((err) => console.error("Failed to fetch help content", err));
  }, []);

  useEffect(() => {
    fetch(apiUrl("/api/help/system-info"), { credentials: "include" })
      .then((res) => res.json())
      .then(setSystemInfo)
      .catch((err) => console.error("Failed to fetch system info", err));
  }, []);

  const toggleFaq = (index: number) => {
    setOpenFaq((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="help-layout">
      <header className="topbar">
        <HelpCircle size={22} />
        <h1 style={{ margin: 0, fontSize: 22 }}>Help & Support</h1>
      </header>

      {/* FAQ */}
      <section className="panel">
        <div className="panel-header">
          <h2>
            <HelpCircle size={18} style={{ marginRight: 8, verticalAlign: -3 }} />
            Frequently Asked Questions
          </h2>
        </div>
        <div className="faq-list">
          {content?.faq.map((item, i) => (
            <div key={i} className="faq-item">
              <button className="faq-toggle" onClick={() => toggleFaq(i)}>
                {openFaq.has(i) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>{item.question}</span>
              </button>
              {openFaq.has(i) && (
                <div className="faq-answer">
                  <ReactMarkdown>{item.answer}</ReactMarkdown>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Glossary */}
      <section className="panel">
        <div className="panel-header">
          <h2>
            <BookOpen size={18} style={{ marginRight: 8, verticalAlign: -3 }} />
            Status Glossary
          </h2>
        </div>
        <div className="glossary-grid">
          {content?.glossary.map((item) => (
            <div key={item.term} className="glossary-item">
              <span className={`pill ${item.status}`}>{item.term}</span>
              <p>{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section className="panel">
        <div className="panel-header">
          <h2>
            <GitBranch size={18} style={{ marginRight: 8, verticalAlign: -3 }} />
            Release Workflow
          </h2>
        </div>
        <div className="workflow-steps">
          {content?.workflow.map((step) => (
            <div key={step.step} className="workflow-step">
              <div className="workflow-step-number">{step.step}</div>
              <div>
                <strong>{step.title}</strong>
                <span>{step.description}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Links */}
      <section className="panel">
        <div className="panel-header">
          <h2>
            <ExternalLink size={18} style={{ marginRight: 8, verticalAlign: -3 }} />
            Resources & Links
          </h2>
        </div>
        <div className="links-grid">
          {content?.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="link-card"
            >
              <strong>{link.label}</strong>
              <span>{link.description}</span>
              <ExternalLink size={14} />
            </a>
          ))}
        </div>
      </section>

      {/* System Info */}
      <section className="panel">
        <div className="panel-header">
          <h2>
            <Server size={18} style={{ marginRight: 8, verticalAlign: -3 }} />
            System Information
          </h2>
        </div>
        {systemInfo ? (
          <div className="system-info-grid">
            <div className="detail-info">
              <span>Application</span>
              <strong>{systemInfo.app_name}</strong>
            </div>
            <div className="detail-info">
              <span>Version</span>
              <strong>{systemInfo.version}</strong>
            </div>
            <div className="detail-info">
              <span>MongoDB</span>
              <strong>
                {systemInfo.services.mongodb.status === "connected" ? (
                  <span className="success-text">
                    <CheckCircle2 size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                    Connected
                  </span>
                ) : (
                  <span style={{ color: "#fca5a5" }}>
                    <XCircle size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                    Disconnected
                  </span>
                )}
              </strong>
            </div>
            <div className="detail-info">
              <span>Redis</span>
              <strong>
                {systemInfo.services.redis.status === "connected" ? (
                  <span className="success-text">
                    <CheckCircle2 size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                    Connected
                  </span>
                ) : (
                  <span style={{ color: "#fca5a5" }}>
                    <XCircle size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                    Disconnected
                  </span>
                )}
              </strong>
            </div>
          </div>
        ) : (
          <p style={{ color: "#94a3b8" }}>Loading system information...</p>
        )}
      </section>
    </div>
  );
}
