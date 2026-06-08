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


def _parse_package_pick(content: str) -> list[tuple[str, str]]:
    """Parse a package-pick shell file and return [(name, version), ...].

    Only includes packages after the "FULL" COQ PLATFORM PACKAGES section,
    skipping base/IDE packages.
    """
    packages = []
    in_full_section = False
    for line in content.splitlines():
        stripped = line.strip()
        # Start collecting only after the FULL section marker
        if '"FULL" COQ PLATFORM PACKAGES' in stripped:
            in_full_section = True
            continue
        if not in_full_section:
            continue
        if stripped.startswith("#") or not stripped.startswith("PACKAGES="):
            continue
        match = re.search(r'PACKAGES="\$\{PACKAGES\}\s+(.*?)"', stripped)
        if not match:
            continue
        for token in match.group(1).strip().split():
            # name.version — split at the first dot
            dot = token.find(".")
            if dot == -1:
                continue
            name = token[:dot]
            version = token[dot + 1 :]
            packages.append((name, version))
    return packages


def _normalize_pkg_name(name: str) -> str:
    """Strip common prefixes and lowercase for case-insensitive matching."""
    name = name.lower()
    for prefix in ("coq-mathcomp-", "rocq-mathcomp-", "coq-", "rocq-"):
        if name.startswith(prefix):
            return name[len(prefix):]
    return name


def _version_key(version: str) -> list:
    """Return a sort key for a version string like '1.2.3'."""
    parts = []
    for p in version.split("."):
        try:
            parts.append((0, int(p)))
        except ValueError:
            parts.append((1, p))
    return parts


class KpiService:
    def __init__(self, github: GithubService):
        self.github = github

    async def compute_summary(
        self,
        package_pick_name: str,
        release_version: str,
        branch: str,
    ) -> dict:
        packages_list = await self._build_package_list(
            package_pick_name, release_version
        )
        ready, waiting, blocked = await self._parse_tracking_issue(
            release_version,
        )

        ci_status = await self._get_ci_status(branch)
        open_issues = await self._count_open_issues()
        open_pull_requests = await self._count_open_pull_requests()
        timeline = await self._compute_timeline()
        recent_activity = await self._compute_recent_activity(branch)

        return {
            "packages": len(packages_list),
            "packages_list": packages_list,
            "ready": ready,
            "waiting": waiting,
            "blocked": blocked,
            "ci_status": ci_status,
            "open_issues": open_issues,
            "open_pull_requests": open_pull_requests,
            "timeline": timeline,
            "recent_activity": recent_activity,
        }

    async def _build_package_list(
        self, package_pick_name: str, release_version: str
    ) -> list[dict]:
        # 1. Parse package pick
        content = await self.github.get_file_content(
            OWNER, REPO, f"package_picks/{package_pick_name}.sh"
        )
        pick_packages = _parse_package_pick(content)

        # 2. Get tracking issue body + timeline
        issue_number = settings.tracking_issue_number
        tracker_map: dict[str, dict] = {}  # normalized_name -> {status, issue_url, repo_owner, repo_name}

        if issue_number:
            issue = await self.github.get_issue(OWNER, REPO, issue_number)
            body = issue.get("body", "") or ""

            # Exclude Checklist section
            checklist_idx = body.find("### Checklist")
            if checklist_idx != -1:
                body = body[:checklist_idx]

            # 3a. Parse checkboxes (GitLab URLs)
            # Pattern: - [x] or - [ ] followed by a URL containing a project name
            for match in re.finditer(
                r"- \[([ xX])\]\s+\[?([^\]\n]+)\]?\(?([^\)\n]*)\)?", body
            ):
                checked = match.group(1).lower() == "x"
                url = match.group(3) or match.group(2)
                # Try to extract project name from GitLab URL like https://gitlab.inria.fr/iris/stdpp
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

            # 3b. Parse cross-referenced GitHub issues from timeline
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

                # Extract owner/repo from repository_url (https://api.github.com/repos/OWNER/REPO)
                repo_match = re.search(r"/repos/([^/]+)/([^/]+)$", repo_url)
                if not repo_match:
                    continue

                repo_owner = repo_match.group(1)
                repo_name = repo_match.group(2)
                norm = _normalize_pkg_name(repo_name)

                tracker_map[norm] = {
                    "status": "ready" if state == "closed" else "waiting",
                    "issue_url": html_url,
                    "repo_owner": repo_owner,
                    "repo_name": repo_name,
                }

        # 4. Build opam latest-version map from a single API call
        opam_latest = await self._build_opam_latest_map(
            [name for name, _ in pick_packages]
        )

        # 5. Fetch git tags — deduplicated, only for repos we know about
        unique_repos: dict[tuple[str, str], str | None] = {}
        pkg_repo_key: list[tuple[str, str] | None] = []

        for name, version in pick_packages:
            norm = _normalize_pkg_name(name)
            entry = tracker_map.get(norm, {})
            owner = entry.get("repo_owner")
            repo_name = entry.get("repo_name")
            if owner and repo_name:
                key = (owner, repo_name)
                pkg_repo_key.append(key)
                unique_repos.setdefault(key, None)
            else:
                pkg_repo_key.append(None)

        # Fetch tags sequentially (few unique repos, avoids rate limit)
        for key in unique_repos:
            try:
                tags = await self.github.get_tags(key[0], key[1])
                if tags:
                    unique_repos[key] = tags[0].get("name")
            except Exception:
                pass

        # 6. Assemble results
        results = []
        for i, (name, version) in enumerate(pick_packages):
            norm = _normalize_pkg_name(name)
            tracker_entry = tracker_map.get(norm, {})
            repo_key = pkg_repo_key[i]

            results.append({
                "name": name,
                "pick_version": version,
                "opam_version": opam_latest.get(name),
                "git_tag": unique_repos.get(repo_key) if repo_key else None,
                "issue_url": tracker_entry.get("issue_url"),
                "status": tracker_entry.get("status", "unknown"),
            })

        return results

    async def _build_opam_latest_map(
        self, pkg_names: list[str]
    ) -> dict[str, str]:
        """Fetch the opam-repository packages tree and extract the latest
        version for each requested package name.

        Uses 2 API calls total:
        1. Get the commit SHA of master
        2. Get the recursive tree of the packages/ directory
        """
        try:
            # Step 1: get the root tree SHA via the commit
            commit = await self.github.get_commit_sha(
                "ocaml", "opam-repository", "master"
            )
            # Step 2: get the root tree to find the packages/ subtree SHA
            root_tree = await self.github.get_tree(
                "ocaml", "opam-repository", commit
            )
            packages_sha = None
            for entry in root_tree.get("tree", []):
                if entry.get("path") == "packages" and entry.get("type") == "tree":
                    packages_sha = entry["sha"]
                    break
            if not packages_sha:
                return {}

            # Step 3: get the recursive tree of packages/ (1 call for all versions)
            tree_data = await self.github.get_tree(
                "ocaml", "opam-repository", packages_sha, recursive=True
            )
        except Exception:
            return {}

        # tree_data["tree"] is a flat list of {path, type, ...}
        # Entries look like "coq-elpi/coq-elpi.3.4.0" or "coq-elpi/coq-elpi.3.4.0/opam"
        # We want the second-level tree entries (version dirs)
        needed = set(pkg_names)
        versions_by_pkg: dict[str, list[str]] = {}

        for entry in tree_data.get("tree", []):
            if entry.get("type") != "tree":
                continue
            path = entry.get("path", "")
            if "/" not in path:
                continue
            # Only consider direct children: "pkg_name/pkg_name.version"
            if path.count("/") != 1:
                continue
            pkg_dir, version_dir = path.split("/", 1)
            if pkg_dir not in needed:
                continue
            prefix = f"{pkg_dir}."
            if version_dir.startswith(prefix):
                ver = version_dir[len(prefix):]
                versions_by_pkg.setdefault(pkg_dir, []).append(ver)

        result = {}
        for pkg, versions in versions_by_pkg.items():
            versions.sort(key=_version_key)
            result[pkg] = versions[-1]

        return result

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
            past_deadline = date.today() > date.fromisoformat(deadline)

        if past_deadline:
            return checked, 0, unchecked
        else:
            return checked, unchecked, 0

    async def _count_open_issues(self) -> int:
        data = await self.github.search_issues(
            OWNER, REPO, "is:issue+is:open"
        )
        return data.get("total_count", 0)

    async def _count_open_pull_requests(self) -> int:
        data = await self.github.search_issues(
            OWNER, REPO, "is:pr+is:open"
        )
        return data.get("total_count", 0)

    async def _get_ci_status(self, branch: str) -> list[dict]:
        PLATFORMS = {"Ubuntu", "Macos", "Windows"}

        data = await self.github.get_workflow_runs(OWNER, REPO, branch)
        runs = data.get("workflow_runs", [])

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

    async def _compute_recent_activity(self, branch: str) -> list[dict]:
        events: list[dict] = []

        # 1. Cross-refs from tracker timeline (already cached from earlier calls)
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

    async def _compute_timeline(self) -> list[dict]:
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
