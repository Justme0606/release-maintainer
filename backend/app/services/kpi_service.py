# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
"""KPI computation service for release package status tracking."""

import asyncio
import json
import logging
import re
from datetime import date, datetime, timedelta

import httpx

from app.core.config import settings
from app.db.redis import redis_client
from app.services.github_service import GithubService

logger = logging.getLogger(__name__)

# Target GitHub repository
OWNER = "rocq-prover"
REPO = "platform"


def _add_business_days(start: date, days: int) -> date:
    """Add (or subtract) *days* business days (Mon-Fri) from *start*."""
    current = start
    added = 0
    step = 1 if days >= 0 else -1
    target = abs(days)
    while added < target:
        current += timedelta(days=step)
        if current.weekday() < 5:  # Mon=0 … Fri=4
            added += 1
    return current


def _parse_package_pick(content: str) -> list[dict]:
    """Parse a package-pick shell file and return package dicts.

    Only includes packages after the "FULL" COQ PLATFORM PACKAGES section,
    skipping base/IDE packages.  Also captures commented-out packages and
    packages inside ``if false`` blocks, marking them as ``disabled``.
    """
    packages: list[dict] = []
    in_full_section = False
    in_disabled_block = False

    for line in content.splitlines():
        stripped = line.strip()

        # Start collecting only after the FULL section marker
        if '"FULL" COQ PLATFORM PACKAGES' in stripped:
            in_full_section = True
            continue
        if not in_full_section:
            continue

        # Track ``if false`` … ``fi`` blocks (disabled at shell level)
        if stripped == "if false":
            in_disabled_block = True
            continue
        if stripped == "fi" and in_disabled_block:
            in_disabled_block = False
            continue

        # Determine if line is disabled (commented out or inside if-false)
        disabled = in_disabled_block
        work_line = stripped
        comment: str | None = None

        if work_line.startswith("#"):
            disabled = True
            work_line = work_line.lstrip("#").strip()

        # Look for the PACKAGES pattern anywhere in the line
        match = re.search(r'PACKAGES="\$\{PACKAGES\}\s+(.*?)"', work_line)
        if not match:
            continue

        # Extract trailing comment (e.g. ``# error with unicoq``)
        if disabled:
            after = work_line[match.end():]
            cm = re.search(r"#\s*(.*)", after)
            if cm:
                comment = cm.group(1).strip() or None

        for token in match.group(1).strip().split():
            # name.version — split at the first dot
            dot = token.find(".")
            if dot == -1:
                continue
            name = token[:dot]
            version = token[dot + 1:]
            packages.append({
                "name": name,
                "version": version,
                "disabled": disabled,
                "comment": comment,
            })
    return packages


def _normalize_pkg_name(name: str) -> str:
    """Strip common prefixes and lowercase for case-insensitive matching."""
    name = name.lower()
    for prefix in ("coq-mathcomp-", "rocq-mathcomp-", "coq-", "rocq-"):
        if name.startswith(prefix):
            return name[len(prefix):]
    return name


# Limit concurrent ``opam`` subprocess invocations
MAX_CONCURRENT_OPAM = 8


class KpiService:
    """Service that computes all KPIs and dashboard data for a release.

    Orchestrates data from the package-pick file, the GitHub tracking issue,
    the opam CLI, and CI workflow runs.
    """

    def __init__(self, github: GithubService):
        self.github = github
        self._opam_semaphore: asyncio.Semaphore | None = None

    def _get_opam_semaphore(self) -> asyncio.Semaphore:
        """Lazily create a semaphore to cap concurrent opam subprocesses."""
        if self._opam_semaphore is None:
            self._opam_semaphore = asyncio.Semaphore(MAX_CONCURRENT_OPAM)
        return self._opam_semaphore

    # ------------------------------------------------------------------
    #  opam CLI helpers
    # ------------------------------------------------------------------

    async def _run_opam_list(self, *extra_args: str) -> list[str]:
        """Run ``opam list`` and return package names."""
        async with self._get_opam_semaphore():
            try:
                proc = await asyncio.create_subprocess_exec(
                    "opam", "list", "--columns=name", "-s", *extra_args,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
                if proc.returncode != 0:
                    return []
                return [l.strip() for l in stdout.decode().splitlines() if l.strip()]
            except Exception as exc:
                logger.warning("opam list %s failed: %s", extra_args, exc)
                return []

    async def run_opam_show(self, package_name: str) -> dict:
        """Run ``opam show`` and return parsed metadata fields."""
        fields = "maintainer,authors,synopsis,description,homepage,version,license,bug-reports,dev-repo"
        async with self._get_opam_semaphore():
            try:
                proc = await asyncio.create_subprocess_exec(
                    "opam", "show", package_name, f"--field={fields}",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
                if proc.returncode != 0:
                    return {}

                result: dict[str, str] = {}
                current_key = None
                for line in stdout.decode().splitlines():
                    if not line.strip():
                        continue
                    match = re.match(r"^(\S[\w-]*)\s+(.*)", line)
                    if match:
                        current_key = match.group(1)
                        val = match.group(2).strip().strip('"')
                        if current_key in result:
                            result[current_key] += "\n" + val
                        else:
                            result[current_key] = val
                    elif current_key and line.startswith(" "):
                        result[current_key] += "\n" + line.strip().strip('"')

                return result
            except Exception as exc:
                logger.warning("opam show %s failed: %s", package_name, exc)
                return {}

    async def _run_opam_show_field(self, package_name: str, field: str) -> str:
        """Run ``opam show PKG --field=FIELD`` and return the value."""
        async with self._get_opam_semaphore():
            try:
                proc = await asyncio.create_subprocess_exec(
                    "opam", "show", package_name, f"--field={field}",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
                if proc.returncode != 0:
                    return ""
                return stdout.decode().strip().strip('"')
            except Exception:
                return ""

    async def _build_opam_info_map(
        self, pkg_names: list[str]
    ) -> dict[str, dict[str, str]]:
        """Fetch version and dev-repo for all packages via ``opam show``.

        Returns ``{pkg_name: {"version": ..., "dev_repo": ...}}``.
        """
        async def _fetch_one(name: str) -> tuple[str, dict[str, str]]:
            version, dev_repo = await asyncio.gather(
                self._run_opam_show_field(name, "version"),
                self._run_opam_show_field(name, "dev-repo"),
            )
            return name, {"version": version, "dev_repo": dev_repo}

        results = await asyncio.gather(*[_fetch_one(n) for n in pkg_names])
        return {name: info for name, info in results}

    # ------------------------------------------------------------------
    #  Full release dependency graph
    # ------------------------------------------------------------------

    async def compute_dependency_graph(
        self, package_pick_name: str, release_version: str
    ) -> dict:
        """Build the complete dependency DAG for every package in the pick.

        For each pick package, runs ``opam list --required-by=PKG.VER``
        (non-recursive) to get its **direct** dependencies, then filters
        to only those that are also in the pick.

        Returns ``{nodes: [...], edges: [...]}`` where:
        - each node has ``{name, status, depth}``
        - each edge is ``{from, to}`` (from depends on to)
        - depth is the topological column (0 = leaves, max = roots)
        """
        packages_list = await self._build_package_list(
            package_pick_name, release_version
        )
        # Only include active (non-disabled) packages in the dependency graph
        active_packages = [p for p in packages_list if not p.get("disabled")]
        pick_map = {p["name"]: p for p in active_packages}
        pick_names = set(pick_map.keys())

        # Fetch direct deps for every pick package concurrently
        async def _get_direct_deps(pkg: dict) -> tuple[str, list[str]]:
            ref = f"{pkg['name']}.{pkg['pick_version']}"
            raw = await self._run_opam_list("--required-by", ref)
            internal = [d for d in raw if d in pick_names and d != pkg["name"]]
            return pkg["name"], internal

        results = await asyncio.gather(
            *[_get_direct_deps(p) for p in active_packages]
        )

        # Build adjacency: children[A] = {B,C} means A depends on B, C
        children: dict[str, set[str]] = {p["name"]: set() for p in packages_list}
        edges: list[dict] = []
        for pkg_name, deps in results:
            for dep in deps:
                children[pkg_name].add(dep)
                edges.append({"from": pkg_name, "to": dep})

        # Compute depth via longest-path-to-leaf (leaves = depth 0)
        depths: dict[str, int] = {}

        def _depth(name: str) -> int:
            if name in depths:
                return depths[name]
            depths[name] = 0  # cycle guard
            kids = children.get(name, set())
            if kids:
                depths[name] = 1 + max(_depth(c) for c in kids)
            return depths[name]

        for n in pick_names:
            _depth(n)

        nodes = []
        for p in active_packages:
            nodes.append({
                "name": p["name"],
                "status": p["status"],
                "depth": depths.get(p["name"], 0),
            })

        return {"nodes": nodes, "edges": edges}

    # ------------------------------------------------------------------
    #  Public zone computation methods
    # ------------------------------------------------------------------

    async def compute_summary(
        self,
        package_pick_name: str,
        release_version: str,
        branch: str,
    ) -> dict:
        """Compute the full dashboard summary (all zones combined)."""
        packages_list = await self._build_package_list(
            package_pick_name, release_version
        )
        ready, waiting, blocked, disabled = self._count_package_statuses(packages_list)

        ci_status = await self._get_ci_status(branch)
        open_issues = await self._count_open_issues()
        open_pull_requests = await self._count_open_pull_requests()
        timeline = await self._compute_timeline()
        recent_activity = await self._compute_recent_activity(branch)
        issues_by_state = await self._compute_issues_by_state()
        builds_summary = await self._compute_builds_summary()

        return {
            "packages": len(packages_list),
            "packages_list": packages_list,
            "ready": ready,
            "waiting": waiting,
            "blocked": blocked,
            "disabled": disabled,
            "ci_status": ci_status,
            "open_issues": open_issues,
            "open_pull_requests": open_pull_requests,
            "timeline": timeline,
            "recent_activity": recent_activity,
            "issues_by_state": issues_by_state,
            "builds_summary": builds_summary,
        }

    async def compute_header(
        self,
        package_pick_name: str,
        release_version: str,
        branch: str,
    ) -> dict:
        """Compute header zone: summary counts + CI + open issues/PRs."""
        packages_list = await self._build_package_list(
            package_pick_name, release_version
        )
        ready, waiting, blocked, disabled = self._count_package_statuses(packages_list)
        ci_status = await self._get_ci_status(branch)
        open_issues, open_prs, issues_by_state, builds_summary = await asyncio.gather(
            self._count_open_issues(),
            self._count_open_pull_requests(),
            self._compute_issues_by_state(),
            self._compute_builds_summary(),
        )
        return {
            "ready": ready,
            "waiting": waiting,
            "blocked": blocked,
            "disabled": disabled,
            "ci_status": ci_status,
            "open_issues": open_issues,
            "open_pull_requests": open_prs,
            "issues_by_state": issues_by_state,
            "builds_summary": builds_summary,
        }

    async def compute_timeline(self) -> list[dict]:
        """Compute timeline zone."""
        return await self._compute_timeline()

    async def compute_packages(
        self, package_pick_name: str, release_version: str
    ) -> dict:
        """Compute packages zone."""
        packages_list = await self._build_package_list(
            package_pick_name, release_version
        )
        return {"packages": len(packages_list), "packages_list": packages_list}

    async def compute_activity(self, branch: str) -> list[dict]:
        """Compute activity zone."""
        return await self._compute_recent_activity(branch)

    @staticmethod
    def _count_package_statuses(packages_list: list[dict]) -> tuple[int, int, int, int]:
        """Count ready / waiting / blocked / disabled from the actual package list."""
        ready = sum(1 for p in packages_list if not p.get("disabled") and p["status"] == "ready")
        waiting = sum(1 for p in packages_list if not p.get("disabled") and p["status"] == "waiting")
        blocked = sum(1 for p in packages_list if not p.get("disabled") and p["status"] == "blocked")
        disabled = sum(1 for p in packages_list if p.get("disabled"))
        return ready, waiting, blocked, disabled

    # ------------------------------------------------------------------
    #  Core package list builder
    # ------------------------------------------------------------------

    async def _build_package_list(
        self, package_pick_name: str, release_version: str
    ) -> list[dict]:
        """Build the full package list with status, versions and metadata.

        This is the central pipeline that:
        1. Parses the package-pick shell script
        2. Reads the tracking issue (checkboxes + cross-references)
        3. Fetches opam metadata (version, dev-repo)
        4. Fetches the latest git tag for each package repository
        5. Promotes ``waiting`` to ``blocked`` when past the deadline
        6. Assembles all data into a list of package dicts
        """

        # --- Step 1: Parse the package-pick file ---
        content = await self.github.get_file_content(
            OWNER, REPO, f"package_picks/{package_pick_name}.sh"
        )
        pick_packages = _parse_package_pick(content)

        # --- Step 2: Build tracker map from the tracking issue ---
        issue_number = settings.tracking_issue_number
        # Maps normalised package name -> {status, issue_url, repo_owner, repo_name}
        tracker_map: dict[str, dict] = {}

        if issue_number:
            issue = await self.github.get_issue(OWNER, REPO, issue_number)
            body = issue.get("body", "") or ""

            # Exclude the "### Checklist" section (admin tasks, not packages)
            checklist_idx = body.find("### Checklist")
            if checklist_idx != -1:
                body = body[:checklist_idx]

            # Step 2a: Parse checkboxes (GitLab-style URLs in markdown)
            for match in re.finditer(
                r"- \[([ xX])\]\s+\[?([^\]\n]+)\]?\(?([^\)\n]*)\)?", body
            ):
                checked = match.group(1).lower() == "x"
                url = match.group(3) or match.group(2)
                # Extract project name from URL (e.g. https://gitlab.inria.fr/iris/stdpp)
                url_match = re.search(r"https?://[^/]+/([^/]+/[^/\s)]+)", url)
                if url_match:
                    project_path = url_match.group(1)
                    project_name = project_path.split("/")[-1]
                    norm = _normalize_pkg_name(project_name)
                    tracker_map[norm] = {
                        "status": "ready" if checked else "waiting",
                        "issue_url": url.strip().rstrip(")"),
                        "repo_owner": None,
                        "repo_name": None,
                    }

            # Step 2b: Parse cross-referenced GitHub issues from timeline
            timeline = await self.github.get_issue_timeline(
                OWNER, REPO, issue_number
            )
            for event in timeline:
                if event.get("event") != "cross-referenced":
                    continue
                source_issue = event.get("source", {}).get("issue", {})
                state = source_issue.get("state")
                html_url = source_issue.get("html_url", "")
                repo_url = source_issue.get("repository_url", "")

                # Extract owner/repo from the API URL
                repo_match = re.search(r"/repos/([^/]+)/([^/]+)$", repo_url)
                if not repo_match:
                    continue

                repo_owner = repo_match.group(1)
                repo_name = repo_match.group(2)
                norm = _normalize_pkg_name(repo_name)

                # Closed issue = ready, open issue = waiting
                tracker_map[norm] = {
                    "status": "ready" if state == "closed" else "waiting",
                    "issue_url": html_url,
                    "repo_owner": repo_owner,
                    "repo_name": repo_name,
                }

        # --- Step 3: Fetch opam metadata (version + dev-repo) ---
        pkg_names = [pkg["name"] for pkg in pick_packages]
        opam_info = await self._build_opam_info_map(pkg_names)

        # --- Step 4: Fetch latest git tags ---
        # Deduplicate repos; use opam dev-repo as fallback when tracker has no info
        unique_repos: dict[tuple[str, str], str | None] = {}
        pkg_repo_key: list[tuple[str, str] | None] = []

        for pkg in pick_packages:
            norm = _normalize_pkg_name(pkg["name"])
            entry = tracker_map.get(norm, {})
            owner = entry.get("repo_owner")
            repo_name = entry.get("repo_name")

            # Fallback: parse GitHub URL from opam dev-repo field
            if not owner or not repo_name:
                dev_repo = opam_info.get(pkg["name"], {}).get("dev_repo", "")
                dev_match = re.search(
                    r"github\.com/([^/]+)/([^/.\s]+)", dev_repo
                )
                if dev_match:
                    owner = dev_match.group(1)
                    repo_name = dev_match.group(2)

            if owner and repo_name:
                key = (owner, repo_name)
                pkg_repo_key.append(key)
                unique_repos.setdefault(key, None)
            else:
                pkg_repo_key.append(None)

        # Fetch the most recent tag for each unique repository
        async def _fetch_tags(key: tuple[str, str]) -> tuple[tuple[str, str], str | None]:
            try:
                tags = await self.github.get_tags(key[0], key[1])
                if tags:
                    return key, tags[0].get("name")
            except Exception:
                pass
            return key, None

        tag_results = await asyncio.gather(
            *[_fetch_tags(k) for k in unique_repos]
        )
        for key, tag in tag_results:
            unique_repos[key] = tag

        # --- Step 5: Determine if past the release deadline ---
        deadline = settings.release_deadline
        past_deadline = False
        if deadline:
            past_deadline = date.today() >= date.fromisoformat(deadline)

        # --- Step 6: Assemble the final package list ---
        results = []
        for i, pkg in enumerate(pick_packages):
            name = pkg["name"]
            version = pkg["version"]
            disabled = pkg["disabled"]
            comment = pkg["comment"]
            norm = _normalize_pkg_name(name)
            tracker_entry = tracker_map.get(norm, {})
            repo_key = pkg_repo_key[i]

            status = tracker_entry.get("status", "unknown")
            # After the deadline, all waiting packages become blocked
            if status == "waiting" and past_deadline:
                status = "blocked"

            repo_owner = tracker_entry.get("repo_owner")
            repo_name_val = tracker_entry.get("repo_name")
            # Fallback: derive repo URL from opam dev-repo
            if not repo_owner or not repo_name_val:
                dev_repo = opam_info.get(name, {}).get("dev_repo", "")
                dev_match = re.search(
                    r"github\.com/([^/]+)/([^/.\s]+)", dev_repo
                )
                if dev_match:
                    repo_owner = dev_match.group(1)
                    repo_name_val = dev_match.group(2)

            repo_url = (
                f"https://github.com/{repo_owner}/{repo_name_val}"
                if repo_owner and repo_name_val
                else None
            )

            opam_version = opam_info.get(name, {}).get("version") or None

            results.append({
                "name": name,
                "pick_version": version,
                "opam_version": opam_version,
                "git_tag": unique_repos.get(repo_key) if repo_key else None,
                "issue_url": tracker_entry.get("issue_url"),
                "repo_url": repo_url,
                "status": status,
                "disabled": disabled,
                "disabled_reason": comment,
            })

        return results

    async def _parse_tracking_issue(
        self, release_version: str
    ) -> tuple[int, int, int]:
        issue_number = settings.tracking_issue_number
        if not issue_number:
            return 0, 0, 0

        issue = await self.github.get_issue(OWNER, REPO, issue_number)
        body = issue.get("body", "") or ""

        # Exclude the "### Checklist" section (admin tasks, not packages)
        checklist_idx = body.find("### Checklist")
        if checklist_idx != -1:
            body = body[:checklist_idx]

        # Count checkboxes in the body (for non-GitHub links like GitLab)
        checked = len(re.findall(r"- \[x\]", body, re.IGNORECASE))
        unchecked = len(re.findall(r"- \[ \]", body))

        # Count cross-referenced GitHub issues (closed = ready, open = waiting)
        timeline = await self.github.get_issue_timeline(
            OWNER, REPO, issue_number
        )
        for event in timeline:
            if event.get("event") != "cross-referenced":
                continue
            source_issue = event.get("source", {}).get("issue", {})
            state = source_issue.get("state")
            if state == "closed":
                checked += 1
            elif state == "open":
                unchecked += 1

        deadline = settings.release_deadline
        past_deadline = False
        if deadline:
            past_deadline = date.today() >= date.fromisoformat(deadline)

        if past_deadline:
            return checked, 0, unchecked
        else:
            return checked, unchecked, 0

    # ------------------------------------------------------------------
    #  GitHub search helpers (issues / PRs / builds)
    # ------------------------------------------------------------------

    async def _count_open_issues(self) -> int:
        """Return the total number of open issues on the platform repo."""
        data = await self.github.search_issues(
            OWNER, REPO, "is:issue+is:open"
        )
        return data.get("total_count", 0)

    async def _count_open_pull_requests(self) -> int:
        """Return the total number of open pull requests on the platform repo."""
        data = await self.github.search_issues(
            OWNER, REPO, "is:pr+is:open"
        )
        return data.get("total_count", 0)

    async def _compute_issues_by_state(self) -> dict:
        """Return issue/PR counts grouped by state (open, closed, draft)."""
        open_data, closed_data, draft_data = await asyncio.gather(
            self.github.search_issues(OWNER, REPO, "is:issue+is:open"),
            self.github.search_issues(OWNER, REPO, "is:issue+is:closed"),
            self.github.search_issues(OWNER, REPO, "is:pr+draft:true"),
        )
        return {
            "open": open_data.get("total_count", 0),
            "closed": closed_data.get("total_count", 0),
            "draft_prs": draft_data.get("total_count", 0),
        }

    async def _compute_builds_summary(self) -> dict:
        """Aggregate workflow run outcomes from the last 30 runs."""
        data = await self.github.get_all_workflow_runs(OWNER, REPO)
        runs = data.get("workflow_runs", [])

        summary = {"success": 0, "failed": 0, "running": 0, "cancelled": 0}
        for run in runs:
            status = run.get("status")
            conclusion = run.get("conclusion")
            if status == "completed":
                if conclusion == "success":
                    summary["success"] += 1
                elif conclusion == "failure":
                    summary["failed"] += 1
                elif conclusion == "cancelled":
                    summary["cancelled"] += 1
            elif status in ("in_progress", "queued"):
                summary["running"] += 1

        return summary

    async def _get_ci_status(self, branch: str) -> list[dict]:
        """Return the latest CI run status for each platform (Ubuntu, Macos, Windows)."""
        PLATFORMS = {"Ubuntu", "Macos", "Windows"}

        data = await self.github.get_workflow_runs(OWNER, REPO, branch)
        runs = data.get("workflow_runs", [])

        # Keep only the most recent run for each workflow name
        latest_by_workflow: dict[str, dict] = {}
        for run in runs:
            name = run["name"]
            if name not in latest_by_workflow:
                latest_by_workflow[name] = run

        return [
            {
                "name": run["name"],
                "status": run.get("status"),
                "conclusion": run.get("conclusion"),
                "html_url": run.get("html_url"),
            }
            for run in latest_by_workflow.values()
            if run["name"] in PLATFORMS
        ]

    # ------------------------------------------------------------------
    #  Activity feed
    # ------------------------------------------------------------------

    async def _compute_recent_activity(self, branch: str) -> list[dict]:
        """Build a unified activity feed from cross-refs, issues and CI runs."""
        events: list[dict] = []

        # 1. Cross-references from the tracking issue timeline
        issue_number = settings.tracking_issue_number
        if issue_number:
            timeline = await self.github.get_issue_timeline(
                OWNER, REPO, issue_number
            )
            for event in timeline:
                if event.get("event") != "cross-referenced":
                    continue
                source_issue = event.get("source", {}).get("issue", {})
                state = source_issue.get("state")
                html_url = source_issue.get("html_url", "")
                repo_url = source_issue.get("repository_url", "")
                created_at = event.get("created_at", "")

                repo_match = re.search(r"/repos/([^/]+)/([^/]+)$", repo_url)
                repo_name = repo_match.group(2) if repo_match else "unknown"

                if state == "closed":
                    events.append({
                        "type": "cross_ref",
                        "text": f"{repo_name} marked as ready",
                        "url": html_url,
                        "date": created_at,
                        "state": "success",
                    })
                elif state == "open":
                    events.append({
                        "type": "cross_ref",
                        "text": f"{repo_name} issue opened (waiting)",
                        "url": html_url,
                        "date": created_at,
                        "state": "info",
                    })

        # 2. Recent issues/PRs from the repo
        try:
            recent_issues = await self.github.get_recent_issues(
                OWNER, REPO, per_page=10
            )
            for issue in recent_issues:
                is_pr = "pull_request" in issue
                state_str = issue.get("state", "open")
                events.append({
                    "type": "issue_closed" if state_str == "closed" else "issue_opened",
                    "text": f"{'PR' if is_pr else 'Issue'} #{issue['number']}: {issue['title']}",
                    "url": issue.get("html_url", ""),
                    "date": issue.get("updated_at", ""),
                    "state": "success" if state_str == "closed" else "info",
                })
        except Exception:
            logger.warning("Failed to fetch recent issues for activity feed")

        # 3. CI workflow runs (already cached from _get_ci_status)
        try:
            data = await self.github.get_workflow_runs(OWNER, REPO, branch)
            for run in data.get("workflow_runs", [])[:5]:
                conclusion = run.get("conclusion")
                status = run.get("status")
                if status == "completed":
                    label = "succeeded" if conclusion == "success" else "failed"
                    run_state = "success" if conclusion == "success" else "danger"
                else:
                    label = status or "in progress"
                    run_state = "info"
                events.append({
                    "type": "ci_run",
                    "text": f"CI {run['name']} {label}",
                    "url": run.get("html_url", ""),
                    "date": run.get("created_at", ""),
                    "state": run_state,
                })
        except Exception:
            logger.warning("Failed to fetch workflow runs for activity feed")

        # Sort by date descending and limit
        def _sort_key(e: dict) -> str:
            return e.get("date") or ""

        events.sort(key=_sort_key, reverse=True)
        return events[:15]

    # ------------------------------------------------------------------
    #  Release timeline
    # ------------------------------------------------------------------

    async def _compute_timeline(self) -> list[dict]:
        """Compute the release milestone timeline based on the tracking issue dates.

        Milestones are derived from the tracking issue creation date and the
        configured release deadline, using business-day offsets.
        """
        issue_number = settings.tracking_issue_number
        deadline = settings.release_deadline

        if not issue_number or not deadline:
            return []

        issue = await self.github.get_issue(OWNER, REPO, issue_number)
        created_at = issue.get("created_at", "")[:10]  # "YYYY-MM-DD"

        if not created_at:
            return []

        please_pick_date = date.fromisoformat(created_at)
        package_pick_date = _add_business_days(please_pick_date, -5)
        validation_date = date.fromisoformat(deadline)
        rc_date = _add_business_days(validation_date, 20)  # ~1 business month
        final_date = _add_business_days(rc_date, 20)

        today = date.today()

        steps = [
            ("Package Pick", package_pick_date),
            ("Please Pick", please_pick_date),
            ("Validation", validation_date),
            ("Release Candidate", rc_date),
            ("Final Release", final_date),
        ]

        timeline = []
        for label, step_date in steps:
            if today >= step_date:
                state = "done"
            else:
                state = "todo"
            timeline.append({
                "label": label,
                "date": step_date.isoformat(),
                "state": state,
            })

        # The first "todo" step is actually "current"
        for step in timeline:
            if step["state"] == "todo":
                step["state"] = "current"
                break

        return timeline
