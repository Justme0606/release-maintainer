# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""Authentication endpoints: login, logout, and session check."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app.core.auth import create_access_token, get_current_user, verify_password
from app.models.user import LoginRequest
from app.repositories.user_repository import get_user_by_username

router = APIRouter()


@router.post("/login")
async def login(credentials: LoginRequest):
    """Authenticate a user and set a JWT cookie."""
    user = await get_user_by_username(credentials.username)
    if not user or not verify_password(credentials.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": user["username"], "role": user["role"]})

    response = JSONResponse(content={"username": user["username"], "role": user["role"]})
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,  # Set to True in production with HTTPS
        max_age=60 * 480,  # 8 hours
    )
    return response


@router.post("/logout")
async def logout():
    """Clear the authentication cookie."""
    response = JSONResponse(content={"detail": "Logged out"})
    response.delete_cookie("access_token")
    return response


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    """Return the current authenticated user."""
    return {"username": user["username"], "role": user["role"]}
