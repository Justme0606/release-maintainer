from fastapi import FastAPI
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


@app.get("/api/releases/current")
async def get_current_release():
    repo = await github.get_repo(
        owner="rocq-prover",
        repo="platform",
    )

    return {
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

@app.get("/api/github/repo")
async def get_repo():
    return await github.get_repo(
        owner="rocq-prover",
        repo="platform",
    )