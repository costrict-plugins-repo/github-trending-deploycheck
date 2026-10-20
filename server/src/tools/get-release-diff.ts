import type { DeployCheckConfig } from "../config/schema.js";
import type { ReleaseDiff, ToolHandler, ToolResult } from "../types.js";

const GITHUB_API = "https://api.github.com";

type GitHubCompareResponse = {
  ahead_by: number;
  total_commits: number;
  html_url: string;
  commits: Array<{
    sha: string;
    commit: {
      message: string;
      author: {
        name: string;
      };
    };
  }>;
  files?: Array<{
    filename: string;
  }>;
};

/**
 * Handles the get_release_diff tool invocation by resolving source/target refs
 * from args or config defaults, then fetching and formatting the diff.
 */
async function handleGetReleaseDiff(
  config: DeployCheckConfig,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const sourceRef =
    (args.source_ref as string) || config.git?.staging_ref || "staging";
  const targetRef =
    (args.target_ref as string) || config.git?.production_ref || "production";

  try {
    const diff = await getReleaseDiff(config.ci.repo, sourceRef, targetRef);
    return formatDiff(diff);
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to get release diff: ${(err as Error).message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Creates the get_release_diff tool handler, which shows what would be
 * deployed by comparing commits between staging and production refs.
 */
export function createGetReleaseDiffTool(
  config: DeployCheckConfig,
): ToolHandler {
  return {
    definition: {
      name: "get_release_diff",
      description:
        "Show what would be deployed — commits between staging and production refs.",
      inputSchema: {
        type: "object",
        properties: {
          source_ref: {
            type: "string",
            description:
              "Source ref (branch/tag). Defaults to staging_ref from config.",
          },
          target_ref: {
            type: "string",
            description:
              "Target ref (branch/tag). Defaults to production_ref from config.",
          },
        },
      },
    },

    handle: (args: Record<string, unknown>) =>
      handleGetReleaseDiff(config, args),
  };
}

/**
 * Fetches the commit comparison between two refs from the GitHub API
 * and returns a structured ReleaseDiff object.
 */
export async function getReleaseDiff(
  repo: string,
  sourceRef: string,
  targetRef: string,
): Promise<ReleaseDiff> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "GitHub token is required for release diff. Set GITHUB_TOKEN environment variable.",
    );
  }

  const url = `${GITHUB_API}/repos/${repo}/compare/${encodeURIComponent(targetRef)}...${encodeURIComponent(sourceRef)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "deploycheck",
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${body}`);
  }

  const data = (await response.json()) as GitHubCompareResponse;

  return {
    sourceRef,
    targetRef,
    aheadBy: data.ahead_by,
    commits: data.commits.map((c) => ({
      sha: c.sha.substring(0, 7),
      message: c.commit.message.split("\n")[0],
      author: c.commit.author.name,
    })),
    filesChanged: data.files?.length ?? 0,
    compareUrl: data.html_url,
  };
}

/**
 * Formats a ReleaseDiff into a human-readable ToolResult, showing
 * commit list and compare URL, or an "in sync" message if nothing to deploy.
 */
function formatDiff(diff: ReleaseDiff): ToolResult {
  if (diff.aheadBy === 0) {
    return {
      content: [
        {
          type: "text",
          text: `✅ ${diff.sourceRef} and ${diff.targetRef} are in sync. Nothing to deploy.`,
        },
      ],
    };
  }

  const lines = [
    `📦 Release Diff: ${diff.sourceRef} → ${diff.targetRef}`,
    `${diff.aheadBy} commit(s) ahead, ${diff.filesChanged} file(s) changed`,
    "",
    "Commits:",
  ];

  for (const commit of diff.commits) {
    lines.push(`  ${commit.sha} ${commit.message} (${commit.author})`);
  }

  lines.push("", `Compare: ${diff.compareUrl}`);

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
