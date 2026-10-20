import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config/loader.js";
import { createCheckHealthTool } from "./tools/check-health.js";
import { createGetCIStatusTool } from "./tools/get-ci-status.js";
import { createCompareEnvsTool } from "./tools/compare-envs.js";
import { createGetReleaseDiffTool } from "./tools/get-release-diff.js";
import { createRunAllChecksTool } from "./tools/run-all-checks.js";
import type { ToolHandler } from "./types.js";

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`[deploycheck] ${(err as Error).message}`);
    process.exit(1);
  }

  const server = new Server(
    {
      name: "deploycheck",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  const tools: Map<string, ToolHandler> = new Map();

  const toolFactories = [
    createCheckHealthTool,
    createGetCIStatusTool,
    createCompareEnvsTool,
    createGetReleaseDiffTool,
    createRunAllChecksTool,
  ];

  for (const factory of toolFactories) {
    const tool = factory(config);
    tools.set(tool.definition.name, tool);
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: Array.from(tools.values()).map((t) => t.definition),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = tools.get(name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      return await tool.handle(args ?? {});
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Tool "${name}" failed: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[deploycheck] Fatal error:", err);
  process.exit(1);
});
