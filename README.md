# deploycheck

![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet)
![License: MIT](https://img.shields.io/badge/License-MIT-green)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)

Deploy readiness checker for Claude Code. An MCP server that lets Claude verify if your environments are safe to ship — health checks, CI status, Docker tag comparison, and release diffs in one sweep.

## Prerequisites

- **Node.js** >= 18.0.0
- **npm**
- A **GitHub** or **GitLab** personal access token (see [Token scopes](#token-scopes))

## Quick start

```bash
# Clone
git clone https://github.com/kawehtaher/deploycheck.git
cd deploycheck

# Install and build
cd server
npm install
npm run build
cd ..

# Configure
cp deploycheck.example.yml deploycheck.yml
# Edit deploycheck.yml with your project details

# Set tokens
export GITHUB_TOKEN=ghp_...      # or GITLAB_TOKEN for GitLab
export DOCKER_HUB_TOKEN=...      # optional, for private images

# Install the plugin in Claude Code
claude plugin add ./
```

## How it works

deploycheck runs as a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server over stdio. When installed as a Claude Code plugin, it exposes five tools that Claude can call to inspect your deployment pipeline:

1. Pings health endpoints on your configured environments
2. Queries GitHub Actions or GitLab CI for the latest pipeline status
3. Compares Docker image tags between environments via Docker Hub
4. Diffs commits between staging and production refs via the GitHub API
5. Combines all of the above into a single go/no-go readiness report

## Configuration

Place a `deploycheck.yml` in your project root, or set the `DEPLOYCHECK_CONFIG` environment variable to point to it.

```yaml
project: my-app

environments:
  staging:
    url: https://staging.myapp.com
    health_endpoint: /api/health
    docker_image: myapp/api
    docker_tag_source: git       # "git" or "docker-hub"

  production:
    url: https://myapp.com
    health_endpoint: /api/health
    docker_image: myapp/api
    docker_tag_source: git

ci:
  provider: github-actions       # or "gitlab-ci"
  repo: owner/repo
  branch: main

git:
  staging_ref: staging
  production_ref: production
```

### Config reference

| Field | Required | Description |
|---|---|---|
| `project` | Yes | Project name |
| `environments.<name>.url` | Yes | Base URL for the environment |
| `environments.<name>.health_endpoint` | Yes | Path to health endpoint (must start with `/`) |
| `environments.<name>.docker_image` | Yes | Docker image in `[namespace/]repository` format |
| `environments.<name>.docker_tag_source` | No | `"git"` (default) or `"docker-hub"` |
| `ci.provider` | Yes | `"github-actions"` or `"gitlab-ci"` |
| `ci.repo` | Yes | Repository identifier (`owner/repo` for GitHub, project path or numeric ID for GitLab) |
| `ci.branch` | No | Branch to check CI status for (default: `main`) |
| `git.staging_ref` | No | Branch or tag representing staging (default: `staging`) |
| `git.production_ref` | No | Branch or tag representing production (default: `production`) |

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | Yes (GitHub) | GitHub personal access token |
| `GITLAB_TOKEN` | Yes (GitLab) | GitLab personal access token |
| `DOCKER_HUB_TOKEN` | No | Docker Hub token for private images (public images work without it) |
| `DEPLOYCHECK_CONFIG` | No | Path to config file (default: `./deploycheck.yml`) |

### Token scopes

| Provider | Required scope |
|---|---|
| GitHub | `actions:read` (for CI status), `repo` or `contents:read` (for release diff) |
| GitLab | `read_api` |
| Docker Hub | Read access (only needed for private images) |

## Available tools

### `check_health`

Ping one or all environment health endpoints. Returns status code, response time, and healthy/unhealthy verdict. Health checks timeout after 5 seconds.

| Parameter | Required | Description |
|---|---|---|
| `environment` | Yes | Environment name from config, or `"all"` to check every environment |

```
> Check if staging is healthy
> Check health on all environments
```

### `get_ci_status`

Get the latest CI pipeline status for a branch. Supports GitHub Actions and GitLab CI.

| Parameter | Required | Description |
|---|---|---|
| `branch` | No | Branch to check (defaults to `ci.branch` from config) |

```
> What's the CI status on main?
> Is the latest build passing?
```

### `compare_envs`

Compare two environments side-by-side — Docker image tags, health status, and differences.

| Parameter | Required | Description |
|---|---|---|
| `source` | Yes | Source environment name (e.g. `"staging"`) |
| `target` | Yes | Target environment name (e.g. `"production"`) |

```
> Compare staging and production
> Are staging and production running the same version?
```

### `get_release_diff`

Show what would be deployed — commits between staging and production refs. **GitHub only** — uses the GitHub compare API.

| Parameter | Required | Description |
|---|---|---|
| `source_ref` | No | Source branch/tag (defaults to `git.staging_ref` from config) |
| `target_ref` | No | Target branch/tag (defaults to `git.production_ref` from config) |

```
> What commits are waiting to be deployed?
> Show me the diff between staging and production
```

### `run_all_checks`

Full readiness sweep. Runs health checks on all environments, CI status, environment comparison, and release diff concurrently. Returns a go/no-go recommendation with blockers and warnings.

| Parameter | Required | Description |
|---|---|---|
| `source` | No | Source environment for comparison (default: `"staging"`) |
| `target` | No | Target environment for comparison (default: `"production"`) |

Readiness verdict:
- **READY** — all checks pass, no blockers or warnings
- **WARNINGS** — no blockers, but issues worth reviewing (tag mismatches, cancelled CI, etc.)
- **NOT READY** — blockers found (unhealthy environments, failed CI)

```
> Are we ready to deploy?
> Run a full deploy check
> Is it safe to ship?
```

## Example conversations

**Quick health check:**
```
You: Is staging healthy?
Claude: [runs check_health for staging]
> staging: HEALTHY — HTTP 200, 142ms
```

**Pre-deploy review:**
```
You: Are we ready to deploy to production?
Claude: [runs run_all_checks]
> Deploy Readiness: WARNINGS
> Health: staging OK, production OK
> CI: SUCCESS on main (abc1234)
> Tags: staging=v1.3.0, production=v1.2.9 (mismatch)
> 4 commits ahead, 12 files changed
> Warning: Tag mismatch between staging and production
```

**Investigating a failure:**
```
You: Why isn't production healthy?
Claude: [runs check_health for production]
> production: UNHEALTHY — HTTP 503, 2341ms
> The production health endpoint is returning 503. This usually indicates
> the service is overloaded or in maintenance mode.
```

## Project structure

```
deploycheck/
├── .claude-plugin/          # Claude Code plugin manifest
│   └── plugin.json
├── .mcp.json                # MCP server configuration
├── skills/
│   └── deploy-check/
│       └── SKILL.md         # Skill prompt for Claude
├── server/
│   └── src/
│       ├── index.ts         # MCP server entry point (stdio transport)
│       ├── types.ts         # Shared type definitions
│       ├── config/
│       │   ├── schema.ts    # Zod config schema + validation
│       │   └── loader.ts    # YAML config file loader
│       ├── tools/           # MCP tool handlers
│       │   ├── check-health.ts
│       │   ├── get-ci-status.ts
│       │   ├── compare-envs.ts
│       │   ├── get-release-diff.ts
│       │   └── run-all-checks.ts
│       └── providers/       # External service integrations
│           ├── ci/
│           │   ├── github-actions.ts
│           │   └── gitlab-ci.ts
│           └── registry/
│               └── docker-hub.ts
├── deploycheck.example.yml  # Example configuration
└── tsconfig.json
```

## Development

```bash
cd server
npm install
npm run dev          # watch mode
npm test             # run tests
npm run build        # production build
npm run lint         # check linting
npm run typecheck    # type check without emitting
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes with tests
4. Ensure `npm test` passes
5. Submit a pull request

## License

[MIT](LICENSE) - Kaveh Taher
