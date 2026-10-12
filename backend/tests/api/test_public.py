"""Tests for the unauthenticated public endpoints."""

from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_release_status_reports_progress_from_the_summary(client):
    """The progress bar reads the ``packages`` count produced by the cache."""
    release = {
        "name": "Rocq 9.2 (In Progress)",
        "summary": {
            "packages": 8,
            "ready": 2,
            "waiting": 6,
            "blocked": 0,
            "disabled": 0,
        },
    }

    with patch(
        "app.api.public.peek_cached_release",
        new=AsyncMock(return_value=release),
    ):
        response = await client.get("/api/public/release-status")

    assert response.status_code == 200
    assert response.json() == {
        "name": "Rocq 9.2 (In Progress)",
        "total": 8,
        "ready": 2,
        "progress": 25.0,
    }


@pytest.mark.asyncio
async def test_release_status_when_no_cycle_is_in_progress(client):
    with patch(
        "app.api.public.peek_cached_release",
        new=AsyncMock(return_value=None),
    ):
        response = await client.get("/api/public/release-status")

    assert response.status_code == 200
    assert response.json() == {
        "name": None,
        "total": 0,
        "ready": 0,
        "progress": 0,
    }
