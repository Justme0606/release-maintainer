# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""Admin-only endpoints for managing releases and users."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import re
import subprocess
import httpx
from datetime import datetime, timezone

from app.core.auth import require_admin
from app.core.config import settings
from app.repositories.release_repository import (
    get_release_by_id,
    list_releases,
    upsert_release,
)
from app.repositories.user_repository import list_users
from app.db.mongo import database

router = APIRouter()


class ReleaseCreate(BaseModel):
    """Payload for creating or updating a release."""

    id: str | None = None
    name: str
    description: str | None = None
    status: str | None = "draft"


def generate_release_id(name: str) -> str:
    """Generate a URL-friendly ID from release name."""
    # Convert to lowercase and replace spaces/special chars with hyphens
    slug = re.sub(r'[^\w\s-]', '', name.lower())
    slug = re.sub(r'[-\s]+', '-', slug).strip('-')
    # Add timestamp to ensure uniqueness
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"{slug}-{timestamp}"


async def get_git_changelog() -> str:
    """Generate changelog from git commits since last release using GitHub API."""
    repo_owner = "rocq-prover"
    repo_name = "platform"
    github_api_base = "https://api.github.com"

    try:
        async with httpx.AsyncClient() as client:
            # Get the latest release (not just any tag, but actual releases)
            releases_url = f"{github_api_base}/repos/{repo_owner}/{repo_name}/releases"
            releases_response = await client.get(releases_url, timeout=10.0)
            releases_response.raise_for_status()
            releases = releases_response.json()

            if not releases or len(releases) == 0:
                # No releases found, get recent commits
                commits_url = f"{github_api_base}/repos/{repo_owner}/{repo_name}/commits"
                commits_response = await client.get(
                    commits_url,
                    params={"per_page": 50},
                    timeout=10.0
                )
                commits_response.raise_for_status()
                commits = commits_response.json()
            else:
                # Get the most recent release tag (format: YYYY.MM.PATCH)
                last_release_tag = releases[0]["tag_name"]

                # Compare last release tag with main branch
                compare_url = f"{github_api_base}/repos/{repo_owner}/{repo_name}/compare/{last_release_tag}...main"
                compare_response = await client.get(compare_url, timeout=10.0)
                compare_response.raise_for_status()
                compare_data = compare_response.json()
                commits = compare_data.get("commits", [])

            if not commits:
                return "No changes since last release."

            # Format changelog
            changelog_lines = []
            for commit in commits:
                message = commit["commit"]["message"].split("\n")[0]  # First line only
                sha_short = commit["sha"][:7]
                # Skip merge commits
                if not message.lower().startswith("merge"):
                    changelog_lines.append(f"- {message} ({sha_short})")

            if not changelog_lines:
                return "No changes since last release."

            return "\n".join(changelog_lines)

    except httpx.HTTPError as e:
        return f"Error fetching changelog from GitHub: {str(e)}"
    except Exception as e:
        return f"Error: {str(e)}"


@router.get("/releases/draft-template", dependencies=[Depends(require_admin)])
async def get_draft_template():
    """Get a pre-filled template for creating a draft release."""
    now = datetime.now(timezone.utc)
    version = f"{now.year}.{now.month:02d}.0"
    rocq_version = "9.1.0"

    # Generate title
    title = f"{version} with latest pick {rocq_version}~{now.year}.{now.month:02d}"

    # Generate changelog
    changelog = await get_git_changelog()

    # Generate description template
    description = f"""## Recommended binary installers
- Windows (64-bit) installer for Rocq {rocq_version}
- macOS (ARM) installer for Rocq {rocq_version}

**Note:** Snap is no longer supported (a replacement is in progress).

## General information
See [README](https://github.com/rocq-prover/platform/blob/main/README.md) for general information and installation instructions.
See [Charter](https://github.com/rocq-prover/platform/blob/main/charter.md) for the concept and goals of Rocq Platform.
See [CEP52](https://github.com/coq/ceps/blob/master/text/052-platform.md) for the Rocq and Rocq Platform release cycle.
See [macOS](https://github.com/rocq-prover/platform/blob/main/doc/README-macOS.md), [Linux](https://github.com/rocq-prover/platform/blob/main/doc/README-Linux.md), and [Windows](https://github.com/rocq-prover/platform/blob/main/doc/README-Windows.md) for detailed installation and usage instructions.

## Major enhancements
None.

## Changelog

{changelog}

## Included Versions of Coq

### Recommended Rocq version
- Rocq {rocq_version} with the first package collection from [Month Year]

### Compatibility Coq versions
The compatibility versions are intended to help porting packages from an older to the latest release. They can be installed in parallel with other versions of Coq (Coq Platform will create separate opam switches for each Coq version).

- Coq 8.20.1 with the first package collection from January 2025
- Coq 8.19.2 with the first package collection from October 2024
- Coq 8.18.0 with the first package collection from November 2023
- Coq 8.17.1 with the first package collection from August 2023
- Coq 8.16.1 with an updated package collection from August 2023 which is as much as possible compatible with the first 8.17.1 package collection
- Coq 8.16.1 with the first package collection from September 2022
- Coq 8.15.2 with an updated package collection from September 2022 which is as much as possible compatible with the first 8.16.1 package collection
- Coq 8.15.2 with the first package collection from April 2022
- Coq 8.14.1 with an updated package collection from April 2022 which is as much as possible compatible with the first 8.15.2 package collection
- Coq 8.14.1 with the first package collection from January 2022
- Coq 8.13.2 with an updated package collection from January 2022 which is as much as possible compatible with the first 8.14.1 package collection
- Coq 8.13.2 with an updated package collection from September 2021
- Coq 8.13.2 with the original package collection from February 2021
- Coq 8.12.2 with the same package collection as the 8.12.2 Coq Platform release

## Notes
Binary installers are provided for Rocq {rocq_version}. The installer for macOS (Apple Silicon) and Windows can be downloaded above.
"""

    return {
        "title": title,
        "description": description,
        "suggested_version": version
    }


@router.post("/releases", dependencies=[Depends(require_admin)])
async def create_release(payload: ReleaseCreate):
    """Create a new draft release on GitHub rocq-prover/platform."""
    if not settings.github_token:
        raise HTTPException(
            status_code=500,
            detail="GitHub token not configured. Please set GITHUB_TOKEN in .env"
        )

    repo_owner = "rocq-prover"
    repo_name = "platform"
    github_api_base = "https://api.github.com"

    # Extract tag name from the title (format: "YYYY.MM.PATCH with latest pick...")
    # For draft, we don't create the tag yet, but we need to specify it
    tag_name = payload.name.split(" ")[0]  # Get "YYYY.MM.PATCH" from title

    try:
        async with httpx.AsyncClient() as client:
            # Create draft release on GitHub
            create_release_url = f"{github_api_base}/repos/{repo_owner}/{repo_name}/releases"

            release_payload = {
                "tag_name": tag_name,
                "name": payload.name,
                "body": payload.description or "",
                "draft": True,
                "prerelease": False
            }

            headers = {
                "Authorization": f"Bearer {settings.github_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"
            }

            response = await client.post(
                create_release_url,
                json=release_payload,
                headers=headers,
                timeout=10.0
            )

            if response.status_code == 422:
                error_data = response.json()
                if "already_exists" in str(error_data):
                    raise HTTPException(
                        status_code=409,
                        detail=f"Release with tag {tag_name} already exists on GitHub"
                    )
                raise HTTPException(status_code=422, detail=error_data)

            response.raise_for_status()
            github_release = response.json()

            return {
                "id": github_release["id"],
                "tag_name": github_release["tag_name"],
                "name": github_release["name"],
                "html_url": github_release["html_url"],
                "draft": github_release["draft"],
                "created_at": github_release["created_at"]
            }

    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create GitHub release: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/releases/{release_id}", dependencies=[Depends(require_admin)])
async def update_release(release_id: str, payload: ReleaseCreate):
    """Update an existing release."""
    existing = await get_release_by_id(release_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Release not found")
    data = payload.model_dump()
    data["id"] = release_id
    release = await upsert_release(data)
    return release


@router.delete("/releases/{release_id}", dependencies=[Depends(require_admin)])
async def delete_release(release_id: str):
    """Delete a release."""
    existing = await get_release_by_id(release_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Release not found")
    await database["releases"].delete_one({"id": release_id})
    return {"detail": "Deleted"}


@router.get("/users", dependencies=[Depends(require_admin)])
async def get_users():
    """List all user accounts (admin only)."""
    users = list_users()
    return users
