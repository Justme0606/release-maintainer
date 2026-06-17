# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""Application settings loaded from environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings

# Resolve the .env file located at the backend root directory
ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    """Centralised application settings, auto-loaded from environment or .env."""

    app_name: str = "Rocq Release Console API"

    # GitHub personal access token for API calls (optional, but recommended)
    github_token: str | None = None

    # MongoDB connection
    mongo_url: str = "mongodb://localhost:27017"
    mongo_db: str = "rocq_dashboard"

    # Redis connection (used as cache layer)
    redis_url: str = "redis://localhost:6379/0"

    # Release tracking configuration
    release_deadline: str | None = None          # ISO date string, e.g. "2026-06-30"
    tracking_issue_number: int | None = None     # GitHub issue number for the tracking issue

    class Config:
        env_file = str(ENV_FILE)


settings = Settings()