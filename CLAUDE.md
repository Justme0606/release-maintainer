# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A release dashboard for the **Rocq Platform**. It aggregates data about a Platform release cycle — the package list, per-package readiness, CI state, milestones, dependency graph — from three sources: the GitHub REST API (`rocq-prover/platform`), the `opam` CLI, and a GitHub *tracking issue*. FastAPI backend + React/Vite frontend, deployed on Kubernetes via Helm + Argo CD.

## Commands

### Backend (`backend/`)

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
docker compose -f ../infra/docker-compose.yml up -d    # MongoDB + Redis
cp .env.example .env                                   # then fill GITHUB_TOKEN, SEED_USERS
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Tests (`pytest.ini` forces `-v`, coverage and HTML/XML reports on every run):

```bash
.venv/bin/pytest                                             # full suite
.venv/bin/pytest tests/services/test_github_service.py       # one file
.venv/bin/pytest tests/core/test_auth.py::test_verify_password  # one test
.venv/bin/pytest -k "cache" --no-cov                         # by name, no coverage
```

Tests need MongoDB and Redis reachable — `conftest.py` imports `app.main`, which builds real Mongo/Redis clients at module import. CI runs them as service containers on Python **3.10** (the Docker image is 3.12).

### Frontend (`frontend/`)

```bash
npm ci
npm run dev            # Vite on :5173, reads VITE_API_BASE_URL from .env.local
npm run lint           # eslint — CI fails on any error
npm test -- --run      # vitest once (bare `npm test` starts watch mode)
npm test -- --run src/components/PackageTable.test.tsx
npm test -- --run -t "renders the package table"
npm run test:coverage -- --run
npm run test:e2e       # playwright; spawns `npm run dev` itself, needs a live backend
npm run build          # tsc -b && vite build
```

`npm run build` type-checks the `*.test.tsx` files too (`tsconfig.app.json` includes all of `src`), so a type error or unused variable in a test breaks the production image. Do **not** fix that with an `exclude` for tests: Vite reads `jsx` from this tsconfig and every test then fails with "React is not defined". `it.todo` entries in `PackageDetailPage.test.tsx` are intentional unwritten tests, and that file currently tests a local stub rather than the real page.

## Architecture

### Backend data flow

`api/releases.py` → `services/release_cache_service.py` → `services/kpi_service.py` → `services/github_service.py` + `opam` subprocesses.

**Two distinct Redis cache layers** — confusing them is the most common source of "why is the data stale":

1. `github:*` / `github:paginated:*` / `opam_show:*` — raw upstream responses, written by `GithubService._get` (30 min TTL, 24 h for tags) and `KpiService.run_opam_show` (24 h). Both use double-checked locking around a semaphore so concurrent coroutines don't duplicate calls. The GitHub and opam semaphores are **process-wide** (one per event loop, module-level), not per instance — each router builds its own `GithubService`, so a per-instance cap would not cap anything. `GithubService._fetch_single` retries on 403/429 using `Retry-After` / `X-RateLimit-Reset`, and fails fast if the wait exceeds 60 s.
2. `release_data:v{N}:{release_id}` — the assembled dashboard payload, written by `release_cache_service`. Every `refresh_*` first calls `_clear_github_cache()`, which SCAN-deletes layer 1 (with a 5 s cooldown) so the recomputation actually hits GitHub.

`_CACHE_SCHEMA_VERSION` in `release_cache_service.py` is part of the Redis key. **Bump it whenever the shape of the release payload changes**, otherwise deployed instances keep serving old-shape JSON. Note the TTLs differ by kind: release list 30 min, `in-progress` 6 h, published releases 30 days, dependency graph 1 h — see `_cache_options`. Anything that rewrites a cached release must preserve the TTL (`_set_preserving_ttl` uses `KEEPTTL`); a plain `SET` silently makes the entry permanent.

**Unauthenticated endpoints must never compute.** `/api/public/release-status` goes through `peek_cached_release`, which only reads. `get_cached_release` recomputes on a miss (hundreds of GitHub calls + opam subprocesses), so calling it from an anonymous route lets anyone trigger that. `main.py` warms a cold cache once at startup (`warm_cache_if_cold`) so the landing page is not stuck at zero until the 02:00 refresh.

**Zone refresh.** Recomputing a whole release is expensive (hundreds of GitHub calls + opam subprocesses). `refresh_zone_header/timeline/packages/activity` recompute one dashboard section and `_deep_merge` the patch into the cached payload via `_read_modify_write`. They only work for `in-progress` — `_get_release_params` raises `ValueError` for anything else. The routes serialise on a module-level `_zone_refresh_lock`.

**The release identity problem.** There is no explicit "current release" anywhere upstream. `_find_in_progress_package_pick` infers it: list `package_picks/*.sh`, keep the newest dated stable pick (`package-pick-9.1~2026.01.sh`), and treat it as in-progress *unless* some published release's title/body already names that `version~YYYY.MM` pair. If the newest pick is already published, there is no active cycle and `/api/public/release-status` and the `in-progress` release return `None`/404.

**Matching a published release to its pick** (`_find_package_pick`) reads only the release *title* fields (`name`, `tag_name`, `description`), in the order the release names them, then falls back to the tag's date prefix. Never match against the body or iterate the pick files: the body lists every compatibility version (`8.13~2021.02`, ...) in the same `<rocq>~<date>` form, and the alphabetically first pick used to win, labelling releases "Rocq 8.13" with the wrong package list. Changing the payload's content, not only its shape, also needs a `_CACHE_SCHEMA_VERSION` bump, because published releases are cached for 30 days.

**Package status** (`KpiService._build_package_list`) is assembled, not read from one place:
1. parse the package-pick shell script (`_parse_package_pick`) — only lines after the `"FULL" COQ PLATFORM PACKAGES` marker; commented-out lines and `if false` blocks become `disabled`;
2. read the tracking issue (`TRACKING_ISSUE_NUMBER`) — markdown checkboxes → ready/waiting, plus `cross-referenced` timeline events where a closed issue means ready;
3. `opam show` for version and `dev-repo`, used to locate a package's GitHub repo when the tracker doesn't name it;
4. latest git tag per repo;
5. past `RELEASE_DEADLINE`, `waiting` is promoted to `blocked`.

Package names are matched through `_normalize_pkg_name`, which lowercases and strips `coq-` / `rocq-` / `coq-mathcomp-` prefixes — the pick file, the tracker URLs and the repo names all spell them differently.

Without `TRACKING_ISSUE_NUMBER` and `RELEASE_DEADLINE` set, every package gets `status = "unknown"` — which `_count_package_statuses` counts in *none* of its four buckets — and `compute_timeline` returns `[]`. That is the usual cause of a dashboard showing N packages with 0 everywhere. In the cluster both come from `releaseCycle.trackingIssueNumber` / `releaseCycle.deadline` in the Helm values, and **the issue number must be updated at the start of each release cycle**.

**opam is a hard runtime dependency of the KPI pipeline** — `kpi_service` shells out to `opam list` / `opam show`. `backend/Dockerfile` does **not** install opam, so in containers those calls fail and are swallowed (`return []` / `{}`), silently degrading opam versions and dev-repo-derived tags.

`OWNER = "rocq-prover"` / `REPO = "platform"` are hardcoded in `release_cache_service.py`, `kpi_service.py`, `api/github.py` and `api/admin.py` — change all of them together.

### Auth and storage

JWT in an **httpOnly cookie** named `access_token`, not a bearer header — `get_current_user` reads `request.cookies` only. Every frontend `fetch` must pass `credentials: "include"`. In tests use the `auth_client` (maintainer) and `admin_client` fixtures from `conftest.py`, which carry the cookie; a client sending an `Authorization` header gets 401 everywhere. The cookie's `Secure` flag comes from `COOKIE_SECURE` (default false for local HTTP; the Helm chart sets it true).

Users come from the `SEED_USERS` env var, hashed with bcrypt into a module-level dict at import time (`repositories/user_repository.py`). Despite the "repository" name there is no user collection — **MongoDB holds only the `releases` collection** used by the admin CRUD routes, plus the health check. All dashboard data lives in Redis.

`/health` pings both MongoDB and Redis, so it fails whole if either is unreachable. It backs the backend's readiness probe (liveness is a plain TCP check, so a dependency blip gates traffic instead of restart-looping the pod).

Roles are `admin` and `maintainer`; `require_admin` gates `/api/admin/*`.

CORS allows exactly `http://localhost:5173`. In production nginx proxies `/api/` to the backend service, so the frontend uses a relative base URL and CORS never applies.

### Frontend

`App.tsx` splits public routes (`/`, `/login`) from `/app/*` behind `ProtectedRoute`, which nests three cache providers: `ReleaseProvider` (release payload per `releaseId`), `ApiCacheProvider` (generic key→URL cache for issue details, opam metadata), `DepGraphProvider`. All three follow the same shape — a `useState` cache plus an `inflight` ref that deduplicates concurrent requests for the same key. `ReleaseProvider` and `ApiCacheProvider` also mirror the cache in a `cacheRef` so their fetch functions have a stable identity; putting `cache` back in a `useCallback` dependency list would re-fire every effect that calls them on each write. Components read through the context hooks rather than fetching directly; after a refresh mutation, call the matching `invalidate*`.

`/app` index resolves the default release by fetching `/api/releases/` and redirecting to the first entry (which is `in-progress` when a cycle is active).

`vite.config.ts` injects `__GIT_COMMIT__` / `__GIT_COMMIT_URL__` at build time, from `VITE_GIT_COMMIT` (passed as a Docker build arg in CI) or `git rev-parse` locally.

### CI/CD

`tests.yml` runs frontend lint+vitest and backend pytest, then calls `docker.yml` only on pushes to `main`/`develop`. The `frontend-e2e` job is disabled (`if: false`). Images go to `ghcr.io/justme0606/release-maintainer-{frontend,backend}`.

Argo CD Image Updater runs with `writeBackConfig.method: argocd` (see `image-updater-release-maintainer.yaml`): it patches the `release-maintainer` Application's Helm parameters in the cluster and **never commits to Git**, so it needs no Git credentials and nothing writes to `main` except merged PRs. Do not reintroduce a `.argocd-source-release-maintainer.yaml` in the chart: Argo CD applies that file as parameter overrides that win over the Application, so stale digests in it would pin the images and hide every new build. The live `ImageUpdater` object is applied by hand (`kubectl apply -f image-updater-release-maintainer.yaml`), so check that the cluster still matches this file if images stop updating.

Argo CD reads this repository anonymously (it is public); there is no repository credential secret to expire. Branch protection on `main` is a GitHub ruleset named `protect`, which requires a PR and the `backend-tests` / `frontend-tests` checks.

## Conventions

Source files carry an SPDX header:

```python
# Copyright (c) 2026 Sylvain Borgogno <sylvain.borgogno@inria.fr>
# SPDX-License-Identifier: MIT
```

Backend modules and public functions have docstrings; the services use `# ---` banner comments to separate sections.
