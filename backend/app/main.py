import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.releases import router as releases_router
from app.api.github import router as github_router
from app.core.config import settings
from app.services.github_service import GithubService
from app.services.kpi_service import KpiService
from app.services.release_cache_service import refresh_release

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def nightly_refresh():
    """Refresh the in-progress release data."""
    logger.info("Nightly refresh: starting")
    github = GithubService()
    kpi_service = KpiService(github)
    await refresh_release("in-progress", github, kpi_service)
    logger.info("Nightly refresh: done")


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(
        nightly_refresh,
        trigger="cron",
        hour=2,
        minute=0,
        id="nightly_refresh",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started – nightly refresh registered at 02:00")
    yield
    scheduler.shutdown()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)

app.include_router(
    github_router,
    prefix="/api/github",
    tags=["github"],
)

app.include_router(
    releases_router,
    prefix="/api/releases",
    tags=["releases"],
)
