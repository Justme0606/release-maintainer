import asyncio
import base64
import json
import logging
import os

import httpx

from app.db.redis import redis_client

GITHUB_API = "https://api.github.com"
CACHE_TTL_SECONDS = 300
MAX_CONCURRENT_REQUESTS = 3
MAX_RETRIES = 4

logger = logging.getLogger(__name__)


class GithubService:
    def __init__(self):
        from app.core.config import settings
        self.token = settings.github_token
        self._semaphore: asyncio.Semaphore | None = None

    def _get_semaphore(self) -> asyncio.Semaphore:
        if self._semaphore is None:
            self._semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
        return self._semaphore

    def _headers(self) -> dict:
        headers = {
            "Accept": "application/vnd.github+json",
        }

        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        return headers

    async def _get(self, endpoint: str):
        cache_key = f"github:{endpoint}"

        cached_value = await redis_client.get(cache_key)

        if cached_value:
            return json.loads(cached_value)

        async with self._get_semaphore():
            # Check cache again in case another coroutine populated it while we waited
            cached_value = await redis_client.get(cache_key)
            if cached_value:
                return json.loads(cached_value)

            async with httpx.AsyncClient() as client:
                for attempt in range(MAX_RETRIES):
                    response = await client.get(
                        f"{GITHUB_API}{endpoint}",
                        headers=self._headers(),
                    )

                    # GitHub returns 429 or 403 when rate limit is exhausted
                    is_rate_limited = response.status_code == 429 or (
                        response.status_code == 403
                        and response.headers.get("X-RateLimit-Remaining") == "0"
                    )
                    if is_rate_limited:
                        retry_after = int(response.headers.get("Retry-After", 10))
                        logger.warning(
                            "Rate limited on %s, retrying in %ds (attempt %d/%d)",
                            endpoint, retry_after, attempt + 1, MAX_RETRIES,
                        )
                        await asyncio.sleep(retry_after)
                        continue

                    response.raise_for_status()
                    data = response.json()

                    await redis_client.set(
                        cache_key,
                        json.dumps(data),
                        ex=CACHE_TTL_SECONDS,
                    )

                    return data

            # All retries exhausted on 429
            response.raise_for_status()

    async def get_repo(self, owner: str, repo: str):
        return await self._get(f"/repos/{owner}/{repo}")

    async def get_tags(self, owner: str, repo: str):
        return await self._get(f"/repos/{owner}/{repo}/tags")

    async def get_releases(self, owner: str, repo: str):
        return await self._get(f"/repos/{owner}/{repo}/releases")

    async def get_file_content(self, owner: str, repo: str, path: str) -> str:
        data = await self._get(f"/repos/{owner}/{repo}/contents/{path}")
        return base64.b64decode(data["content"]).decode("utf-8")

    async def get_issue(self, owner: str, repo: str, issue_number: int):
        return await self._get(f"/repos/{owner}/{repo}/issues/{issue_number}")

    async def search_issues(self, owner: str, repo: str, query: str):
        return await self._get(
            f"/search/issues?q={query}+repo:{owner}/{repo}"
        )

    async def get_issue_timeline(self, owner: str, repo: str, issue_number: int):
        return await self._get(
            f"/repos/{owner}/{repo}/issues/{issue_number}/timeline?per_page=100"
        )

    async def get_workflow_runs(self, owner: str, repo: str, branch: str):
        return await self._get(
            f"/repos/{owner}/{repo}/actions/runs?per_page=10&branch={branch}"
        )

    async def get_workflows(self, owner: str, repo: str):
        return await self._get(
            f"/repos/{owner}/{repo}/actions/workflows"
        )

    async def get_recent_issues(self, owner: str, repo: str, per_page: int = 10) -> list:
        return await self._get(
            f"/repos/{owner}/{repo}/issues?sort=updated&direction=desc&per_page={per_page}&state=all"
        )

    async def get_tree(self, owner: str, repo: str, tree_sha: str, recursive: bool = False) -> dict:
        """Return a git tree. Use recursive=True to get nested entries."""
        url = f"/repos/{owner}/{repo}/git/trees/{tree_sha}"
        if recursive:
            url += "?recursive=1"
        return await self._get(url)

    async def get_commit_sha(self, owner: str, repo: str, ref: str) -> str:
        """Return the commit SHA for a given ref (branch/tag)."""
        data = await self._get(f"/repos/{owner}/{repo}/commits/{ref}?per_page=1")
        return data["sha"]