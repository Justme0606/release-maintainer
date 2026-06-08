import json
import logging
from datetime import datetime, timezone

from app.db.redis import redis_client
from app.services.github_service import GithubService
from app.services.kpi_service import KpiService

logger = logging.getLogger(__name__)

OWNER = "rocq-prover"
REPO = "platform"


def _release_key(release_id: str) -> str:
    return f"release_data:{release_id}"


def _refreshed_at_key(release_id: str) -> str:
    return f"release_data:{release_id}:refreshed_at"


async def _compute_releases(github: GithubService) -> dict:
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
    repo = await github.get_repo(owner=OWNER, repo=REPO)

    if release_id == "in-progress":
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
            },
            "ci_status": summary["ci_status"],
            "timeline": summary["timeline"],
            "packages_list": summary["packages_list"],
            "recent_activity": summary["recent_activity"],
        }

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


async def _clear_github_cache():
    """Delete all github:* keys so the next computation fetches fresh data."""
    cursor = 0
    while True:
        cursor, keys = await redis_client.scan(
            cursor=cursor, match="github:*", count=100
        )
        if keys:
            await redis_client.delete(*keys)
        if cursor == 0:
            break


async def get_cached_releases(github: GithubService) -> dict:
    key = _release_key("list")
    at_key = _refreshed_at_key("list")

    cached = await redis_client.get(key)
    if cached:
        refreshed_at = await redis_client.get(at_key)
        data = json.loads(cached)
        return {"releases": data, "last_refreshed_at": refreshed_at}

    return await refresh_releases(github)


async def refresh_releases(github: GithubService) -> dict:
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
