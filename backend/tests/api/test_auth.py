"""Tests for authentication endpoints."""

import pytest
from unittest.mock import patch, MagicMock
from httpx import AsyncClient
from fastapi import FastAPI

from app.core.auth import create_access_token


@pytest.mark.asyncio
class TestLogin:
    """Tests for POST /api/auth/login endpoint."""

    async def test_login_success(self, client: AsyncClient):
        """Test successful login with valid credentials."""
        mock_user = {
            "username": "testuser",
            "role": "user",
            "hashed_password": "$2b$12$ZuYCJAzbCcz5VwAdIDDw5O5QKpIX3OdDDXBPJK131KLQDhVrU.6Km"  # "password123"
        }

        with patch("app.api.auth.get_user_by_username", return_value=mock_user):
            response = await client.post(
                "/api/auth/login",
                json={"username": "testuser", "password": "password123"}
            )

        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"
        assert data["role"] == "user"
        assert "access_token" in response.cookies

    async def test_login_invalid_username(self, client: AsyncClient):
        """Test login with non-existent username."""
        with patch("app.api.auth.get_user_by_username", return_value=None):
            response = await client.post(
                "/api/auth/login",
                json={"username": "nonexistent", "password": "password"}
            )

        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid credentials"

    async def test_login_invalid_password(self, client: AsyncClient):
        """Test login with incorrect password."""
        mock_user = {
            "username": "testuser",
            "role": "user",
            "hashed_password": "$2b$12$ZuYCJAzbCcz5VwAdIDDw5O5QKpIX3OdDDXBPJK131KLQDhVrU.6Km"
        }

        with patch("app.api.auth.get_user_by_username", return_value=mock_user):
            response = await client.post(
                "/api/auth/login",
                json={"username": "testuser", "password": "wrongpassword"}
            )

        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid credentials"

    async def test_login_missing_fields(self, client: AsyncClient):
        """Test login with missing required fields."""
        response = await client.post(
            "/api/auth/login",
            json={"username": "testuser"}
        )

        assert response.status_code == 422  # Validation error

    async def test_login_sets_cookie(self, client: AsyncClient):
        """Test that login sets httponly cookie."""
        mock_user = {
            "username": "testuser",
            "role": "user",
            "hashed_password": "$2b$12$ZuYCJAzbCcz5VwAdIDDw5O5QKpIX3OdDDXBPJK131KLQDhVrU.6Km"
        }

        with patch("app.api.auth.get_user_by_username", return_value=mock_user):
            response = await client.post(
                "/api/auth/login",
                json={"username": "testuser", "password": "password123"}
            )

        cookie = response.cookies.get("access_token")
        assert cookie is not None
        assert len(cookie) > 0


@pytest.mark.asyncio
class TestLogout:
    """Tests for POST /api/auth/logout endpoint."""

    async def test_logout_success(self, client: AsyncClient):
        """Test successful logout."""
        response = await client.post("/api/auth/logout")

        assert response.status_code == 200
        assert response.json()["detail"] == "Logged out"

        # Check that cookie is deleted
        cookie = response.cookies.get("access_token")
        # Deleted cookies have empty value or max-age=0
        set_cookie_header = str(response.headers.get("set-cookie", "")).lower()
        assert cookie == "" or "max-age=0" in set_cookie_header

    async def test_logout_without_session(self, client: AsyncClient):
        """Test logout when no session exists."""
        response = await client.post("/api/auth/logout")

        # Should still succeed
        assert response.status_code == 200


@pytest.mark.asyncio
class TestMe:
    """Tests for GET /api/auth/me endpoint."""

    async def test_me_authenticated(self, client: AsyncClient, auth_headers: dict):
        """Test /me endpoint with valid authentication."""
        # Create a valid token
        token = create_access_token({"sub": "testuser", "role": "user"})

        response = await client.get(
            "/api/auth/me",
            cookies={"access_token": token}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"
        assert data["role"] == "user"

    async def test_me_unauthenticated(self, client: AsyncClient):
        """Test /me endpoint without authentication."""
        response = await client.get("/api/auth/me")

        assert response.status_code == 401
        assert response.json()["detail"] == "Not authenticated"

    async def test_me_invalid_token(self, client: AsyncClient):
        """Test /me endpoint with invalid token."""
        response = await client.get(
            "/api/auth/me",
            cookies={"access_token": "invalid.token.here"}
        )

        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid token"

    async def test_me_expired_token(self, client: AsyncClient):
        """Test /me endpoint with expired token."""
        from datetime import datetime, timedelta, timezone
        from jose import jwt
        from app.core.config import settings

        # Create an expired token
        expired_time = datetime.now(timezone.utc) - timedelta(hours=1)
        payload = {
            "sub": "testuser",
            "role": "user",
            "exp": expired_time
        }
        expired_token = jwt.encode(
            payload,
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm
        )

        response = await client.get(
            "/api/auth/me",
            cookies={"access_token": expired_token}
        )

        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid token"

    async def test_me_token_without_sub(self, client: AsyncClient):
        """Test /me endpoint with token missing 'sub' claim."""
        from jose import jwt
        from app.core.config import settings
        from datetime import datetime, timedelta, timezone

        # Create token without 'sub' field
        payload = {
            "role": "user",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=30)
        }
        invalid_token = jwt.encode(
            payload,
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm
        )

        response = await client.get(
            "/api/auth/me",
            cookies={"access_token": invalid_token}
        )

        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid token"


@pytest.mark.asyncio
class TestAuthIntegration:
    """Integration tests for authentication flow."""

    async def test_full_auth_flow(self, client: AsyncClient):
        """Test complete authentication flow: login -> access protected endpoint -> logout."""
        mock_user = {
            "username": "testuser",
            "role": "user",
            "hashed_password": "$2b$12$ZuYCJAzbCcz5VwAdIDDw5O5QKpIX3OdDDXBPJK131KLQDhVrU.6Km"
        }

        # Step 1: Login
        with patch("app.api.auth.get_user_by_username", return_value=mock_user):
            login_response = await client.post(
                "/api/auth/login",
                json={"username": "testuser", "password": "password123"}
            )

        assert login_response.status_code == 200
        token = login_response.cookies.get("access_token")
        assert token is not None

        # Step 2: Access protected endpoint
        me_response = await client.get(
            "/api/auth/me",
            cookies={"access_token": token}
        )

        assert me_response.status_code == 200
        assert me_response.json()["username"] == "testuser"

        # Step 3: Logout
        logout_response = await client.post("/api/auth/logout")

        assert logout_response.status_code == 200

        # Step 4: Try to access protected endpoint after logout
        # Note: In a real scenario, the cookie would be deleted on the client side
        # Here we're just verifying the logout endpoint works
