# Rocq Platform Release Maintainer

A dashboard tracking the state of a [Rocq Platform](https://github.com/rocq-prover/platform)
release cycle: the package list, per-package readiness, CI results, milestones
and the dependency graph.

There is no single upstream source for any of this. The backend reconstructs it
from three places:

- the **package-pick** shell script (`package_picks/*.sh`) — which packages are in
  the release, and which are commented out or disabled;
- a GitHub **tracking issue** — its checkboxes and cross-referenced issues say
  which packages are ready;
- the **opam** CLI and the git tags of each package repository — the versions
  actually published.

FastAPI + MongoDB + Redis on the backend, React/Vite on the frontend, deployed to
Kubernetes with Helm and Argo CD.

## Running it locally

Backend:

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
docker compose -f ../infra/docker-compose.yml up -d   # MongoDB + Redis
cp .env.example .env                                  # see the notes inside
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm ci
npm run dev        # http://localhost:5173
```

`opam` must be on `PATH` for package versions and dependency data to resolve;
without it those fields degrade to empty rather than failing.

### Configuration that matters

`GITHUB_TOKEN` is optional but strongly recommended — anonymous GitHub API calls
are capped at 60/hour and the dashboard will not finish loading.

`TRACKING_ISSUE_NUMBER` and `RELEASE_DEADLINE` drive package statuses and the
milestone timeline. **Without both, every package reports as `unknown` and the
timeline is empty.** The issue number changes at the start of each release cycle.

## Tests

```bash
cd backend  && .venv/bin/pytest          # pytest, with coverage
cd frontend && npm run lint && npm test -- --run
```

End-to-end tests (`frontend/e2e/`) exist but are disabled in CI; see the comment
on the `frontend-e2e` job in `.github/workflows/tests.yml`.

## Deployment

The Helm chart lives in `charts/release-maintainer`. Images are built and pushed
to GHCR on every push to `main`/`develop`. Argo CD Image Updater picks up the new
`latest` digest and patches the Application's Helm parameters in the cluster; it
does not commit to Git, so `main` only changes through merged pull requests.

Per-cycle values to set: `releaseCycle.trackingIssueNumber` and
`releaseCycle.deadline`. Secrets (`github_token`, `jwt_secret_key`, `seed_users`)
come from the `release-maintainer-secrets` Secret.

## Architecture notes

`CLAUDE.md` documents the cache layers, how the active release cycle is inferred,
and how package statuses are assembled.

## License

MIT — see the SPDX headers in source files.
