"""Common test fixtures and configuration for pytest."""

import asyncio
from typing import AsyncGenerator, Generator
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from motor.motor_asyncio import AsyncIOMotorClient
from redis.asyncio import Redis

from app.main import app as main_app
from app.core.auth import create_access_token
from app.core.config import settings


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def app() -> FastAPI:
    """Return the FastAPI application instance for testing."""
    return main_app


@pytest.fixture
async def client(app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """
    Create an async HTTP client for testing API endpoints.

    Use this fixture to make requests to the API in tests.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://testserver"
    ) as ac:
        yield ac


@pytest.fixture
def mock_redis() -> MagicMock:
    """
    Create a mock Redis client for testing.

    Returns a MagicMock that simulates Redis operations.
    """
    redis_mock = MagicMock(spec=Redis)

    # Mock common Redis operations
    redis_mock.get = AsyncMock(return_value=None)
    redis_mock.set = AsyncMock(return_value=True)
    redis_mock.delete = AsyncMock(return_value=1)
    redis_mock.exists = AsyncMock(return_value=0)
    redis_mock.expire = AsyncMock(return_value=True)
    redis_mock.keys = AsyncMock(return_value=[])

    return redis_mock


@pytest.fixture
def mock_mongo() -> MagicMock:
    """
    Create a mock MongoDB client for testing.

    Returns a MagicMock that simulates MongoDB operations.
    """
    mongo_mock = MagicMock(spec=AsyncIOMotorClient)

    # Mock database and collection structure
    db_mock = MagicMock()
    collection_mock = MagicMock()

    # Mock common collection operations
    collection_mock.find_one = AsyncMock(return_value=None)
    collection_mock.find = MagicMock()
    collection_mock.insert_one = AsyncMock()
    collection_mock.update_one = AsyncMock()
    collection_mock.delete_one = AsyncMock()

    db_mock.__getitem__ = MagicMock(return_value=collection_mock)
    mongo_mock.__getitem__ = MagicMock(return_value=db_mock)

    return mongo_mock


@pytest.fixture
def mock_github() -> MagicMock:
    """
    Create a mock GitHub service for testing.

    Returns a MagicMock that simulates GitHub API operations.
    """
    github_mock = MagicMock()

    # Mock common GitHub operations
    github_mock.get_repo = AsyncMock(return_value={
        "name": "test-repo",
        "full_name": "org/test-repo",
        "description": "Test repository",
    })

    github_mock.get_issue = AsyncMock(return_value={
        "number": 1,
        "title": "Test Issue",
        "state": "open",
        "labels": [],
    })

    github_mock.search_issues = AsyncMock(return_value={
        "items": [],
        "total_count": 0,
    })

    github_mock.get_latest_release = AsyncMock(return_value={
        "tag_name": "v1.0.0",
        "name": "Test Release",
        "published_at": "2024-01-15T10:00:00Z",
    })

    return github_mock


@pytest.fixture
def auth_headers() -> dict:
    """
    Create authentication headers with a valid JWT token for testing.

    Use this fixture when testing endpoints that require authentication.
    """
    token = create_access_token({"sub": "testuser", "role": "user"})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_auth_headers() -> dict:
    """
    Create authentication headers with an admin JWT token for testing.

    Use this fixture when testing admin-only endpoints.
    """
    token = create_access_token({"sub": "admin", "role": "admin"})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def mock_release_data() -> dict:
    """
    Create mock release data for testing.

    Returns a complete release object with all required fields.
    """
    return {
        "id": "test-release",
        "name": "Test Release 2024.1",
        "description": "A test release for unit tests",
        "header": {
            "total_packages": 10,
            "ready_packages": 7,
            "waiting_packages": 2,
            "blocked_packages": 1,
            "disabled_packages": 0,
            "progress": 70,
            "ci_status": [],
        },
        "packages": [
            {
                "name": "package-1",
                "pick_version": "1.0.0",
                "opam_version": "1.0.0",
                "git_tag": "v1.0.0",
                "issue_url": "https://github.com/org/repo/issues/1",
                "status": "ready",
                "disabled": False,
            },
            {
                "name": "package-2",
                "pick_version": "2.0.0",
                "opam_version": None,
                "git_tag": None,
                "issue_url": None,
                "status": "waiting",
                "disabled": False,
            },
        ],
        "timeline": [],
        "activity": [],
        "last_refreshed_at": "2024-01-15T10:00:00Z",
    }


@pytest.fixture
def mock_package_data() -> dict:
    """Create mock package data for testing."""
    return {
        "name": "test-package",
        "pick_version": "1.0.0",
        "opam_version": "1.0.0",
        "git_tag": "v1.0.0",
        "issue_url": "https://github.com/org/repo/issues/1",
        "status": "ready",
        "disabled": False,
        "disabled_reason": None,
    }


@pytest.fixture
def mock_user_data() -> dict:
    """Create mock user data for testing."""
    return {
        "username": "testuser",
        "role": "user",
        "hashed_password": "$2b$12$test.hashed.password",
    }


@pytest.fixture(autouse=True)
def reset_mocks():
    """Automatically reset all mocks after each test."""
    yield
    # Cleanup happens automatically via pytest
