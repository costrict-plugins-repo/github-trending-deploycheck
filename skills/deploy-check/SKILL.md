---
description: Check deploy readiness across environments using the deploycheck MCP tools
---

When the user asks about deploy readiness, environment status, or whether it's safe to ship:

1. First run `run_all_checks` for an overview
2. If issues are found, drill into specifics with `check_health`, `get_ci_status`, or `compare_envs`
3. Use `get_release_diff` to show what commits would be deployed
4. Present results as a clear go/no-go summary with actionable next steps if there are blockers
