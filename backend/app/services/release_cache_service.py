# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""Cached release data aggregation and background refresh service."""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from app.db.redis import redis_client
from app.services.github_service import GithubService
from app.services.kpi_service import KpiService

logger = logging.getLogger(__name__)

# Target GitHub repository for the Rocq Platform
OWNER = "rocq-prover"
REPO = "platform"

# Concurrency guard: prevents overlapping cache-clear + refresh cycles
_refresh_lock = asyncio.Lock()
_last_cache_clear: float = 0.0
_CACHE_CLEAR_COOLDOWN = 5.0  # seconds between consecutive cache clears


# ------------------------------------------------------------------
#  Redis key helpers
# ------------------------------------------------------------------

def _release_key(release_id: str) -> str:
    """Redis key storing the full JSON payload of a release."""
    return f"release_data:{release_id}"


def _refreshed_at_key(release_id: str) -> str:
    """Redis key storing the ISO timestamp of the last refresh."""
    return f"release_data:{release_id}:refreshed_at"


# ------------------------------------------------------------------
#  Release data computation (fetched from GitHub, not cached)
# ------------------------------------------------------------------

async def _compute_releases(github: GithubService) -> dict:
    """Build the list of all releases (published + the in-progress one)."""
    releases = await github.get_releases(owner=OWNER, repo=REPO)

    published_releases = [
        {
            "id": release["tag_name"],
            "name": release["tag_name"],
            "description": release["name"],
            "published_at": release["published_at"],
            "draft": release["draft"],
            "prerelease": release["prerelease"],
            "status": "released",
        }
        for release in releases
    ]

    # The in-progress release is always shown first
    return [
        {
            "id": "in-progress",
            "name": "In Progress Release",
            "description": "Release cycle in progress targeting Rocq 9.1.0",
            "published_at": None,
            "draft": False,
            "prerelease": True,
            "status": "in_progress",
        },
        *published_releases,
    ]


async def _compute_release(
    release_id: str, github: GithubService, kpi_service: KpiService
) -> dict:
    """Compute the full payload for a single release (in-progress or published)."""
    repo = await github.get_repo(owner=OWNER, repo=REPO)

    if release_id == "in-progress":
        # Hard-coded parameters for the current release cycle
        package_pick_name = "package-pick-9.1~2026.01"
        release_version = "Rocq 9.1"
        branch = repo["default_branch"]

        summary = await kpi_service.compute_summary(
            package_pick_name, release_version, branch
        )

        return {
            "id": "in-progress",
            "name": "2026.01",
            "description": "Release cycle in progress targeting Rocq 9.1.0",
            "published_at": None,
            "draft": False,
            "prerelease": True,
            "status": "in_progress",
            "platform": {
                "version": "2026.01",
                "status": "in_progress",
                "package_pick": package_pick_name,
                "repository": repo["full_name"],
                "default_branch": branch,
                "open_issues": summary["open_issues"],
                "open_pull_requests": summary["open_pull_requests"],
            },
            "rocq": {
                "version": "9.1.0",
            },
            "summary": {
                "packages": summary["packages"],
                "ready": summary["ready"],
                "waiting": summary["waiting"],
                "blocked": summary["blocked"],
                "disabled": summary["disabled"],
            },
            "ci_status": summary["ci_status"],
            "issues_by_state": summary["issues_by_state"],
            "builds_summary": summary["builds_summary"],
            "timeline": summary["timeline"],
            "packages_list": summary["packages_list"],
            "recent_activity": summary["recent_activity"],
        }

    # For published releases, look them up by tag name
    releases = await github.get_releases(owner=OWNER, repo=REPO)
    release = next(
        (r for r in releases if r["tag_name"] == release_id),
        None,
    )

    if release is None:
        return None

    return {
        "id": release["tag_name"],
        "name": release["tag_name"],
        "description": release["name"],
        "published_at": release["published_at"],
        "draft": release["draft"],
        "prerelease": release["prerelease"],
        "status": "released",
        "platform": {
            "version": release["tag_name"],
            "status": "released",
            "package_pick": None,
            "repository": repo["full_name"],
            "default_branch": repo["default_branch"],
            "open_issues": summary["open_issues"],
        },
        "rocq": {
            "version": "unknown",
        },
        "summary": {
            "packages": 0,
            "ready": 0,
            "waiting": 0,
            "blocked": 0,
        },
    }


# ------------------------------------------------------------------
#  GitHub cache invalidation
# ------------------------------------------------------------------

async def _clear_github_cache():
    """Delete all ``github:*`` Redis keys so the next computation fetches fresh data.

    Uses a cooldown to avoid redundant work when multiple zones refresh together.
    """
    global _last_cache_clear
    now = time.monotonic()
    if now - _last_cache_clear < _CACHE_CLEAR_COOLDOWN:
        return
    _last_cache_clear = now

    # Scan and delete in batches to avoid blocking Redis
    cursor = 0
    while True:
        cursor, keys = await redis_client.scan(
            cursor=cursor, match="github:*", count=100
        )
        if keys:
            await redis_client.delete(*keys)
        if cursor == 0:
            break


# ------------------------------------------------------------------
#  Cache read / write for release list and individual releases
# ------------------------------------------------------------------

async def get_cached_releases(github: GithubService) -> dict:
    """Return the cached release list, or compute and cache it on miss."""
    key = _release_key("list")
    at_key = _refreshed_at_key("list")

    cached = await redis_client.get(key)
    if cached:
        refreshed_at = await redis_client.get(at_key)
        data = json.loads(cached)
        return {"releases": data, "last_refreshed_at": refreshed_at}

    return await refresh_releases(github)


async def refresh_releases(github: GithubService) -> dict:
    """Force-refresh the cached release list."""
    key = _release_key("list")
    at_key = _refreshed_at_key("list")

    data = await _compute_releases(github)
    now = datetime.now(timezone.utc).isoformat()

    await redis_client.set(key, json.dumps(data))
    await redis_client.set(at_key, now)

    return {"releases": data, "last_refreshed_at": now}


async def get_cached_release(
    release_id: str, github: GithubService, kpi_service: KpiService
) -> dict:
    """Return the cached release data, or compute and cache it on miss."""
    key = _release_key(release_id)
    at_key = _refreshed_at_key(release_id)

    cached = await redis_client.get(key)
    if cached:
        refreshed_at = await redis_client.get(at_key)
        data = json.loads(cached)
        data["last_refreshed_at"] = refreshed_at
        return data

    return await refresh_release(release_id, github, kpi_service)


async def refresh_release(
    release_id: str, github: GithubService, kpi_service: KpiService
) -> dict | None:
    """Invalidate the GitHub cache and recompute the full release payload."""
    key = _release_key(release_id)
    at_key = _refreshed_at_key(release_id)

    await _clear_github_cache()

    data = await _compute_release(release_id, github, kpi_service)
    if data is None:
        return None

    now = datetime.now(timezone.utc).isoformat()
    await redis_client.set(key, json.dumps(data))
    await redis_client.set(at_key, now)

    data["last_refreshed_at"] = now
    logger.info("Refreshed release data for %s", release_id)
    return data


async def _get_release_params(
    release_id: str, github: GithubService
) -> tuple[str, str, str]:
    """Return ``(package_pick_name, release_version, branch)`` for a release.

    Only the in-progress release is supported for zone-level refresh.
    """
    repo = await github.get_repo(owner=OWNER, repo=REPO)
    if release_id == "in-progress":
        return "package-pick-9.1~2026.01", "Rocq 9.1", repo["default_branch"]
    raise ValueError(f"Zone refresh not supported for release {release_id}")


# ------------------------------------------------------------------
#  Zone-level partial refresh helpers
# ------------------------------------------------------------------

def _deep_merge(base: dict, patch: dict) -> dict:
    """Recursively merge *patch* into *base* (mutates *base*).

    Dict values are merged recursively; all other types are overwritten.
    """
    for key, value in patch.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value
    return base


async def _read_modify_write(release_id: str, patch: dict) -> dict:
    """Read the cached release data, deep-merge *patch* into it and write back.

    This allows refreshing individual dashboard zones without recomputing
    the entire release payload.
    """
    key = _release_key(release_id)
    at_key = _refreshed_at_key(release_id)
    cached = await redis_client.get(key)
    data = json.loads(cached) if cached else {}
    _deep_merge(data, patch)
    now = datetime.now(timezone.utc).isoformat()
    await redis_client.set(key, json.dumps(data))
    await redis_client.set(at_key, now)
    return patch


async def refresh_zone_header(
    release_id: str, github: GithubService, kpi_service: KpiService
) -> dict:
    """Refresh only the header zone (summary counts, CI, open issues/PRs)."""
    await _clear_github_cache()
    package_pick_name, release_version, branch = await _get_release_params(
        release_id, github
    )
    header = await kpi_service.compute_header(
        package_pick_name, release_version, branch
    )
    patch = {
        "summary": {
            "ready": header["ready"],
            "waiting": header["waiting"],
            "blocked": header["blocked"],
            "disabled": header["disabled"],
        },
        "ci_status": header["ci_status"],
        "issues_by_state": header["issues_by_state"],
        "builds_summary": header["builds_summary"],
        "platform": {
            "open_issues": header["open_issues"],
            "open_pull_requests": header["open_pull_requests"],
        },
    }
    await _read_modify_write(release_id, patch)
    return patch


async def refresh_zone_timeline(
    release_id: str, github: GithubService, kpi_service: KpiService
) -> dict:
    """Refresh only the timeline zone (milestone dates and states)."""
    await _clear_github_cache()
    timeline = await kpi_service.compute_timeline()
    patch = {"timeline": timeline}
    await _read_modify_write(release_id, patch)
    return patch


async def refresh_zone_packages(
    release_id: str, github: GithubService, kpi_service: KpiService
) -> dict:
    """Refresh only the packages zone (package list and total count)."""
    await _clear_github_cache()
    package_pick_name, release_version, _ = await _get_release_params(
        release_id, github
    )
    pkg_data = await kpi_service.compute_packages(
        package_pick_name, release_version
    )
    patch = {
        "packages_list": pkg_data["packages_list"],
        "summary": {"packages": pkg_data["packages"]},
    }
    await _read_modify_write(release_id, patch)
    return patch


async def refresh_zone_activity(
    release_id: str, github: GithubService, kpi_service: KpiService
) -> dict:
    """Refresh only the activity zone (recent events feed)."""
    await _clear_github_cache()
    _, _, branch = await _get_release_params(release_id, github)
    activity = await kpi_service.compute_activity(branch)
    patch = {"recent_activity": activity}
    await _read_modify_write(release_id, patch)
    return patch


# ------------------------------------------------------------------
#  Dependency graph (cached separately with a longer TTL)
# ------------------------------------------------------------------

_DEP_GRAPH_TTL = 3600  # 1 hour


def _dep_graph_key(release_id: str) -> str:
    """Redis key for the dependency graph of a release."""
    return f"dep_graph:{release_id}"


async def get_cached_dep_graph(
    release_id: str, github: GithubService, kpi_service: KpiService
) -> dict:
    """Return the cached dependency graph, or compute and cache it on miss."""
    key = _dep_graph_key(release_id)
    cached = await redis_client.get(key)
    if cached:
        return json.loads(cached)
    return await refresh_dep_graph(release_id, github, kpi_service)


async def refresh_dep_graph(
    release_id: str, github: GithubService, kpi_service: KpiService
) -> dict:
    """Force-refresh the dependency graph cache."""
    package_pick_name, release_version, _ = await _get_release_params(
        release_id, github
    )
    graph = await kpi_service.compute_dependency_graph(
        package_pick_name, release_version
    )
    key = _dep_graph_key(release_id)
    await redis_client.set(key, json.dumps(graph), ex=_DEP_GRAPH_TTL)
    return graph
