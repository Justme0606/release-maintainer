# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""Seed predefined user accounts from environment configuration."""

import json
import logging

import bcrypt

from app.core.config import settings
from app.repositories.user_repository import get_user_by_username, upsert_user

logger = logging.getLogger(__name__)


async def seed_users():
    """Parse SEED_USERS JSON and insert users that don't already exist."""
    try:
        users = json.loads(settings.seed_users)
    except json.JSONDecodeError:
        logger.error("Failed to parse SEED_USERS JSON, skipping seed")
        return

    for entry in users:
        username = entry.get("username")
        password = entry.get("password")
        role = entry.get("role", "maintainer")

        if not username or not password:
            logger.warning("Skipping seed entry with missing username or password")
            continue

        existing = await get_user_by_username(username)
        if existing:
            logger.info("User '%s' already exists, skipping", username)
            continue

        hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        await upsert_user({
            "username": username,
            "hashed_password": hashed,
            "role": role,
        })
        logger.info("Seeded user '%s' with role '%s'", username, role)
