# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""User data models for authentication and authorization."""

from pydantic import BaseModel


class UserInDB(BaseModel):
    """User document stored in MongoDB."""

    username: str
    hashed_password: str
    role: str  # "admin" or "maintainer"


class UserResponse(BaseModel):
    """Public user representation (no password)."""

    username: str
    role: str


class LoginRequest(BaseModel):
    """Credentials submitted by the login form."""

    username: str
    password: str
