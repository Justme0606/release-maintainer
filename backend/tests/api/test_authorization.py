"""Tests for route-level authentication and role enforcement."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_protected_route_rejects_an_anonymous_caller(client: AsyncClient):
    response = await client.get("/api/releases/")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_route_rejects_a_maintainer(auth_client: AsyncClient):
    """``require_admin`` must distinguish roles, not just authentication."""
    response = await auth_client.get("/api/admin/users")

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_route_accepts_an_admin(admin_client: AsyncClient):
    response = await admin_client.get("/api/admin/users")

    assert response.status_code == 200
