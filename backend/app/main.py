# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""FastAPI application entry point and lifespan configuration."""

import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.health import router as health_router
from app.api.help import router as help_router
from app.api.public import router as public_router
from app.api.releases import router as releases_router
from app.api.github import router as github_router
from app.core.config import settings
from app.core.seed import seed_users
from app.services.github_service import GithubService
from app.services.kpi_service import KpiService
from app.services.release_cache_service import refresh_release

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

# Background scheduler used to trigger periodic data refreshes
scheduler = AsyncIOScheduler()


async def nightly_refresh():
    """Refresh the in-progress release data every night at 02:00."""
    logger.info("Nightly refresh: starting")
    github = GithubService()
    kpi_service = KpiService(github)
    await refresh_release("in-progress", github, kpi_service)
    logger.info("Nightly refresh: done")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: seed users and start the scheduler on startup."""
    # Seed predefined user accounts
    await seed_users()

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

# Allow requests from the Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(health_router)

app.include_router(
    auth_router,
    prefix="/api/auth",
    tags=["auth"],
)

app.include_router(
    public_router,
    prefix="/api/public",
    tags=["public"],
)

app.include_router(
    admin_router,
    prefix="/api/admin",
    tags=["admin"],
)

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

app.include_router(
    help_router,
    prefix="/api/help",
    tags=["help"],
)
