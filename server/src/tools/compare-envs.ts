import type { DeployCheckConfig } from "../config/schema.js";
import type { EnvComparison, ToolHandler, ToolResult } from "../types.js";
import { checkEndpoint } from "./check-health.js";
import { DockerHubProvider } from "../providers/registry/docker-hub.js";

/**
 * Validates source/target environment names and delegates to compareEnvironments.
 *
 * @param config - The deployment configuration.
 * @param args - The arguments containing source and target environment names.
 * @returns A ToolResult with the comparison or an error message.
 */
async function handle(
  config: DeployCheckConfig,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const sourceName = args.source as string;
  const targetName = args.target as string;

  const sourceEnv = config.environments[sourceName];
  const targetEnv = config.environments[targetName];

  if (!sourceEnv || !targetEnv) {
    const available = Object.keys(config.environments).join(", ");
    const missing = !sourceEnv ? sourceName : targetName;
    return {
      content: [
        {
          type: "text",
          text: `Unknown environment: "${missing}". Available: ${available}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const comparison = await compareEnvironments(
      config,
      sourceName,
      targetName,
    );
    return formatComparison(comparison);
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to compare environments: ${(err as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Creates the compare_envs MCP tool, binding the given config to the handler.
 * @param config - The deployment configuration.
 * @returns A ToolHandler for the compare_envs tool.
 */
export function createCompareEnvsTool(config: DeployCheckConfig): ToolHandler {
  return {
    definition: {
      name: "compare_envs",
      description:
        "Compare two environments — Docker image tags, health status, or any other configured attributes.",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "Source environment (e.g. 'staging')",
          },
          target: {
            type: "string",
            description: "Target environment (e.g. 'production')",
          },
        },
        required: ["source", "target"],
      },
    },

    handle: (args) => handle(config, args),
  };
}

/**
 * Fetches health and Docker tag data for both environments and returns a diff summary.
 * @param config - The deployment configuration.
 * @param sourceName - The name of the source environment.
 * @param targetName - The name of the target environment.
 * @returns An EnvComparison object containing the comparison results.
 */
export async function compareEnvironments(
  config: DeployCheckConfig,
  sourceName: string,
  targetName: string,
): Promise<EnvComparison> {
  const sourceEnv = config.environments[sourceName];
  const targetEnv = config.environments[targetName];

  const registry = new DockerHubProvider();

  const [sourceHealth, targetHealth, sourceTag, targetTag] = await Promise.all([
    checkEndpoint(sourceName, sourceEnv.url, sourceEnv.health_endpoint),
    checkEndpoint(targetName, targetEnv.url, targetEnv.health_endpoint),
    fetchTag(registry, sourceEnv.docker_image),
    fetchTag(registry, targetEnv.docker_image),
  ]);

  const differences: string[] = [];

  if (sourceHealth.healthy !== targetHealth.healthy) {
    differences.push(
      `Health mismatch: ${sourceName}=${sourceHealth.healthy ? "healthy" : "unhealthy"}, ${targetName}=${targetHealth.healthy ? "healthy" : "unhealthy"}`,
    );
  }

  const tagMatch = sourceTag === targetTag;
  if (!tagMatch && sourceTag !== null && targetTag !== null) {
    differences.push(
      `Tag mismatch: ${sourceName}=${sourceTag}, ${targetName}=${targetTag}`,
    );
  }

  if (sourceHealth.statusCode !== targetHealth.statusCode) {
    differences.push(
      `Status code difference: ${sourceName}=${sourceHealth.statusCode}, ${targetName}=${targetHealth.statusCode}`,
    );
  }

  return {
    source: sourceName,
    target: targetName,
    sourceHealth,
    targetHealth,
    sourceTag,
    targetTag,
    tagMatch,
    differences,
  };
}

/**
 * Retrieves the latest Docker image tag, returning null on failure.
 * @param registry - The DockerHubProvider instance.
 * @param image - The name of the Docker image.
 * @returns The latest Docker image tag or null if retrieval fails.
 */
async function fetchTag(
  registry: DockerHubProvider,
  image: string,
): Promise<string | null> {
  try {
    return await registry.getImageTag(image);
  } catch {
    return null;
  }
}

/**
 * Formats an EnvComparison into a human-readable ToolResult with status icons.
 * @param comp - The EnvComparison object containing the comparison results.
 * @returns A ToolResult with the formatted comparison.
 */
function formatComparison(comp: EnvComparison): ToolResult {
  const sourceHealthIcon = comp.sourceHealth.healthy ? "✅" : "❌";
  const targetHealthIcon = comp.targetHealth.healthy ? "✅" : "❌";
  const tagIcon = comp.tagMatch ? "✅" : "⚠️";

  const lines = [
    `📊 Environment Comparison: ${comp.source} vs ${comp.target}`,
    "",
    `Health:`,
    `  ${comp.source}: ${sourceHealthIcon} ${comp.sourceHealth.healthy ? "Healthy" : "Unhealthy"} (${comp.sourceHealth.statusCode ?? "N/A"}, ${comp.sourceHealth.responseTimeMs ?? "N/A"}ms)`,
    `  ${comp.target}: ${targetHealthIcon} ${comp.targetHealth.healthy ? "Healthy" : "Unhealthy"} (${comp.targetHealth.statusCode ?? "N/A"}, ${comp.targetHealth.responseTimeMs ?? "N/A"}ms)`,
    "",
    `Docker Tags: ${tagIcon}`,
    `  ${comp.source}: ${comp.sourceTag ?? "unknown"}`,
    `  ${comp.target}: ${comp.targetTag ?? "unknown"}`,
  ];

  if (comp.differences.length > 0) {
    lines.push("", "⚠️ Differences:");
    for (const diff of comp.differences) {
      lines.push(`  - ${diff}`);
    }
  } else {
    lines.push("", "✅ No differences detected");
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
