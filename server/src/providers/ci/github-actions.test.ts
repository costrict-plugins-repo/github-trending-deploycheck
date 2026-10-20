import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitHubActionsProvider } from "./github-actions.js";

describe("GitHubActionsProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  it("throws without token", () => {
    delete process.env.GITHUB_TOKEN;
    expect(() => new GitHubActionsProvider()).toThrow(
      "GitHub token is required",
    );
  });

  it("creates provider with explicit token", () => {
    const provider = new GitHubActionsProvider("test-token");
    expect(provider).toBeDefined();
  });

  it("creates provider from env var", () => {
    process.env.GITHUB_TOKEN = "env-token";
    const provider = new GitHubActionsProvider();
    expect(provider).toBeDefined();
  });

  it("fetches latest run successfully", async () => {
    const mockRun = {
      total_count: 1,
      workflow_runs: [
        {
          name: "CI",
          status: "completed",
          conclusion: "success",
          head_sha: "abc1234567890",
          head_branch: "main",
          html_url: "https://github.com/owner/repo/actions/runs/1",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRun),
      }),
    );

    const provider = new GitHubActionsProvider("test-token");
    const run = await provider.getLatestRun("owner/repo", "main");

    expect(run.workflowName).toBe("CI");
    expect(run.status).toBe("success");
    expect(run.commitSha).toBe("abc1234567890");
    expect(run.branch).toBe("main");
  });

  it("throws when no runs found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ total_count: 0, workflow_runs: [] }),
      }),
    );

    const provider = new GitHubActionsProvider("test-token");
    await expect(provider.getLatestRun("owner/repo", "main")).rejects.toThrow(
      "No workflow runs found",
    );
  });

  it("throws on API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve("Forbidden"),
      }),
    );

    const provider = new GitHubActionsProvider("test-token");
    await expect(provider.getLatestRun("owner/repo", "main")).rejects.toThrow(
      "GitHub API error (403)",
    );
  });

  it("maps in_progress status correctly", async () => {
    const mockRun = {
      total_count: 1,
      workflow_runs: [
        {
          name: "CI",
          status: "in_progress",
          conclusion: null,
          head_sha: "abc1234",
          head_branch: "main",
          html_url: "https://github.com/owner/repo/actions/runs/1",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRun),
      }),
    );

    const provider = new GitHubActionsProvider("test-token");
    const run = await provider.getLatestRun("owner/repo", "main");
    expect(run.status).toBe("in_progress");
  });
});
