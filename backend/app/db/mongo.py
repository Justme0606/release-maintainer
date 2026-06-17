# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""MongoDB async client and connection helpers."""

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings

# Shared async MongoDB client, initialised once at module import
mongo_client = AsyncIOMotorClient(settings.mongo_url)
database = mongo_client[settings.mongo_db]


async def ping_mongo() -> bool:
    """Send a ping command to MongoDB to check connectivity."""
    await database.command("ping")
    return True