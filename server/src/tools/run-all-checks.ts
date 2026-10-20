import type { DeployCheckConfig } from "../config/schema.js";
import type { CheckSummary, ToolHandler, ToolResult } from "../types.js";
import { checkEndpoint } from "./check-health.js";
import { getCIRun } from "./get-ci-status.js";
import { compareEnvironments } from "./compare-envs.js";
import { getReleaseDiff } from "./get-release-diff.js";

export function createRunAllChecksTool(config: DeployCheckConfig): ToolHandler {
  return {
    definition: {
      name: "run_all_checks",
      description:
        "Run a full readiness sweep — health checks on all envs, CI status, and env comparison. Returns a summary with a go/no-go recommendation.",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description:
              "Source environment for comparison. Default: 'staging'",
          },
          target: {
            type: "string",
            description:
              "Target environment for comparison. Default: 'production'",
          },
        },
      },
    },

    async handle(args: Record<string, unknown>): Promise<ToolResult> {
      const sourceName = (args.source as string) || "staging";
      const targetName = (args.target as string) || "production";

      const summary = await runAllChecks(config, sourceName, targetName);
      return formatSummary(summary);
    },
  };
}

async function runAllChecks(
  config: DeployCheckConfig,
  sourceName: string,
  targetName: string,
): Promise<CheckSummary> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Run all checks concurrently
  const [healthResults, ciResult, envCompResult, diffResult] =
    await Promise.all([
      runHealthChecks(config),
      runCICheck(config),
      runEnvComparison(config, sourceName, targetName),
      runReleaseDiff(config),
    ]);

  // Analyze health check results
  for (const health of healthResults) {
    if (!health.healthy) {
      blockers.push(
        `${health.environment} is unhealthy (${health.error ?? `HTTP ${health.statusCode}`})`,
      );
    }
  }

  // Analyze CI status
  if (ciResult) {
    if (ciResult.status === "failure") {
      blockers.push(`CI pipeline failed: ${ciResult.workflowName}`);
    } else if (ciResult.status === "in_progress") {
      warnings.push(`CI pipeline still running: ${ciResult.workflowName}`);
    } else if (ciResult.status === "cancelled") {
      warnings.push(`CI pipeline was cancelled: ${ciResult.workflowName}`);
    }
  }

  // Analyze env comparison
  if (envCompResult) {
    for (const diff of envCompResult.differences) {
      warnings.push(diff);
    }
  }

  // Determine overall status
  let overallStatus: CheckSummary["overallStatus"];
  if (blockers.length > 0) {
    overallStatus = "NOT READY";
  } else if (warnings.length > 0) {
    overallStatus = "WARNINGS";
  } else {
    overallStatus = "READY";
  }

  return {
    overallStatus,
    healthChecks: healthResults,
    ciStatus: ciResult,
    envComparison: envCompResult,
    releaseDiff: diffResult,
    blockers,
    warnings,
  };
}

async function runHealthChecks(config: DeployCheckConfig) {
  return Promise.all(
    Object.entries(config.environments).map(([name, env]) =>
      checkEndpoint(name, env.url, env.health_endpoint),
    ),
  );
}

async function runCICheck(config: DeployCheckConfig) {
  try {
    return await getCIRun(config);
  } catch {
    return null;
  }
}

async function runEnvComparison(
  config: DeployCheckConfig,
  source: string,
  target: string,
) {
  if (!config.environments[source] || !config.environments[target]) {
    return null;
  }
  try {
    return await compareEnvironments(config, source, target);
  } catch {
    return null;
  }
}

async function runReleaseDiff(config: DeployCheckConfig) {
  try {
    return await getReleaseDiff(
      config.ci.repo,
      config.git?.staging_ref || "staging",
      config.git?.production_ref || "production",
    );
  } catch {
    return null;
  }
}

function formatSummary(summary: CheckSummary): ToolResult {
  const statusIcon =
    summary.overallStatus === "READY"
      ? "✅"
      : summary.overallStatus === "WARNINGS"
        ? "⚠️"
        : "❌";

  const lines = [
    `${statusIcon} Deploy Readiness: ${summary.overallStatus}`,
    `${"═".repeat(50)}`,
    "",
  ];

  // Health checks
  lines.push("🏥 Health Checks:");
  for (const h of summary.healthChecks) {
    const icon = h.healthy ? "✅" : "❌";
    const time = h.responseTimeMs !== null ? ` (${h.responseTimeMs}ms)` : "";
    lines.push(
      `  ${icon} ${h.environment}: ${h.healthy ? "Healthy" : "Unhealthy"}${time}`,
    );
  }
  lines.push("");

  // CI status
  lines.push("🔄 CI Status:");
  if (summary.ciStatus) {
    const ciIcon =
      summary.ciStatus.status === "success"
        ? "✅"
        : summary.ciStatus.status === "failure"
          ? "❌"
          : "⏳";
    lines.push(
      `  ${ciIcon} ${summary.ciStatus.workflowName}: ${summary.ciStatus.status.toUpperCase()}`,
    );
    lines.push(`  Commit: ${summary.ciStatus.commitSha.substring(0, 7)}`);
    lines.push(`  Link: ${summary.ciStatus.link}`);
  } else {
    lines.push("  ⚠️ Could not fetch CI status");
  }
  lines.push("");

  // Env comparison
  if (summary.envComparison) {
    const tagIcon = summary.envComparison.tagMatch ? "✅" : "⚠️";
    lines.push("📊 Environment Comparison:");
    lines.push(
      `  ${tagIcon} Tags: ${summary.envComparison.source}=${summary.envComparison.sourceTag ?? "?"} vs ${summary.envComparison.target}=${summary.envComparison.targetTag ?? "?"}`,
    );
    lines.push("");
  }

  // Release diff
  if (summary.releaseDiff) {
    lines.push("📦 Release Diff:");
    if (summary.releaseDiff.aheadBy === 0) {
      lines.push("  ✅ Environments are in sync");
    } else {
      lines.push(
        `  ${summary.releaseDiff.aheadBy} commit(s) ahead, ${summary.releaseDiff.filesChanged} file(s) changed`,
      );
      for (const c of summary.releaseDiff.commits.slice(0, 10)) {
        lines.push(`    ${c.sha} ${c.message} (${c.author})`);
      }
      if (summary.releaseDiff.commits.length > 10) {
        lines.push(
          `    ... and ${summary.releaseDiff.commits.length - 10} more`,
        );
      }
    }
    lines.push("");
  }

  // Blockers
  if (summary.blockers.length > 0) {
    lines.push("🚫 Blockers:");
    for (const b of summary.blockers) {
      lines.push(`  - ${b}`);
    }
    lines.push("");
  }

  // Warnings
  if (summary.warnings.length > 0) {
    lines.push("⚠️ Warnings:");
    for (const w of summary.warnings) {
      lines.push(`  - ${w}`);
    }
    lines.push("");
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
