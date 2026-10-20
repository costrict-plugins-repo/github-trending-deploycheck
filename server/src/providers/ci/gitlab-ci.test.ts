import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitLabCIProvider } from "./gitlab-ci.js";

describe("GitLabCIProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITLAB_TOKEN;
  });

  it("throws without token", () => {
    delete process.env.GITLAB_TOKEN;
    expect(() => new GitLabCIProvider()).toThrow("GitLab token is required");
  });

  it("creates provider with explicit token", () => {
    const provider = new GitLabCIProvider("test-token");
    expect(provider).toBeDefined();
  });

  it("fetches latest pipeline successfully", async () => {
    const mockPipelines = [
      {
        id: 42,
        status: "success",
        ref: "main",
        sha: "def456",
        web_url: "https://gitlab.com/owner/repo/-/pipelines/42",
        created_at: "2026-01-01T00:00:00Z",
        source: "push",
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPipelines),
      }),
    );

    const provider = new GitLabCIProvider("test-token");
    const run = await provider.getLatestRun("owner/repo", "main");

    expect(run.workflowName).toBe("Pipeline #42");
    expect(run.status).toBe("success");
    expect(run.commitSha).toBe("def456");
  });

  it("throws when no pipelines found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      }),
    );

    const provider = new GitLabCIProvider("test-token");
    await expect(provider.getLatestRun("owner/repo", "main")).rejects.toThrow(
      "No pipelines found",
    );
  });

  it("maps failed status correctly", async () => {
    const mockPipelines = [
      {
        id: 43,
        status: "failed",
        ref: "main",
        sha: "abc123",
        web_url: "https://gitlab.com/owner/repo/-/pipelines/43",
        created_at: "2026-01-01T00:00:00Z",
        source: "push",
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPipelines),
      }),
    );

    const provider = new GitLabCIProvider("test-token");
    const run = await provider.getLatestRun("owner/repo", "main");
    expect(run.status).toBe("failure");
  });

  it("maps running status to in_progress", async () => {
    const mockPipelines = [
      {
        id: 44,
        status: "running",
        ref: "main",
        sha: "xyz789",
        web_url: "https://gitlab.com/owner/repo/-/pipelines/44",
        created_at: "2026-01-01T00:00:00Z",
        source: "push",
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPipelines),
      }),
    );

    const provider = new GitLabCIProvider("test-token");
    const run = await provider.getLatestRun("owner/repo", "main");
    expect(run.status).toBe("in_progress");
  });
});
