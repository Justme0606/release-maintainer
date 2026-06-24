# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""MongoDB repository for user CRUD operations."""

from app.db.mongo import database

COLLECTION = "users"


async def get_user_by_username(username: str):
    """Fetch a single user document by username."""
    return await database[COLLECTION].find_one(
        {"username": username},
        {"_id": 0},
    )


async def list_users():
    """Return all users (without password hashes)."""
    users = []
    cursor = database[COLLECTION].find(
        {},
        {"_id": 0, "hashed_password": 0},
    )
    async for user in cursor:
        users.append(user)
    return users


async def upsert_user(user: dict):
    """Insert or update a user document, matched by username."""
    await database[COLLECTION].update_one(
        {"username": user["username"]},
        {"$set": user},
        upsert=True,
    )
