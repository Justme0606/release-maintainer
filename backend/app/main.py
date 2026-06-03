from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.services.github_service import GithubService

app = FastAPI(
    title="Rocq Release Console API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

github = GithubService()


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/github/repo")
async def get_repo():
    return await github.get_repo(
        owner="rocq-prover",
        repo="platform",
    )


@app.get("/api/releases")
async def get_releases():
    releases = await github.get_releases(
        owner="rocq-prover",
        repo="platform",
    )

    published_releases = [
        {
            "id": release["tag_name"],
            "name": release["tag_name"],
            "description": release["name"],
            "published_at": release["published_at"],
            "draft": release["draft"],
            "prerelease": release["prerelease"],
            "status": "released",
        }
        for release in releases
    ]

    return [
        {
            "id": "in-progress",
            "name": "In Progress Release",
            "description": "Release cycle in progress targeting Rocq 9.1.0",
            "published_at": None,
            "draft": False,
            "prerelease": True,
            "status": "in_progress",
        },
        *published_releases,
    ]


@app.get("/api/releases/{release_id}")
async def get_release(release_id: str):
    repo = await github.get_repo(
        owner="rocq-prover",
        repo="platform",
    )

    if release_id == "in-progress":
        return {
            "id": "in-progress",
            "name": "2026.01",
            "description": "Release cycle in progress targeting Rocq 9.1.0",
            "published_at": None,
            "draft": False,
            "prerelease": True,
            "status": "in_progress",
            "platform": {
                "version": "2026.01",
                "status": "in_progress",
                "package_pick": "package-pick-9.1~2026.01",
                "repository": repo["full_name"],
                "default_branch": repo["default_branch"],
                "open_issues": repo["open_issues_count"],
            },
            "rocq": {
                "version": "9.1.0",
            },
            "summary": {
                "packages": 142,
                "ready": 118,
                "waiting": 17,
                "blocked": 7,
            },
        }

    releases = await github.get_releases(
        owner="rocq-prover",
        repo="platform",
    )

    release = next(
        (r for r in releases if r["tag_name"] == release_id),
        None,
    )

    if release is None:
        raise HTTPException(
            status_code=404,
            detail="Release not found",
        )

    return {
        "id": release["tag_name"],
        "name": release["tag_name"],
        "description": release["name"],
        "published_at": release["published_at"],
        "draft": release["draft"],
        "prerelease": release["prerelease"],
        "status": "released",
        "platform": {
            "version": release["tag_name"],
            "status": "released",
            "package_pick": None,
            "repository": repo["full_name"],
            "default_branch": repo["default_branch"],
            "open_issues": repo["open_issues_count"],
        },
        "rocq": {
            "version": "unknown",
        },
        "summary": {
            "packages": 0,
            "ready": 0,
            "waiting": 0,
            "blocked": 0,
        },
    }