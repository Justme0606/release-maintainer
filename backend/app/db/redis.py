# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""Redis async client and connection helpers."""

from redis.asyncio import Redis

from app.core.config import settings

# Shared async Redis client, initialised once at module import
redis_client = Redis.from_url(
    settings.redis_url,
    decode_responses=True,
)


async def ping_redis() -> bool:
    """Send a PING command to Redis to check connectivity."""
    await redis_client.ping()
    return True