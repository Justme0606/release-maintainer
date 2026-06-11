from fastapi import APIRouter

from app.services.github_service import GithubService

router = APIRouter()

github = GithubService()

@router.get("/repo")
async def get_repo():
    return await github.get_repo(
        owner="rocq-prover",
        repo="platform",
    )