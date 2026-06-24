# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""Public endpoints accessible without authentication."""

from fastapi import APIRouter

from app.services.github_service import GithubService
from app.services.kpi_service import KpiService
from app.services.release_cache_service import get_cached_release

router = APIRouter()

github = GithubService()
kpi_service = KpiService(github)


@router.get("/release-status")
async def get_release_status():
    """Return a simplified summary of the in-progress release (no auth required)."""
    data = await get_cached_release("in-progress", github, kpi_service)
    if data is None:
        return {"name": None, "total": 0, "ready": 0, "progress": 0}

    summary = data.get("summary", {})
    total = summary.get("total_packages", 0)
    ready = summary.get("ready", 0)
    progress = round((ready / total) * 100, 1) if total > 0 else 0

    return {
        "name": data.get("name") or data.get("description"),
        "total": total,
        "ready": ready,
        "progress": progress,
    }
