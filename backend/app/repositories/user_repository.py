# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""In-memory user store loaded from SEED_USERS environment variable."""

import json
import logging

import bcrypt

from app.core.config import settings

logger = logging.getLogger(__name__)

# In-memory store: username -> {username, hashed_password, role}
_users: dict[str, dict] = {}


def _load_users():
    """Parse SEED_USERS JSON and hash passwords into the in-memory store."""
    try:
        entries = json.loads(settings.seed_users)
    except json.JSONDecodeError:
        logger.error("Failed to parse SEED_USERS JSON")
        return

    for entry in entries:
        username = entry.get("username")
        password = entry.get("password")
        role = entry.get("role", "maintainer")

        if not username or not password:
            logger.warning("Skipping seed entry with missing username or password")
            continue

        hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        _users[username] = {
            "username": username,
            "hashed_password": hashed,
            "role": role,
        }
        logger.info("Loaded user '%s' with role '%s'", username, role)


# Load users at import time
_load_users()


def get_user_by_username(username: str) -> dict | None:
    """Fetch a user by username from the in-memory store."""
    return _users.get(username)


def list_users() -> list[dict]:
    """Return all users (without password hashes)."""
    return [
        {"username": u["username"], "role": u["role"]}
        for u in _users.values()
    ]
