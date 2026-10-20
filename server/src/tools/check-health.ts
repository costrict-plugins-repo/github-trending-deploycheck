import type { DeployCheckConfig } from "../config/schema.js";
import type { HealthCheckResult, ToolHandler, ToolResult } from "../types.js";

/**
 * Creates the check_health MCP tool handler that pings environment health endpoints.
 * Returns a ToolHandler with the tool's JSON Schema definition and its request handler.
 */
export function createCheckHealthTool(config: DeployCheckConfig): ToolHandler {
  return {
    definition: {
      name: "check_health",
      description:
        "Ping one or all environment health endpoints and return status + response time.",
      inputSchema: {
        type: "object",
        properties: {
          environment: {
            type: "string",
            description:
              "Environment name from config (e.g. 'staging', 'production'). Pass 'all' to check all.",
          },
        },
        required: ["environment"],
      },
    },

    handle: (args: Record<string, unknown>) => handleCheckHealth(args, config),
  };
}

/**
 * Handles incoming check_health tool calls. If the environment argument is "all",
 * checks every configured environment in parallel. Otherwise checks the single
 * named environment, returning an error if it doesn't exist in the config.
 */
async function handleCheckHealth(
  args: Record<string, unknown>,
  config: DeployCheckConfig,
): Promise<ToolResult> {
  const envName = args.environment as string;

  if (envName === "all") {
    const results = await Promise.all(
      Object.entries(config.environments).map(([name, envConfig]) =>
        checkEndpoint(name, envConfig.url, envConfig.health_endpoint),
      ),
    );
    return formatResults(results);
  }

  const envConfig = config.environments[envName];
  if (!envConfig) {
    const available = Object.keys(config.environments).join(", ");
    return {
      content: [
        {
          type: "text",
          text: `Unknown environment: "${envName}". Available: ${available}`,
        },
      ],
      isError: true,
    };
  }

  const result = await checkEndpoint(
    envName,
    envConfig.url,
    envConfig.health_endpoint,
  );
  return formatResults([result]);
}

/**
 * Fetches a single health endpoint and measures response time. Returns a
 * HealthCheckResult indicating whether the endpoint responded with a 2xx status.
 * Times out after 5 seconds. On failure, distinguishes timeouts from other errors.
 */
export async function checkEndpoint(
  environment: string,
  baseUrl: string,
  healthPath: string,
): Promise<HealthCheckResult> {
  const url = `${baseUrl}${healthPath}`;
  const start = performance.now();

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
    const responseTimeMs = Math.round(performance.now() - start);

    return {
      environment,
      url,
      healthy: response.status >= 200 && response.status < 300,
      statusCode: response.status,
      responseTimeMs,
    };
  } catch (err) {
    const responseTimeMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : "Unknown error";
    const isTimeout = message.includes("abort") || message.includes("timeout");

    return {
      environment,
      url,
      healthy: false,
      statusCode: null,
      responseTimeMs: isTimeout ? responseTimeMs : null,
      error: isTimeout ? `Timeout after 5000ms` : message,
    };
  }
}

/**
 * Formats an array of HealthCheckResults into a human-readable text response,
 * showing status, URL, HTTP code, response time, and any error for each environment.
 */
function formatResults(results: HealthCheckResult[]): ToolResult {
  const lines = results.map((r) => {
    const status = r.healthy ? "✅ HEALTHY" : "❌ UNHEALTHY";
    const code = r.statusCode !== null ? `HTTP ${r.statusCode}` : "N/A";
    const time = r.responseTimeMs !== null ? `${r.responseTimeMs}ms` : "N/A";
    const error = r.error ? `\n  Error: ${r.error}` : "";
    return `${r.environment}: ${status}\n  URL: ${r.url}\n  Status: ${code}\n  Response time: ${time}${error}`;
  });

  return {
    content: [{ type: "text", text: lines.join("\n\n") }],
  };
}
