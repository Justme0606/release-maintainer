# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""Cached release data aggregation and background refresh service."""

import json
import logging
import re
import time
from datetime import datetime, timezone

from app.db.redis import redis_client
from app.services.github_service import GithubService
from app.services.kpi_service import KpiService

logger = logging.getLogger(__name__)

# Target GitHub repository for the Rocq Platform
OWNER = "rocq-prover"
REPO = "platform"

_last_cache_clear: float = 0.0
_CACHE_CLEAR_COOLDOWN = 5.0  # seconds between consecutive cache clears
_CACHE_SCHEMA_VERSION = 2
_RELEASE_LIST_CACHE_TTL_SECONDS = 1800
_IN_PROGRESS_CACHE_TTL_SECONDS = 21600
# Published releases are immutable, but an unbounded entry would outlive the
# schema version that produced it. A long TTL keeps the cache self-cleaning.
_PUBLISHED_CACHE_TTL_SECONDS = 30 * 86400

_PACKAGE_PICK_FILE_RE = re.compile(
    r"^package-pick-(?P<rocq_version>\d+(?:\.\d+){1,2})"
    r"~(?P<pick_version>\d{4}\.\d{2})\.sh$"
)
_PACKAGE_PICK_REFERENCE_RE = re.compile(
    r"(?P<rocq_version>\d+(?:\.\d+){1,2})"
    r"~(?P<pick_version>\d{4}\.\d{2})"
)


# ------------------------------------------------------------------
#  Redis key helpers
# ------------------------------------------------------------------

def _release_key(release_id: str) -> str:
    """Redis key storing the full JSON payload of a release."""
    return f"release_data:v{_CACHE_SCHEMA_VERSION}:{release_id}"


def _refreshed_at_key(release_id: str) -> str:
    """Redis key storing the ISO timestamp of the last refresh."""
    return f"release_data:v{_CACHE_SCHEMA_VERSION}:{release_id}:refreshed_at"


def _cache_options(release_id: str) -> dict:
    """Redis SET options for a release entry.

    The in-progress release expires quickly so a stale cycle cannot be served
    indefinitely; published releases are immutable and keep a long TTL.
    """
    return {
        "ex": (
            _IN_PROGRESS_CACHE_TTL_SECONDS
            if release_id == "in-progress"
            else _PUBLISHED_CACHE_TTL_SECONDS
        )
    }


async def _set_preserving_ttl(release_id: str, key: str, value: str) -> None:
    """Write *value* to *key* without dropping an expiry already set on it.

    A plain ``SET`` clears the TTL, which would make a zone refresh turn the
    in-progress cache into a permanent entry that never refreshes again.
    """
    if await redis_client.exists(key):
        await redis_client.set(key, value, keepttl=True)
    else:
        await redis_client.set(key, value, **_cache_options(release_id))


# ------------------------------------------------------------------
#  Release data computation (fetched from GitHub, not cached)
# ------------------------------------------------------------------

def _normalise_rocq_version(version: str) -> str:
    """Normalise release-note versions to the package-pick filename format."""
    parts = version.split(".")
    if len(parts) == 3:
        return ".".join(parts[:2])
    return version


def _parse_package_pick_file(file: dict) -> dict | None:
    """Return metadata for a dated stable package-pick file."""
    match = _PACKAGE_PICK_FILE_RE.fullmatch(file.get("name", ""))
    if not match:
        return None

    rocq_version = _normalise_rocq_version(match.group("rocq_version"))
    pick_version = match.group("pick_version")
    return {
        "name": file["name"].removesuffix(".sh"),
        "rocq_version": rocq_version,
        "pick_version": pick_version,
        "key": (rocq_version, pick_version),
    }


def _release_package_pick_references(releases: list[dict]) -> set[tuple[str, str]]:
    """Extract package-picks explicitly referenced by published releases."""
    references: set[tuple[str, str]] = set()
    for release in releases:
        text = "\n".join(
            str(release.get(field) or "")
            for field in ("name", "description", "body", "tag_name")
        )
        for match in _PACKAGE_PICK_REFERENCE_RE.finditer(text):
            references.add((
                _normalise_rocq_version(match.group("rocq_version")),
                match.group("pick_version"),
            ))
    return references


async def _find_in_progress_package_pick(
    github: GithubService, published_releases: list[dict]
) -> dict | None:
    """Find the newest package-pick that has not been published yet.

    Only the newest dated stable pick is considered. If it is already named by
    a final GitHub release, there is no active Platform release cycle.
    """
    try:
        files = await github.list_directory(OWNER, REPO, "package_picks")
    except Exception:
        logger.warning("Failed to list package_picks/ directory", exc_info=True)
        return None

    picks = [pick for file in files if (pick := _parse_package_pick_file(file))]
    if not picks:
        return None

    def sort_key(pick: dict) -> tuple[int, int, tuple[int, ...]]:
        year, month = (int(part) for part in pick["pick_version"].split("."))
        rocq_version = tuple(int(part) for part in pick["rocq_version"].split("."))
        return year, month, rocq_version

    newest = max(picks, key=sort_key)
    published_picks = _release_package_pick_references(published_releases)
    return None if newest["key"] in published_picks else newest


def _in_progress_release_option(package_pick: dict) -> dict:
    rocq_version = package_pick["rocq_version"]
    return {
        "id": "in-progress",
        "name": f"Rocq {rocq_version} (In Progress)",
        "description": f"Release cycle in progress targeting Rocq {rocq_version}",
        "published_at": None,
        "draft": False,
        "prerelease": True,
        "status": "in_progress",
    }


async def _compute_releases(github: GithubService) -> list[dict]:
    """Build the list of final releases and, when present, the active cycle."""
    releases = await github.get_releases(owner=OWNER, repo=REPO)
    final_releases = [
        release for release in releases
        if not release.get("draft") and not release.get("prerelease")
    ]

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
        for release in final_releases
    ]

    package_pick = await _find_in_progress_package_pick(github, final_releases)
    if package_pick:
        return [_in_progress_release_option(package_pick), *published_releases]
    return published_releases


async def _find_package_pick(release: dict, github: GithubService) -> tuple[str, str] | None:
    """Find the package-pick file matching a release tag.

    Returns (package_pick_name, rocq_version) or None.
    E.g. a release mentioning ``9.1.0~2026.01`` maps to
    ``("package-pick-9.1~2026.01", "Rocq 9.1")``.
    """
    try:
        files = await github.list_directory(OWNER, REPO, "package_picks")
    except Exception:
        logger.warning("Failed to list package_picks/ directory", exc_info=True)
        return None

    picks = [pick for file in files if (pick := _parse_package_pick_file(file))]
    references = _release_package_pick_references([release])
    for pick in picks:
        if pick["key"] in references:
            return pick["name"], f"Rocq {pick['rocq_version']}"

    # Older release titles do not always name the pick. Keep the historical
    # release-tag date fallback for those releases.
    release_tag = release.get("tag_name", "")
    parts = release_tag.split(".")
    if len(parts) >= 2:
        date_prefix = f"{parts[0]}.{parts[1]}"
        for pick in picks:
            if pick["pick_version"] == date_prefix:
                return pick["name"], f"Rocq {pick['rocq_version']}"

    logger.warning("No package-pick found for release %s", release_tag)
    return None


async def _compute_release(
    release_id: str, github: GithubService, kpi_service: KpiService
) -> dict:
    """Compute the full payload for a single release (in-progress or published)."""
    repo = await github.get_repo(owner=OWNER, repo=REPO)
    releases = await github.get_releases(owner=OWNER, repo=REPO)

    if release_id == "in-progress":
        published_releases = [
            release for release in releases
            if not release.get("draft") and not release.get("prerelease")
        ]
        package_pick = await _find_in_progress_package_pick(github, published_releases)
        if package_pick is None:
            return None

        package_pick_name = package_pick["name"]
        rocq_version = package_pick["rocq_version"]
        release_version = f"Rocq {rocq_version}"
        branch = repo["default_branch"]

        summary = await kpi_service.compute_summary(
            package_pick_name, release_version, branch
        )

        return {
            "id": "in-progress",
            "name": f"Rocq {rocq_version} (In Progress)",
            "description": f"Release cycle in progress targeting Rocq {rocq_version}",
            "published_at": None,
            "draft": False,
            "prerelease": True,
            "status": "in_progress",
            "platform": {
                "version": f"Unreleased ({package_pick['pick_version']})",
                "status": "in_progress",
                "package_pick": package_pick_name,
                "repository": repo["full_name"],
                "default_branch": branch,
                "open_issues": summary["open_issues"],
                "open_pull_requests": summary["open_pull_requests"],
            },
            "rocq": {
                "version": rocq_version,
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
    release = next(
        (r for r in releases if r["tag_name"] == release_id),
        None,
    )

    if release is None:
        return None

    # Find and load the matching package-pick
    pick_info = await _find_package_pick(release, github)
    if pick_info:
        package_pick_name, rocq_version = pick_info
        packages_list = await kpi_service._build_package_list(
            package_pick_name, rocq_version, skip_tracking=True
        )
        ready, waiting, blocked, disabled = kpi_service._count_package_statuses(packages_list)
    else:
        packages_list = []
        package_pick_name = None
        rocq_version = "unknown"
        ready = waiting = blocked = disabled = 0

    # Build timeline from sibling releases in the same family (e.g. 2025.08.x)
    family_prefix = ".".join(release_id.split(".")[:2])  # "2025.08"
    siblings = sorted(
        [r for r in releases if r["tag_name"].startswith(family_prefix + ".")],
        key=lambda r: r["published_at"] or r["created_at"],
    )
    timeline = [
        {
            "label": r["tag_name"],
            "date": (r["published_at"] or r["created_at"])[:10],
            "state": "done",
        }
        for r in siblings
    ]
    # Add a "Final Release" step with the publication date of the current release
    if release["published_at"]:
        timeline.append({
            "label": "Final Release",
            "date": release["published_at"][:10],
            "state": "done",
        })

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
            "package_pick": package_pick_name,
            "repository": repo["full_name"],
            "default_branch": repo["default_branch"],
            "open_issues": 0,
            "open_pull_requests": 0,
        },
        "rocq": {
            "version": rocq_version,
        },
        "summary": {
            "packages": len(packages_list),
            "ready": ready,
            "waiting": waiting,
            "blocked": blocked,
            "disabled": disabled,
        },
        "ci_status": [],
        "issues_by_state": {"open": 0, "closed": 0, "draft_prs": 0},
        "builds_summary": {"success": 0, "failed": 0, "running": 0, "cancelled": 0},
        "timeline": timeline,
        "packages_list": packages_list,
        "recent_activity": [],
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

    await _clear_github_cache()
    data = await _compute_releases(github)
    now = datetime.now(timezone.utc).isoformat()

    await redis_client.set(
        key, json.dumps(data), ex=_RELEASE_LIST_CACHE_TTL_SECONDS
    )
    await redis_client.set(
        at_key, now, ex=_RELEASE_LIST_CACHE_TTL_SECONDS
    )

    return {"releases": data, "last_refreshed_at": now}


async def peek_cached_release(release_id: str) -> dict | None:
    """Return the cached payload for *release_id*, or ``None`` if it is cold.

    Never computes. Unauthenticated callers go through this so that anonymous
    traffic cannot trigger the full recomputation (hundreds of GitHub calls
    plus opam subprocesses) by hitting a cold cache.
    """
    cached = await redis_client.get(_release_key(release_id))
    return json.loads(cached) if cached else None


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
        await redis_client.delete(key, at_key)
        return None

    now = datetime.now(timezone.utc).isoformat()
    cache_options = _cache_options(release_id)
    await redis_client.set(key, json.dumps(data), **cache_options)
    await redis_client.set(at_key, now, **cache_options)

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
        releases = await github.get_releases(owner=OWNER, repo=REPO)
        published_releases = [
            release for release in releases
            if not release.get("draft") and not release.get("prerelease")
        ]
        package_pick = await _find_in_progress_package_pick(github, published_releases)
        if package_pick:
            version = package_pick["rocq_version"]
            return package_pick["name"], f"Rocq {version}", repo["default_branch"]
        raise ValueError("No release cycle is currently in progress")
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
    the entire release payload. The existing expiry is preserved so a zone
    refresh does not make the cached payload permanent.
    """
    key = _release_key(release_id)
    at_key = _refreshed_at_key(release_id)
    cached = await redis_client.get(key)
    data = json.loads(cached) if cached else {}
    _deep_merge(data, patch)
    now = datetime.now(timezone.utc).isoformat()
    await _set_preserving_ttl(release_id, key, json.dumps(data))
    await _set_preserving_ttl(release_id, at_key, now)
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
