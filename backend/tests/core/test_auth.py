"""Tests for core authentication functions."""

import pytest
import bcrypt
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from fastapi import HTTPException

from app.core.auth import verify_password, create_access_token, get_current_user
from app.core.config import settings


class TestVerifyPassword:
    """Tests for password verification."""

    def test_verify_correct_password(self):
        """Test password verification with correct password."""
        plain_password = "securepassword123"
        hashed = bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt())

        assert verify_password(plain_password, hashed.decode("utf-8")) is True

    def test_verify_incorrect_password(self):
        """Test password verification with incorrect password."""
        plain_password = "securepassword123"
        wrong_password = "wrongpassword"
        hashed = bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt())

        assert verify_password(wrong_password, hashed.decode("utf-8")) is False

    def test_verify_empty_password(self):
        """Test password verification with empty password."""
        hashed = bcrypt.hashpw("password".encode("utf-8"), bcrypt.gensalt())

        assert verify_password("", hashed.decode("utf-8")) is False

    def test_verify_with_known_hash(self):
        """Test password verification with a known bcrypt hash."""
        # Pre-computed hash for "password123"
        known_hash = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5TBL1aWXb0fZa"

        assert verify_password("password123", known_hash) is True
        assert verify_password("wrongpassword", known_hash) is False


class TestCreateAccessToken:
    """Tests for JWT token creation."""

    def test_create_token_basic(self):
        """Test creating a basic JWT token."""
        data = {"sub": "testuser", "role": "user"}
        token = create_access_token(data)

        assert isinstance(token, str)
        assert len(token) > 0

        # Decode and verify
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm]
        )
        assert payload["sub"] == "testuser"
        assert payload["role"] == "user"
        assert "exp" in payload

    def test_create_token_expiration(self):
        """Test that token includes correct expiration time."""
        data = {"sub": "testuser"}
        before = datetime.now(timezone.utc)
        token = create_access_token(data)
        after = datetime.now(timezone.utc)

        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm]
        )

        exp_time = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        expected_min = before + timedelta(minutes=settings.jwt_expire_minutes)
        expected_max = after + timedelta(minutes=settings.jwt_expire_minutes)

        assert expected_min <= exp_time <= expected_max

    def test_create_token_preserves_data(self):
        """Test that token preserves all provided data."""
        data = {
            "sub": "testuser",
            "role": "admin",
            "custom_field": "custom_value"
        }
        token = create_access_token(data)

        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm]
        )

        assert payload["sub"] == "testuser"
        assert payload["role"] == "admin"
        assert payload["custom_field"] == "custom_value"

    def test_create_token_does_not_modify_input(self):
        """Test that creating a token doesn't modify input dict."""
        data = {"sub": "testuser"}
        original_data = data.copy()

        create_access_token(data)

        assert data == original_data
        assert "exp" not in data


@pytest.mark.asyncio
class TestGetCurrentUser:
    """Tests for get_current_user dependency."""

    async def test_get_current_user_valid_token(self):
        """Test getting current user with valid token."""
        from unittest.mock import MagicMock

        # Create a valid token
        token = create_access_token({"sub": "testuser", "role": "user"})

        # Mock request with token in cookies
        request = MagicMock()
        request.cookies.get.return_value = token

        user = await get_current_user(request)

        assert user["username"] == "testuser"
        assert user["role"] == "user"

    async def test_get_current_user_no_token(self):
        """Test getting current user without token."""
        from unittest.mock import MagicMock

        # Mock request without token
        request = MagicMock()
        request.cookies.get.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Not authenticated"

    async def test_get_current_user_invalid_token(self):
        """Test getting current user with invalid token."""
        from unittest.mock import MagicMock

        # Mock request with invalid token
        request = MagicMock()
        request.cookies.get.return_value = "invalid.token.here"

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid token"

    async def test_get_current_user_expired_token(self):
        """Test getting current user with expired token."""
        from unittest.mock import MagicMock

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

        # Mock request with expired token
        request = MagicMock()
        request.cookies.get.return_value = expired_token

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid token"

    async def test_get_current_user_missing_sub(self):
        """Test getting current user with token missing 'sub' claim."""
        from unittest.mock import MagicMock

        # Create token without 'sub'
        payload = {
            "role": "user",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=30)
        }
        invalid_token = jwt.encode(
            payload,
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm
        )

        # Mock request with invalid token
        request = MagicMock()
        request.cookies.get.return_value = invalid_token

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid token"

    async def test_get_current_user_with_additional_claims(self):
        """Test getting current user with extra claims in token."""
        from unittest.mock import MagicMock

        # Create token with extra claims
        token = create_access_token({
            "sub": "testuser",
            "role": "admin",
            "extra": "data"
        })

        # Mock request
        request = MagicMock()
        request.cookies.get.return_value = token

        user = await get_current_user(request)

        # Should only return username and role
        assert user["username"] == "testuser"
        assert user["role"] == "admin"
