import type { CIProvider, CIRun } from "../../types.js";

const GITHUB_API = "https://api.github.com";

/** Raw workflow run shape returned by the GitHub Actions API. */
type GitHubWorkflowRun = {
  name: string;
  status: string;
  conclusion: string | null;
  head_sha: string;
  head_branch: string;
  html_url: string;
  created_at: string;
};

/** Envelope for the GET /repos/{owner}/{repo}/actions/runs endpoint. */
type GitHubRunsResponse = {
  total_count: number;
  workflow_runs: GitHubWorkflowRun[];
};

/**
 * CI provider that queries GitHub Actions workflow runs via the REST API.
 *
 * Requires a personal-access or fine-grained token with `actions:read` scope.
 * The token can be passed explicitly or read from the GITHUB_TOKEN env var.
 */
export class GitHubActionsProvider implements CIProvider {
  private token: string;

  /**
   * @param token - GitHub API token. Falls back to the GITHUB_TOKEN environment
   *               variable when omitted. Throws if neither is available.
   */
  constructor(token?: string) {
    const tokenClarified = token ?? process.env.GITHUB_TOKEN;
    if (!tokenClarified) {
      throw new Error(
        "GitHub token is required. Set GITHUB_TOKEN environment variable.",
      );
    }
    this.token = tokenClarified;
  }

  /**
   * Fetches the most recent workflow run for a given repository and branch.
   *
   * @param repo   - Repository in "owner/repo" format (e.g. "acme/api").
   * @param branch - Branch name to filter runs by.
   * @returns The latest CI run mapped to the normalized {@link CIRun} shape.
   * @throws If the API request fails or no runs exist for the branch.
   */
  async getLatestRun(repo: string, branch: string): Promise<CIRun> {
    const url = `${GITHUB_API}/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "deploycheck",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${body}`);
    }

    const data = (await response.json()) satisfies GitHubRunsResponse;

    if (data.total_count === 0 || data.workflow_runs.length === 0) {
      throw new Error(`No workflow runs found for ${repo} on branch ${branch}`);
    }

    const run = data.workflow_runs[0];
    return {
      workflowName: run.name,
      status: mapGitHubStatus(run.status, run.conclusion),
      conclusion: run.conclusion,
      commitSha: run.head_sha,
      branch: run.head_branch,
      link: run.html_url,
      createdAt: run.created_at,
    };
  }
}

/**
 * Maps GitHub's two-field status model (status + conclusion) to the unified
 * {@link CIRun.status} enum used throughout deploycheck.
 *
 * GitHub keeps `conclusion` null until the run completes, so both fields are
 * needed to derive the final state.
 */
function mapGitHubStatus(
  status: string,
  conclusion: string | null,
): CIRun["status"] {
  if (status === "completed") {
    switch (conclusion) {
      case "success":
        return "success";
      case "failure":
        return "failure";
      case "cancelled":
        return "cancelled";
      default:
        return "unknown";
    }
  }
  if (status === "in_progress" || status === "queued" || status === "waiting") {
    return "in_progress";
  }
  return "unknown";
}
