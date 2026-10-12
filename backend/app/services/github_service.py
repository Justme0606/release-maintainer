# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""GitHub API client with Redis caching and rate-limit handling."""

import asyncio
import base64
import json
import logging
import time
import weakref

import httpx

from app.db.redis import redis_client

GITHUB_API = "https://api.github.com"
CACHE_TTL_SECONDS = 1800         # Cache responses for 30 minutes
TAGS_CACHE_TTL_SECONDS = 86400   # Cache git tags for 24 hours (they rarely change)
MAX_CONCURRENT_REQUESTS = 3      # Limit parallel HTTP calls to avoid rate-limiting
MAX_RETRIES = 4                  # Attempts per request when hitting rate limits

# GitHub signals both its primary and secondary rate limits with these codes
RATE_LIMIT_STATUS_CODES = frozenset({403, 429})
# Never block a request longer than this. The primary rate limit can reset up
# to an hour away, which is far too long to hold a connection for.
MAX_RETRY_WAIT_SECONDS = 60.0

logger = logging.getLogger(__name__)

# One semaphore per event loop, shared by every GithubService instance: the
# routers each build their own, and the cap has to be process-wide to be
# worth anything. Keyed weakly so test loops do not leak.
_semaphores: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore]" = (
    weakref.WeakKeyDictionary()
)


def _get_request_semaphore() -> asyncio.Semaphore:
    """Return the shared GitHub request semaphore for the running event loop."""
    loop = asyncio.get_running_loop()
    semaphore = _semaphores.get(loop)
    if semaphore is None:
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
        _semaphores[loop] = semaphore
    return semaphore


class GithubService:
    """Async GitHub REST API client with Redis caching and rate-limit retry."""

    def __init__(self):
        from app.core.config import settings
        self.token = settings.github_token

    def _get_semaphore(self) -> asyncio.Semaphore:
        """Return the process-wide request semaphore (must be in an async context)."""
        return _get_request_semaphore()

    def _headers(self) -> dict:
        """Build HTTP headers for GitHub API requests."""
        headers = {
            "Accept": "application/vnd.github+json",
        }

        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        return headers
    
    @staticmethod
    def _rate_limit_delay(response, attempt: int) -> float | None:
        """Seconds to wait before retrying, or ``None`` if not worth retrying.

        Handles both GitHub rate limits: the secondary one sends ``Retry-After``,
        the primary one exhausts ``X-RateLimit-Remaining`` and gives the reset
        timestamp. A wait longer than :data:`MAX_RETRY_WAIT_SECONDS` is reported
        as not retryable so the caller fails fast instead of hanging.
        """
        if response.status_code not in RATE_LIMIT_STATUS_CODES:
            return None

        delay: float | None = None

        retry_after = response.headers.get("retry-after")
        if retry_after:
            try:
                delay = float(retry_after)
            except ValueError:
                delay = None

        if delay is None and response.headers.get("x-ratelimit-remaining") == "0":
            reset = response.headers.get("x-ratelimit-reset")
            try:
                delay = max(float(reset) - time.time(), 0.0) if reset else None
            except ValueError:
                delay = None

        if delay is None:
            # A 403/429 with no usable header is most likely the secondary
            # limit; back off exponentially rather than giving up immediately.
            delay = float(2 ** attempt)

        return delay if delay <= MAX_RETRY_WAIT_SECONDS else None

    async def _fetch_single(self, client, url: str):
        """GET *url*, retrying while GitHub is rate-limiting us."""
        for attempt in range(MAX_RETRIES):
            response = await client.get(url, headers=self._headers())

            delay = self._rate_limit_delay(response, attempt)
            if delay is None or attempt == MAX_RETRIES - 1:
                response.raise_for_status()
                return response

            logger.warning(
                "GitHub rate-limited %s (HTTP %s); retrying in %.1fs (attempt %d/%d)",
                url, response.status_code, delay, attempt + 1, MAX_RETRIES,
            )
            await asyncio.sleep(delay)

        # Unreachable: the loop always returns or raises on its last attempt.
        raise RuntimeError("retry loop exited without a response")

    @staticmethod
    def _parse_next_link(link_header: str | None) -> str | None:
        """Extract the ``next`` URL from a GitHub RFC 8288 Link header."""
        if not link_header:
            return None

        for link in link_header.split(","):
            parts = [part.strip() for part in link.split(";")]
            if len(parts) < 2:
                continue

            relations = {
                part.removeprefix("rel=").strip('"')
                for part in parts[1:]
                if part.startswith("rel=")
            }
            if "next" not in relations:
                continue

            target = parts[0]
            if target.startswith("<") and target.endswith(">"):
                return target[1:-1]

        return None

    # ------------------------------------------------------------------
    #  Core HTTP helpers
    # ------------------------------------------------------------------

    async def _get(self, endpoint: str):
        """Fetch a single GitHub API endpoint with Redis cache and retry logic.

        Uses a double-check locking pattern: the cache is checked before and
        after acquiring the semaphore to avoid redundant API calls.
        """
        cache_key = f"github:{endpoint}"

        cached_value = await redis_client.get(cache_key)

        if cached_value:
            return json.loads(cached_value)

        async with self._get_semaphore():
            # Double-check: another coroutine may have populated the cache
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

    # ------------------------------------------------------------------
    #  Repository endpoints
    # ------------------------------------------------------------------

    async def get_repo(self, owner: str, repo: str):
        """Get repository metadata (stars, default branch, etc.)."""
        return await self._get(f"/repos/{owner}/{repo}")

    async def get_tags(self, owner: str, repo: str):
        """List tags for a repository (most recent first).

        Uses a longer cache TTL (24h) since tags rarely change once published.
        """
        cache_key = f"github:/repos/{owner}/{repo}/tags"

        cached_value = await redis_client.get(cache_key)
        if cached_value:
            return json.loads(cached_value)

        async with self._get_semaphore():
            # Double-check cache after acquiring semaphore
            cached_value = await redis_client.get(cache_key)
            if cached_value:
                return json.loads(cached_value)

            async with httpx.AsyncClient() as client:
                response = await self._fetch_single(client, f"{GITHUB_API}/repos/{owner}/{repo}/tags")
                data = response.json()

                await redis_client.set(
                    cache_key,
                    json.dumps(data),
                    ex=TAGS_CACHE_TTL_SECONDS,  # Use longer TTL for tags
                )

                return data

    async def get_releases(self, owner: str, repo: str):
        """List all releases for a repository, newest first."""
        return await self._get_all_pages(
            f"/repos/{owner}/{repo}/releases?per_page=100"
        )

    async def get_file_content(self, owner: str, repo: str, path: str) -> str:
        """Download and decode a single file from a repository."""
        data = await self._get(f"/repos/{owner}/{repo}/contents/{path}")
        return base64.b64decode(data["content"]).decode("utf-8")

    async def list_directory(self, owner: str, repo: str, path: str) -> list[dict]:
        """List files in a repository directory."""
        return await self._get(f"/repos/{owner}/{repo}/contents/{path}")

    async def get_tree(self, owner: str, repo: str, tree_sha: str, recursive: bool = False) -> dict:
        """Return a git tree. Use ``recursive=True`` to get nested entries."""
        url = f"/repos/{owner}/{repo}/git/trees/{tree_sha}"
        if recursive:
            url += "?recursive=1"
        return await self._get(url)

    async def get_commit_sha(self, owner: str, repo: str, ref: str) -> str:
        """Return the commit SHA for a given ref (branch or tag name)."""
        data = await self._get(f"/repos/{owner}/{repo}/commits/{ref}?per_page=1")
        return data["sha"]

    # ------------------------------------------------------------------
    #  Issue and search endpoints
    # ------------------------------------------------------------------

    async def get_issue(self, owner: str, repo: str, issue_number: int):
        """Fetch a single issue by number."""
        return await self._get(f"/repos/{owner}/{repo}/issues/{issue_number}")

    async def search_issues(self, owner: str, repo: str, query: str):
        """Run a GitHub issue/PR search query and return the result."""
        return await self._get(
            f"/search/issues?q={query}+repo:{owner}/{repo}"
        )

    async def get_issue_timeline(self, owner: str, repo: str, issue_number: int):
        """Fetch the timeline events of an issue (cross-references, labels, etc.)."""
        return await self._get(
            f"/repos/{owner}/{repo}/issues/{issue_number}/timeline?per_page=100"
        )

    async def get_recent_issues(self, owner: str, repo: str, per_page: int = 10) -> list:
        """Return the most recently updated issues/PRs (all states)."""
        return await self._get(
            f"/repos/{owner}/{repo}/issues?sort=updated&direction=desc&per_page={per_page}&state=all"
        )

    async def get_issue_details(self, owner: str, repo: str, issue_number: int) -> dict:
        """Fetch full issue details including labels, assignees and comments."""
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

    # ------------------------------------------------------------------
    #  CI / Workflow endpoints
    # ------------------------------------------------------------------

    async def get_workflow_runs(self, owner: str, repo: str, branch: str):
        """Return the latest workflow runs for a specific branch."""
        return await self._get(
            f"/repos/{owner}/{repo}/actions/runs?per_page=10&branch={branch}"
        )

    async def get_all_workflow_runs(self, owner: str, repo: str, per_page: int = 30):
        """Return recent workflow runs across all branches."""
        return await self._get(
            f"/repos/{owner}/{repo}/actions/runs?per_page={per_page}"
        )

    async def get_workflows(self, owner: str, repo: str):
        """List all workflow definitions for a repository."""
        return await self._get(
            f"/repos/{owner}/{repo}/actions/workflows"
        )

    # ------------------------------------------------------------------
    #  opam-repository helpers
    # ------------------------------------------------------------------

    async def get_opam_file(self, pkg_name: str, version: str) -> str:
        """Download an opam file from the ocaml/opam-repository on GitHub."""
        path = f"packages/{pkg_name}/{pkg_name}.{version}/opam"
        return await self.get_file_content("ocaml", "opam-repository", path)
