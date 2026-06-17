# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""GitHub proxy endpoint for repository information."""

from fastapi import APIRouter

from app.services.github_service import GithubService

router = APIRouter()

github = GithubService()


@router.get("/repo")
async def get_repo():
    """Return metadata for the rocq-prover/platform repository."""
    return await github.get_repo(
        owner="rocq-prover",
        repo="platform",
    )