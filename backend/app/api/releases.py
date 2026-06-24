# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""REST API routes for release management and package details."""

import asyncio
import re

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import get_current_user
from app.services.github_service import GithubService
from app.services.kpi_service import KpiService
from app.services.release_cache_service import (
    OWNER,
    REPO,
    get_cached_release,
    get_cached_releases,
    refresh_release,
    refresh_zone_header,
    refresh_zone_timeline,
    refresh_zone_packages,
    refresh_zone_activity,
    get_cached_dep_graph,
    refresh_dep_graph,
    _get_release_params,
)

router = APIRouter()
github = GithubService()
kpi_service = KpiService(github)

# Prevent concurrent refresh operations from overwhelming the system
_zone_refresh_lock = asyncio.Lock()


@router.get("/")
async def get_releases(user: dict = Depends(get_current_user)):
    result = await get_cached_releases(github)
    return result


@router.get("/{release_id}")
async def get_release(release_id: str, user: dict = Depends(get_current_user)):
    data = await get_cached_release(release_id, github, kpi_service)
    if data is None:
        raise HTTPException(status_code=404, detail="Release not found")
    return data


@router.post("/{release_id}/refresh")
async def post_refresh_release(release_id: str, user: dict = Depends(get_current_user)):
    data = await refresh_release(release_id, github, kpi_service)
    if data is None:
        raise HTTPException(status_code=404, detail="Release not found")
    return data


@router.post("/{release_id}/refresh/header")
async def post_refresh_header(release_id: str, user: dict = Depends(get_current_user)):
    async with _zone_refresh_lock:
        return await refresh_zone_header(release_id, github, kpi_service)


@router.post("/{release_id}/refresh/timeline")
async def post_refresh_timeline(release_id: str, user: dict = Depends(get_current_user)):
    async with _zone_refresh_lock:
        return await refresh_zone_timeline(release_id, github, kpi_service)


@router.post("/{release_id}/refresh/packages")
async def post_refresh_packages(release_id: str, user: dict = Depends(get_current_user)):
    async with _zone_refresh_lock:
        return await refresh_zone_packages(release_id, github, kpi_service)


@router.post("/{release_id}/refresh/activity")
async def post_refresh_activity(release_id: str, user: dict = Depends(get_current_user)):
    async with _zone_refresh_lock:
        return await refresh_zone_activity(release_id, github, kpi_service)


@router.get("/{release_id}/dependency-graph")
async def get_dependency_graph(release_id: str, user: dict = Depends(get_current_user)):
    """Full dependency DAG for the release (cached)."""
    try:
        graph = await get_cached_dep_graph(release_id, github, kpi_service)
    except ValueError:
        raise HTTPException(status_code=404, detail="Release not found")
    return graph


@router.post("/{release_id}/refresh/dependency-graph")
async def post_refresh_dependency_graph(release_id: str, user: dict = Depends(get_current_user)):
    """Force-refresh the dependency graph cache."""
    try:
        graph = await refresh_dep_graph(release_id, github, kpi_service)
    except ValueError:
        raise HTTPException(status_code=404, detail="Release not found")
    return graph


@router.get("/{release_id}/package-pick")
async def get_package_pick(release_id: str, user: dict = Depends(get_current_user)):
    """Return the raw content of the package-pick shell script."""
    try:
        package_pick_name, _, _ = await _get_release_params(release_id, github)
    except ValueError:
        raise HTTPException(status_code=404, detail="Release not found")

    filename = f"{package_pick_name}.sh"
    content = await github.get_file_content(OWNER, REPO, f"package_picks/{filename}")
    return {"filename": filename, "content": content}


@router.get("/{release_id}/packages/{package_name}/issue")
async def get_package_issue(release_id: str, package_name: str, user: dict = Depends(get_current_user)):
    """Fetch issue details for a specific package from its issue_url."""
    data = await get_cached_release(release_id, github, kpi_service)
    if data is None:
        raise HTTPException(status_code=404, detail="Release not found")

    pkg = next(
        (p for p in data.get("packages_list", []) if p["name"] == package_name),
        None,
    )
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")

    issue_url = pkg.get("issue_url")
    if not issue_url:
        return None

    # Parse owner/repo/number from GitHub URL
    match = re.search(r"github\.com/([^/]+)/([^/]+)/issues/(\d+)", issue_url)
    if not match:
        return None

    owner, repo_name, number = match.group(1), match.group(2), int(match.group(3))
    details = await github.get_issue_details(owner, repo_name, number)
    return details


@router.get("/{release_id}/packages/{package_name}/opam")
async def get_package_opam_info(release_id: str, package_name: str, user: dict = Depends(get_current_user)):
    """Fetch opam metadata for a package via ``opam show``."""
    data = await kpi_service.run_opam_show(package_name)
    if not data:
        raise HTTPException(status_code=404, detail="Package not found in opam")
    return data
