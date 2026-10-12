# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""Public endpoints accessible without authentication."""

import asyncio
import logging

from fastapi import APIRouter

from app.services.github_service import GithubService
from app.services.release_cache_service import peek_cached_release

logger = logging.getLogger(__name__)

router = APIRouter()

github = GithubService()

# Repositories whose latest release is shown on the landing page.
_RELEASE_REPOS = [
    {"key": "rocq_prover", "owner": "rocq-prover", "repo": "rocq", "label": "Rocq Prover"},
    {"key": "rocq_platform", "owner": "rocq-prover", "repo": "platform", "label": "Rocq Platform"},
    {
        "key": "rocq_platform_starter",
        "owner": "rocq-prover",
        "repo": "rocq-platform-starter",
        "label": "Rocq Platform Starter",
    },
]


@router.get("/release-status")
async def get_release_status():
    """Return a simplified summary of the in-progress release (no auth required).

    Reads the cache only. When it is cold the counters come back at zero until
    the startup warm-up or the nightly refresh fills it in.
    """
    data = await peek_cached_release("in-progress")
    if data is None:
        return {"name": None, "total": 0, "ready": 0, "progress": 0}

    summary = data.get("summary", {})
    total = summary.get("packages", 0)
    ready = summary.get("ready", 0)
    progress = round((ready / total) * 100, 1) if total > 0 else 0

    return {
        "name": data.get("name") or data.get("description"),
        "total": total,
        "ready": ready,
        "progress": progress,
    }


async def _latest_release(owner: str, repo: str) -> dict | None:
    """Return the latest non-draft, non-prerelease GitHub release, or None."""
    try:
        releases = await github.get_releases(owner, repo)
        for rel in releases:
            if not rel.get("draft") and not rel.get("prerelease"):
                return rel
        # Fall back to the first release if all are pre-releases/drafts
        return releases[0] if releases else None
    except Exception:
        logger.warning("Failed to fetch releases for %s/%s", owner, repo, exc_info=True)
        return None


@router.get("/latest-releases")
async def get_latest_releases():
    """Return the latest published release for each tracked repository."""
    results = await asyncio.gather(
        *[_latest_release(r["owner"], r["repo"]) for r in _RELEASE_REPOS]
    )

    releases = {}
    for repo_info, rel in zip(_RELEASE_REPOS, results):
        if rel:
            releases[repo_info["key"]] = {
                "label": repo_info["label"],
                "tag": rel.get("tag_name", ""),
                "name": rel.get("name") or rel.get("tag_name", ""),
                "url": rel.get("html_url", ""),
            }
        else:
            releases[repo_info["key"]] = None

    return releases
