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

    async def _fetch_single(self, client: httpx.AsyncClient, url: str):
        """Fetch a single URL with retry logic for rate limiting."""
        for attempt in range(MAX_RETRIES):
            response = await client.get(url, headers=self._headers())

            is_rate_limited = response.status_code == 429 or (
                response.status_code == 403
                and response.headers.get("X-RateLimit-Remaining") == "0"
            )
            if is_rate_limited:
                retry_after = int(response.headers.get("Retry-After", 10))
                logger.warning(
                    "Rate limited on %s, retrying in %ds (attempt %d/%d)",
                    url, retry_after, attempt + 1, MAX_RETRIES,
                )
                await asyncio.sleep(retry_after)
                continue

            response.raise_for_status()
            return response

        # All retries exhausted on 429
        response.raise_for_status()

    @staticmethod
    def _parse_next_link(link_header: str | None) -> str | None:
        """Extract the 'next' URL from a GitHub Link header."""
        if not link_header:
            return None
        for part in link_header.split(","):
            if 'rel="next"' in part:
                url = part.split(";")[0].strip().strip("<>")
                return url
        return None

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
                response = await self._fetch_single(client, f"{GITHUB_API}{endpoint}")
                data = response.json()

                await redis_client.set(
                    cache_key,
                    json.dumps(data),
                    ex=CACHE_TTL_SECONDS,
                )

                return data

    async def _get_all_pages(self, endpoint: str) -> list:
        """Fetch all pages of a paginated GitHub API endpoint and return
        the concatenated list of results."""
        cache_key = f"github:paginated:{endpoint}"

        cached_value = await redis_client.get(cache_key)
        if cached_value:
            return json.loads(cached_value)

        async with self._get_semaphore():
            cached_value = await redis_client.get(cache_key)
            if cached_value:
                return json.loads(cached_value)

            all_items: list = []
            url = f"{GITHUB_API}{endpoint}"

            async with httpx.AsyncClient() as client:
                while url:
                    response = await self._fetch_single(client, url)
                    data = response.json()
                    if isinstance(data, list):
                        all_items.extend(data)
                    else:
                        all_items.append(data)
                    url = self._parse_next_link(response.headers.get("Link"))

            await redis_client.set(
                cache_key,
                json.dumps(all_items),
                ex=CACHE_TTL_SECONDS,
            )

            return all_items

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
        return await self._get_all_pages(
            f"/repos/{owner}/{repo}/issues/{issue_number}/timeline?per_page=100"
        )

    async def get_workflow_runs(self, owner: str, repo: str, branch: str):
        return await self._get(
            f"/repos/{owner}/{repo}/actions/runs?per_page=10&branch={branch}"
        )

    async def get_all_workflow_runs(self, owner: str, repo: str, per_page: int = 30):
        return await self._get(
            f"/repos/{owner}/{repo}/actions/runs?per_page={per_page}"
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

    async def get_opam_file(self, pkg_name: str, version: str) -> str:
        """Return the content of an opam file from ocaml/opam-repository."""
        path = f"packages/{pkg_name}/{pkg_name}.{version}/opam"
        return await self.get_file_content("ocaml", "opam-repository", path)

    async def get_issue_details(self, owner: str, repo: str, issue_number: int) -> dict:
        """Fetch full issue details including labels, assignees, comments."""
        issue = await self._get(f"/repos/{owner}/{repo}/issues/{issue_number}")
        comments = await self._get(
            f"/repos/{owner}/{repo}/issues/{issue_number}/comments?per_page=100"
        )
        return {
            "number": issue.get("number"),
            "title": issue.get("title"),
            "state": issue.get("state"),
            "html_url": issue.get("html_url"),
            "created_at": issue.get("created_at"),
            "updated_at": issue.get("updated_at"),
            "author": issue.get("user", {}).get("login"),
            "author_avatar": issue.get("user", {}).get("avatar_url"),
            "labels": [
                {"name": l.get("name"), "color": l.get("color")}
                for l in issue.get("labels", [])
            ],
            "assignees": [
                {"login": a.get("login"), "avatar_url": a.get("avatar_url")}
                for a in issue.get("assignees", [])
            ],
            "comments": [
                {
                    "author": c.get("user", {}).get("login"),
                    "author_avatar": c.get("user", {}).get("avatar_url"),
                    "created_at": c.get("created_at"),
                    "body": c.get("body", ""),
                }
                for c in (comments if isinstance(comments, list) else [])
            ],
        }