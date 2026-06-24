# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""GitHub proxy endpoint for repository information."""

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.services.github_service import GithubService

router = APIRouter()

github = GithubService()


@router.get("/repo")
async def get_repo(user: dict = Depends(get_current_user)):
    """Return metadata for the rocq-prover/platform repository."""
    return await github.get_repo(
        owner="rocq-prover",
        repo="platform",
    )