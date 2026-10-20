import type { CIProvider, CIRun } from "../../types.js";

const GITLAB_API = "https://gitlab.com/api/v4";

/** Raw pipeline shape returned by the GitLab Pipelines API. */
type GitLabPipeline = {
  id: number;
  status: string;
  ref: string;
  sha: string;
  web_url: string;
  created_at: string;
  source: string;
};

/**
 * CI provider that queries GitLab CI/CD pipelines via the REST API.
 *
 * Requires a personal or project access token with `read_api` scope.
 * The token can be passed explicitly or read from the GITLAB_TOKEN env var.
 * Supports self-hosted GitLab instances through the `apiBase` parameter.
 */
export class GitLabCIProvider implements CIProvider {
  private token: string;
  private apiBase: string;

  /**
   * @param token   - GitLab API token. Falls back to the GITLAB_TOKEN environment
   *                  variable when omitted. Throws if neither is available.
   * @param apiBase - Base URL for the GitLab API. Defaults to the public
   *                  gitlab.com v4 endpoint; override for self-hosted instances.
   */
  constructor(token?: string, apiBase?: string) {
    const t = token ?? process.env.GITLAB_TOKEN;
    if (!t) {
      throw new Error(
        "GitLab token is required. Set GITLAB_TOKEN environment variable.",
      );
    }
    this.token = t;
    this.apiBase = apiBase ?? GITLAB_API;
  }

  /**
   * Fetches the most recent pipeline for a given project and branch.
   *
   * The repo identifier is URL-encoded so both numeric IDs and namespaced
   * paths (e.g. "group/subgroup/project") work with the GitLab API.
   *
   * @param repo   - GitLab project path or numeric ID (e.g. "acme/api" or "12345").
   * @param branch - Branch name (ref) to filter pipelines by.
   * @returns The latest pipeline mapped to the normalized {@link CIRun} shape.
   * @throws If the API request fails or no pipelines exist for the branch.
   */
  async getLatestRun(repo: string, branch: string): Promise<CIRun> {
    const projectId = encodeURIComponent(repo);
    const url = `${this.apiBase}/projects/${projectId}/pipelines?ref=${encodeURIComponent(branch)}&per_page=1&order_by=id&sort=desc`;

    const response = await fetch(url, {
      headers: {
        "PRIVATE-TOKEN": this.token,
        "User-Agent": "deploycheck",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitLab API error (${response.status}): ${body}`);
    }

    const pipelines = (await response.json()) satisfies GitLabPipeline[];

    if (pipelines.length === 0) {
      throw new Error(`No pipelines found for ${repo} on branch ${branch}`);
    }

    const pipeline = pipelines[0];
    return {
      workflowName: `Pipeline #${pipeline.id}`,
      status: mapGitLabStatus(pipeline.status),
      conclusion: pipeline.status,
      commitSha: pipeline.sha,
      branch: pipeline.ref,
      link: pipeline.web_url,
      createdAt: pipeline.created_at,
    };
  }
}

/**
 * Maps a GitLab pipeline status string to the unified {@link CIRun.status} enum
 * used throughout deploycheck.
 *
 * GitLab uses a single `status` field (unlike GitHub's status + conclusion pair),
 * with several intermediate states that all map to "in_progress".
 */
function mapGitLabStatus(status: string): CIRun["status"] {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "failure";
    case "canceled":
      return "cancelled";
    case "running":
    case "pending":
    case "created":
    case "waiting_for_resource":
    case "preparing":
      return "in_progress";
    default:
      return "unknown";
  }
}
