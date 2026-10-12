"""Tests for dynamic release-cycle discovery."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.release_cache_service import (
    _compute_releases,
    _deep_merge,
    _find_package_pick,
    _get_release_params,
    _normalise_rocq_version,
    _parse_package_pick_file,
    _read_modify_write,
    _release_package_pick_references,
    refresh_releases,
)


def github_release(
    tag: str,
    name: str,
    *,
    draft: bool = False,
    prerelease: bool = False,
) -> dict:
    return {
        "tag_name": tag,
        "name": name,
        "body": "",
        "published_at": "2026-07-30T13:01:00Z",
        "created_at": "2026-07-30T12:00:00Z",
        "draft": draft,
        "prerelease": prerelease,
    }


def github_with(releases: list[dict], picks: list[str]) -> MagicMock:
    github = MagicMock()
    github.get_releases = AsyncMock(return_value=releases)
    github.list_directory = AsyncMock(
        return_value=[{"name": filename} for filename in picks]
    )
    github.get_repo = AsyncMock(
        return_value={
            "default_branch": "main",
            "full_name": "rocq-prover/platform",
        }
    )
    return github


@pytest.mark.asyncio
async def test_final_pick_does_not_create_in_progress_release():
    final = github_release(
        "2026.07.0",
        "2026.07.0 with latest pick 9.1.0~2026.01",
    )
    prerelease = github_release(
        "2026.08.0-rc1",
        "Release candidate with latest pick 9.2~2026.08",
        prerelease=True,
    )
    github = github_with(
        [prerelease, final],
        ["package-pick-9.0~2025.08.sh", "package-pick-9.1~2026.01.sh"],
    )

    releases = await _compute_releases(github)

    assert [release["id"] for release in releases] == ["2026.07.0"]
    assert releases[0]["status"] == "released"


@pytest.mark.asyncio
async def test_new_package_pick_becomes_in_progress_release():
    final = github_release(
        "2026.07.0",
        "2026.07.0 with latest pick 9.1.0~2026.01",
    )
    github = github_with(
        [final],
        ["package-pick-9.1~2026.01.sh", "package-pick-9.2~2026.09.sh"],
    )

    releases = await _compute_releases(github)

    assert [release["id"] for release in releases] == [
        "in-progress",
        "2026.07.0",
    ]
    assert releases[0]["name"] == "Rocq 9.2 (In Progress)"
    assert releases[0]["status"] == "in_progress"


@pytest.mark.asyncio
async def test_published_release_uses_pick_named_in_release_title():
    release = github_release(
        "2026.07.0",
        "2026.07.0 with latest pick 9.1.0~2026.01",
    )
    github = github_with(
        [release],
        ["package-pick-9.1~2026.01.sh"],
    )

    package_pick = await _find_package_pick(release, github)

    assert package_pick == ("package-pick-9.1~2026.01", "Rocq 9.1")


@pytest.mark.asyncio
async def test_release_params_are_discovered_from_current_pick():
    final = github_release(
        "2026.07.0",
        "2026.07.0 with latest pick 9.1.0~2026.01",
    )
    github = github_with(
        [final],
        ["package-pick-9.1~2026.01.sh", "package-pick-9.2~2026.09.sh"],
    )

    params = await _get_release_params("in-progress", github)

    assert params == ("package-pick-9.2~2026.09", "Rocq 9.2", "main")


@pytest.mark.asyncio
async def test_release_list_cache_has_a_ttl():
    final = github_release(
        "2026.07.0",
        "2026.07.0 with latest pick 9.1.0~2026.01",
    )
    github = github_with([final], ["package-pick-9.1~2026.01.sh"])
    redis = MagicMock()
    redis.set = AsyncMock(return_value=True)

    with (
        patch("app.services.release_cache_service.redis_client", redis),
        patch(
            "app.services.release_cache_service._clear_github_cache",
            new=AsyncMock(),
        ),
    ):
        await refresh_releases(github)

    assert redis.set.await_count == 2
    assert all(call.kwargs["ex"] == 1800 for call in redis.set.await_args_list)


@pytest.mark.asyncio
async def test_zone_refresh_keeps_the_expiry_of_the_cached_release():
    """A zone refresh must not turn the in-progress cache into a permanent entry."""
    redis = MagicMock()
    redis.get = AsyncMock(return_value='{"timeline": []}')
    redis.exists = AsyncMock(return_value=1)
    redis.set = AsyncMock(return_value=True)

    with patch("app.services.release_cache_service.redis_client", redis):
        await _read_modify_write("in-progress", {"timeline": [{"label": "RC"}]})

    assert redis.set.await_count == 2
    assert all(
        call.kwargs == {"keepttl": True} for call in redis.set.await_args_list
    )


@pytest.mark.asyncio
async def test_zone_refresh_applies_a_ttl_when_no_entry_exists_yet():
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    redis.exists = AsyncMock(return_value=0)
    redis.set = AsyncMock(return_value=True)

    with patch("app.services.release_cache_service.redis_client", redis):
        await _read_modify_write("in-progress", {"timeline": []})

    assert redis.set.await_count == 2
    assert all(call.kwargs["ex"] == 21600 for call in redis.set.await_args_list)


# ------------------------------------------------------------------
#  Pick file naming and release cross-referencing
# ------------------------------------------------------------------


def test_three_part_rocq_versions_normalise_to_the_pick_format():
    """Release notes say "9.1.0" where pick filenames say "9.1"."""
    assert _normalise_rocq_version("9.1.0") == "9.1"
    assert _normalise_rocq_version("9.1") == "9.1"


def test_a_dated_stable_pick_filename_is_parsed():
    pick = _parse_package_pick_file({"name": "package-pick-9.1.0~2026.01.sh"})

    assert pick is not None
    assert pick["name"] == "package-pick-9.1.0~2026.01"
    assert pick["key"] == ("9.1", "2026.01")


def test_non_pick_files_are_ignored():
    """The directory also holds undated and unrelated files."""
    assert _parse_package_pick_file({"name": "package-pick-9.1~dev.sh"}) is None
    assert _parse_package_pick_file({"name": "README.md"}) is None
    assert _parse_package_pick_file({}) is None


def test_a_pick_named_in_a_release_body_is_detected():
    references = _release_package_pick_references(
        [{"name": "2026.01.0", "body": "built from 9.1.0~2026.01", "tag_name": ""}]
    )

    assert ("9.1", "2026.01") in references


def test_release_fields_that_are_none_do_not_break_detection():
    assert _release_package_pick_references([{"name": None, "body": None}]) == set()


# ------------------------------------------------------------------
#  Zone patch merging
# ------------------------------------------------------------------


def test_nested_dicts_are_merged_not_replaced():
    """A header patch must not wipe the package count held in the same dict."""
    base = {"summary": {"packages": 42, "ready": 1}, "ci_status": []}

    merged = _deep_merge(base, {"summary": {"ready": 7}})

    assert merged["summary"] == {"packages": 42, "ready": 7}


def test_lists_are_overwritten_wholesale():
    base = {"timeline": [{"label": "old"}]}

    merged = _deep_merge(base, {"timeline": [{"label": "new"}]})

    assert merged["timeline"] == [{"label": "new"}]
