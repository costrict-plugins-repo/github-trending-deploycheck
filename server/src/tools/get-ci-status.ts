import type { DeployCheckConfig } from "../config/schema.js";
import type { CIProvider, CIRun, ToolHandler, ToolResult } from "../types.js";
import { GitHubActionsProvider } from "../providers/ci/github-actions.js";
import { GitLabCIProvider } from "../providers/ci/gitlab-ci.js";

/**
 * Handles the get_ci_status tool invocation. Resolves the target branch,
 * instantiates the appropriate CI provider, fetches the latest run,
 * and returns a formatted result.
 * @param config - The deployment configuration.
 * @param args - The arguments containing an optional branch override.
 * @returns A ToolResult with the CI status or an error message.
 */
async function handleGetCIStatus(
  config: DeployCheckConfig,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const branch = (args.branch as string) || config.ci.branch;

  let provider: CIProvider;
  try {
    provider = createCIProvider(config.ci.provider);
  } catch (err) {
    return {
      content: [{ type: "text", text: (err as Error).message }],
      isError: true,
    };
  }

  try {
    const run = await provider.getLatestRun(config.ci.repo, branch);
    return formatCIRun(run);
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to get CI status: ${(err as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Creates the get_ci_status tool handler with its MCP definition
 * and binds the handle function to the provided config.
 * @param config - The deployment configuration.
 * @returns A ToolHandler for the get_ci_status tool.
 */
export function createGetCIStatusTool(config: DeployCheckConfig): ToolHandler {
  return {
    definition: {
      name: "get_ci_status",
      description:
        "Get the latest CI pipeline status for the configured branch.",
      inputSchema: {
        type: "object",
        properties: {
          branch: {
            type: "string",
            description:
              "Branch to check. Defaults to config branch if omitted.",
          },
        },
      },
    },

    handle: (args: Record<string, unknown>) => handleGetCIStatus(config, args),
  };
}

/**
 * Instantiates the correct CI provider based on the provider name string.
 * Throws if the provider name is not recognized.
 * @param providerName - The name of the CI provider (e.g., "github-actions").
 * @returns An instance of a CIProvider implementation.
 * @throws Error if the provider name is unknown.
 */
export function createCIProvider(providerName: string): CIProvider {
  switch (providerName) {
    case "github-actions":
      return new GitHubActionsProvider();
    case "gitlab-ci":
      return new GitLabCIProvider();
    default:
      throw new Error(`Unknown CI provider: ${providerName}`);
  }
}

/**
 * Convenience wrapper that fetches the latest CI run for a given config
 * and optional branch override. Used by other tools (e.g. run-all-checks).
 * @param config - The deployment configuration.
 * @param branch - Optional branch name to override config branch.
 * @returns A Promise resolving to the latest CIRun object.
 */
export function getCIRun(
  config: DeployCheckConfig,
  branch?: string,
): Promise<CIRun> {
  const provider = createCIProvider(config.ci.provider);
  return provider.getLatestRun(config.ci.repo, branch ?? config.ci.branch);
}

/**
 * Formats a CIRun into a human-readable ToolResult with a status icon,
 * workflow details, commit SHA, and a link to the run.
 * @param run - The CIRun object containing the CI run details.
 * @returns A ToolResult with the formatted CI run information.
 */
function formatCIRun(run: CIRun): ToolResult {
  const statusIcon =
    run.status === "success"
      ? "✅"
      : run.status === "failure"
        ? "❌"
        : run.status === "in_progress"
          ? "⏳"
          : "⚠️";

  const text = [
    `${statusIcon} CI Status: ${run.status.toUpperCase()}`,
    `Workflow: ${run.workflowName}`,
    `Branch: ${run.branch}`,
    `Commit: ${run.commitSha.substring(0, 7)}`,
    `Conclusion: ${run.conclusion ?? "N/A"}`,
    `Created: ${run.createdAt}`,
    `Link: ${run.link}`,
  ].join("\n");

  return { content: [{ type: "text", text }] };
}
