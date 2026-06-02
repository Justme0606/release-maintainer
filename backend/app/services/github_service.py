import os
import httpx

GITHUB_API = "https://api.github.com"


class GithubService:
    def __init__(self):
        self.token = os.getenv("GITHUB_TOKEN")

    async def get_repo(self, owner: str, repo: str):
        headers = {}

        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{GITHUB_API}/repos/{owner}/{repo}",
                headers=headers,
            )

            response.raise_for_status()
            return response.json()