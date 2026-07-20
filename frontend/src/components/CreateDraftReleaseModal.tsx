// Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
// SPDX-License-Identifier: MIT
/** Modal for creating a new draft release. */

import { useState, useEffect } from "react";
import { X } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

interface CreateDraftReleaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (releaseId: string) => void;
}

export default function CreateDraftReleaseModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateDraftReleaseModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [error, setError] = useState("");

  // Load template when modal opens
  useEffect(() => {
    if (isOpen) {
      // Load template
      setLoadingTemplate(true);
      fetch(apiUrl("/api/admin/releases/draft-template"), {
        credentials: "include",
      })
        .then((res) => res.json())
        .then((data) => {
          setName(data.title || "");
          setDescription(data.description || "");
        })
        .catch((err) => {
          console.error("Failed to load template", err);
          setError("Failed to load template. You can still create manually.");
        })
        .finally(() => {
          setLoadingTemplate(false);
        });
    } else {
      // Reset form when modal closes
      setName("");
      setDescription("");
      setError("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(apiUrl("/api/admin/releases"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          description,
          status: "draft",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to create release");
      }

      const data = await response.json();

      // Show success message with link to GitHub
      if (data.html_url) {
        alert(`Draft release created successfully!\n\nView on GitHub: ${data.html_url}`);
      }

      onClose();

      // Refresh the page to show the new release (if applicable)
      if (onSuccess && data.tag_name) {
        onSuccess(data.tag_name);
      } else {
        // Refresh the current page
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading && !loadingTemplate) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Draft Release</h2>
          <button
            className="modal-close"
            onClick={handleClose}
            disabled={loading}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {loadingTemplate && (
              <div className="info-message">Loading template...</div>
            )}
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="release-name">
                Release Title <span className="required">*</span>
              </label>
              <input
                id="release-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., 2026.07.0 with latest pick 9.1.0~2026.07"
                required
                disabled={loading || loadingTemplate}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="release-description">
                Description / Release Notes <span className="required">*</span>
              </label>
              <textarea
                id="release-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Release notes with changelog..."
                rows={20}
                disabled={loading || loadingTemplate}
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="button button-secondary"
              onClick={handleClose}
              disabled={loading || loadingTemplate}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={loading || loadingTemplate || !name.trim() || !description.trim()}
            >
              {loading ? "Creating..." : loadingTemplate ? "Loading..." : "Create Draft Release"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
