# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""Health-check endpoint for MongoDB and Redis connectivity."""

from fastapi import APIRouter

from app.db.mongo import ping_mongo
from app.db.redis import ping_redis

router = APIRouter()


@router.get("/health")
async def health_check():
    """Verify that both MongoDB and Redis are reachable."""
    await ping_mongo()
    await ping_redis()

    return {
        "status": "ok",
        "mongodb": "ok",
        "redis": "ok",
    }