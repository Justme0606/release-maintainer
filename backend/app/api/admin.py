# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""Admin-only endpoints for managing releases and users."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import require_admin
from app.repositories.release_repository import (
    get_release_by_id,
    list_releases,
    upsert_release,
)
from app.repositories.user_repository import list_users
from app.db.mongo import database

router = APIRouter()


class ReleaseCreate(BaseModel):
    """Payload for creating or updating a release."""

    id: str
    name: str
    description: str | None = None


@router.post("/releases", dependencies=[Depends(require_admin)])
async def create_release(payload: ReleaseCreate):
    """Create a new release."""
    existing = await get_release_by_id(payload.id)
    if existing:
        raise HTTPException(status_code=409, detail="Release already exists")
    release = await upsert_release(payload.model_dump())
    return release


@router.put("/releases/{release_id}", dependencies=[Depends(require_admin)])
async def update_release(release_id: str, payload: ReleaseCreate):
    """Update an existing release."""
    existing = await get_release_by_id(release_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Release not found")
    data = payload.model_dump()
    data["id"] = release_id
    release = await upsert_release(data)
    return release


@router.delete("/releases/{release_id}", dependencies=[Depends(require_admin)])
async def delete_release(release_id: str):
    """Delete a release."""
    existing = await get_release_by_id(release_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Release not found")
    await database["releases"].delete_one({"id": release_id})
    return {"detail": "Deleted"}


@router.get("/users", dependencies=[Depends(require_admin)])
async def get_users():
    """List all user accounts (admin only)."""
    users = list_users()
    return users
