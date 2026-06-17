# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""MongoDB repository for release CRUD operations."""

from app.db.mongo import database

COLLECTION = "releases"


async def list_releases():
    """Return all releases sorted by creation date (newest first)."""
    releases = []

    cursor = database[COLLECTION].find(
        {},
        {"_id": 0},  # Exclude MongoDB internal _id field
    ).sort("created_at", -1)

    async for release in cursor:
        releases.append(release)

    return releases


async def get_release_by_id(release_id: str):
    """Fetch a single release document by its ``id`` field."""
    return await database[COLLECTION].find_one(
        {"id": release_id},
        {"_id": 0},
    )


async def upsert_release(release: dict):
    """Insert or update a release document, matched by ``id``."""
    await database[COLLECTION].update_one(
        {"id": release["id"]},
        {"$set": release},
        upsert=True,
    )

    return await get_release_by_id(release["id"])