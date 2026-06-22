# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""Help & Support endpoints: static content and system health information."""

from fastapi import APIRouter

from app.core.config import settings
from app.db.mongo import ping_mongo
from app.db.redis import ping_redis

router = APIRouter()

HELP_CONTENT = {
    "faq": [
        {
            "question": "What is the Rocq Platform Release Dashboard?",
            "answer": (
                "The dashboard provides a **real-time overview** of every package "
                "included in a Rocq Platform release. It tracks package status, CI "
                "results, and dependencies so maintainers can quickly identify blockers."
            ),
        },
        {
            "question": "How are package statuses determined?",
            "answer": (
                "Each package status is computed from its **opam lint results**, "
                "**CI pipeline state**, and **dependency readiness**:\n\n"
                "- **Ready** — all checks pass and dependencies are satisfied\n"
                "- **Waiting** — dependencies are not yet ready\n"
                "- **Blocked** — a CI failure or lint error must be resolved\n"
                "- **Disabled** — the package has been excluded from this release"
            ),
        },
        {
            "question": "How often is the data refreshed?",
            "answer": (
                "A **nightly job** runs at 02:00 UTC to refresh all release data from "
                "GitHub. You can also trigger a manual refresh from the dashboard if "
                "needed."
            ),
        },
        {
            "question": "Where does the data come from?",
            "answer": (
                "All data is fetched from the "
                "[rocq-prover/platform](https://github.com/rocq-prover/platform) "
                "GitHub repository, including CI statuses, tracking issues, and "
                "package metadata from opam files."
            ),
        },
        {
            "question": "How can I report a bug or request a feature?",
            "answer": (
                "Open an issue on the project repository or contact the release "
                "maintainer directly. Contributions via pull requests are welcome."
            ),
        },
    ],
    "glossary": [
        {
            "term": "Ready",
            "description": "The package passes all checks and its dependencies are satisfied. It is ready for inclusion in the release.",
            "status": "ready",
        },
        {
            "term": "Waiting",
            "description": "The package itself may be fine, but one or more of its dependencies are not yet ready.",
            "status": "waiting",
        },
        {
            "term": "Blocked",
            "description": "A CI failure, lint error, or unresolved issue prevents the package from being included.",
            "status": "blocked",
        },
        {
            "term": "Disabled",
            "description": "The package has been explicitly excluded from this release cycle by a maintainer.",
            "status": "disabled",
        },
    ],
    "workflow": [
        {
            "step": 1,
            "title": "Package Pick",
            "description": "Select the set of packages to include in the upcoming release based on community needs and maintainer availability.",
        },
        {
            "step": 2,
            "title": "Issue Tracking",
            "description": "Create a tracking issue on GitHub to coordinate work across package maintainers and monitor progress.",
        },
        {
            "step": 3,
            "title": "Development",
            "description": "Package maintainers update their opam files, fix compatibility issues, and submit pull requests.",
        },
        {
            "step": 4,
            "title": "CI Validation",
            "description": "Automated CI pipelines run lint checks, build tests, and dependency resolution for every package.",
        },
        {
            "step": 5,
            "title": "Release",
            "description": "Once all packages are ready, the release is tagged, published, and announced to the community.",
        },
    ],
    "links": [
        {
            "label": "Rocq Platform Repository",
            "url": "https://github.com/rocq-prover/platform",
            "description": "Main GitHub repository for the Rocq Platform release process.",
        },
        {
            "label": "opam Repository",
            "url": "https://opam.ocaml.org",
            "description": "The OCaml package registry where Rocq packages are published.",
        },
        {
            "label": "Rocq Prover",
            "url": "https://rocq-prover.org",
            "description": "Official website of the Rocq interactive theorem prover.",
        },
        {
            "label": "Rocq Documentation",
            "url": "https://rocq-prover.org/doc",
            "description": "Official documentation and reference manual for Rocq.",
        },
    ],
}


@router.get("/")
async def get_help_content():
    """Return static help content (FAQ, glossary, workflow, links)."""
    return HELP_CONTENT


@router.get("/system-info")
async def get_system_info():
    """Return application metadata and service health status."""
    mongo_status = "connected"
    try:
        await ping_mongo()
    except Exception:
        mongo_status = "disconnected"

    redis_status = "connected"
    try:
        await ping_redis()
    except Exception:
        redis_status = "disconnected"

    return {
        "app_name": settings.app_name,
        "version": "0.1.0",
        "services": {
            "mongodb": {"status": mongo_status},
            "redis": {"status": redis_status},
        },
    }
