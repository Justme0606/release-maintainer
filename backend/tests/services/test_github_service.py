"""Tests for the GitHub API client."""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.github_service import (
    GITHUB_API,
    MAX_RETRIES,
    GithubService,
)


def response(data, link_header: str | None = None) -> MagicMock:
    result = MagicMock()
    result.json.return_value = data
    result.headers = {"Link": link_header} if link_header else {}
    return result


def rate_limited(headers: dict, status_code: int = 403) -> MagicMock:
    result = MagicMock()
    result.status_code = status_code
    result.headers = headers
    return result


def ok(data=None) -> MagicMock:
    result = MagicMock()
    result.status_code = 200
    result.headers = {}
    result.json.return_value = data if data is not None else {}
    return result


def test_parse_next_link():
    header = (
        '<https://api.github.com/repositories/1/releases?per_page=100&page=2>; rel="next", '
        '<https://api.github.com/repositories/1/releases?per_page=100&page=4>; rel="last"'
    )

    assert GithubService._parse_next_link(header) == (
        "https://api.github.com/repositories/1/releases?per_page=100&page=2"
    )
    assert GithubService._parse_next_link(None) is None
    assert GithubService._parse_next_link('<https://example.test>; rel="last"') is None


@pytest.mark.asyncio
async def test_get_releases_follows_github_pagination():
    github = GithubService()
    next_url = f"{GITHUB_API}/repos/rocq-prover/platform/releases?per_page=100&page=2"
    first_page = response(
        [{"tag_name": "2026.07.0"}],
        f'<{next_url}>; rel="next", <{next_url}>; rel="last"',
    )
    second_page = response([{"tag_name": "2025.08.3"}])
    github._fetch_single = AsyncMock(side_effect=[first_page, second_page])

    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    redis.set = AsyncMock(return_value=True)

    with patch("app.services.github_service.redis_client", redis):
        releases = await github.get_releases("rocq-prover", "platform")

    assert [release["tag_name"] for release in releases] == [
        "2026.07.0",
        "2025.08.3",
    ]
    assert github._fetch_single.await_args_list[0].args[1] == (
        f"{GITHUB_API}/repos/rocq-prover/platform/releases?per_page=100"
    )
    assert github._fetch_single.await_args_list[1].args[1] == next_url


# ------------------------------------------------------------------
#  Rate-limit retry
# ------------------------------------------------------------------


def test_retry_after_header_drives_the_delay():
    delay = GithubService._rate_limit_delay(
        rate_limited({"retry-after": "12"}), attempt=0
    )
    assert delay == 12.0


def test_exhausted_quota_waits_until_the_reset():
    reset = time.time() + 30
    delay = GithubService._rate_limit_delay(
        rate_limited({"x-ratelimit-remaining": "0", "x-ratelimit-reset": str(reset)}),
        attempt=0,
    )
    assert delay is not None
    assert 25 <= delay <= 31


def test_a_reset_too_far_away_is_not_retried():
    """An hour-long primary rate limit must fail fast, not hang the request."""
    reset = time.time() + 3600
    delay = GithubService._rate_limit_delay(
        rate_limited({"x-ratelimit-remaining": "0", "x-ratelimit-reset": str(reset)}),
        attempt=0,
    )
    assert delay is None


def test_secondary_limit_without_headers_backs_off_exponentially():
    assert GithubService._rate_limit_delay(rate_limited({}, 429), attempt=0) == 1.0
    assert GithubService._rate_limit_delay(rate_limited({}, 429), attempt=2) == 4.0


def test_a_successful_response_is_never_retried():
    assert GithubService._rate_limit_delay(ok(), attempt=0) is None


@pytest.mark.asyncio
async def test_fetch_retries_then_returns_the_successful_response():
    github = GithubService()
    client = MagicMock()
    client.get = AsyncMock(
        side_effect=[rate_limited({"retry-after": "1"}), ok({"ok": True})]
    )
    sleep = AsyncMock()

    with patch("app.services.github_service.asyncio.sleep", sleep):
        result = await github._fetch_single(client, "https://example.test")

    assert result.json() == {"ok": True}
    assert client.get.await_count == 2
    sleep.assert_awaited_once_with(1.0)


@pytest.mark.asyncio
async def test_fetch_gives_up_after_max_retries():
    github = GithubService()
    limited = rate_limited({"retry-after": "1"})
    limited.raise_for_status.side_effect = RuntimeError("rate limited")
    client = MagicMock()
    client.get = AsyncMock(return_value=limited)

    with patch("app.services.github_service.asyncio.sleep", AsyncMock()):
        with pytest.raises(RuntimeError):
            await github._fetch_single(client, "https://example.test")

    assert client.get.await_count == MAX_RETRIES


@pytest.mark.asyncio
async def test_the_request_semaphore_is_shared_between_instances():
    """The cap is only meaningful if every router's client shares it."""
    assert GithubService()._get_semaphore() is GithubService()._get_semaphore()
