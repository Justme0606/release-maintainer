from fastapi import APIRouter, HTTPException

from app.services.github_service import GithubService
from app.services.kpi_service import KpiService
from app.services.release_cache_service import (
    get_cached_release,
    get_cached_releases,
    refresh_release,
)

router = APIRouter()
github = GithubService()
kpi_service = KpiService(github)


@router.get("/")
async def get_releases():
    result = await get_cached_releases(github)
    return result


@router.get("/{release_id}")
async def get_release(release_id: str):
    data = await get_cached_release(release_id, github, kpi_service)
    if data is None:
        raise HTTPException(status_code=404, detail="Release not found")
    return data


@router.post("/{release_id}/refresh")
async def post_refresh_release(release_id: str):
    data = await refresh_release(release_id, github, kpi_service)
    if data is None:
        raise HTTPException(status_code=404, detail="Release not found")
    return data
