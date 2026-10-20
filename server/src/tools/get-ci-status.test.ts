import { describe, it, expect, vi, afterEach } from "vitest";
import { createGetCIStatusTool } from "./get-ci-status.js";
import type { DeployCheckConfig } from "../config/schema.js";

const mockConfig: DeployCheckConfig = {
  project: "test",
  environments: {
    staging: {
      url: "https://staging.test.com",
      health_endpoint: "/health",
      docker_image: "test/api",
      docker_tag_source: "git",
    },
  },
  ci: { provider: "github-actions", repo: "owner/repo", branch: "main" },
  git: { staging_ref: "staging", production_ref: "production" },
};

describe("createGetCIStatusTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  it("has correct tool definition", () => {
    const tool = createGetCIStatusTool(mockConfig);
    expect(tool.definition.name).toBe("get_ci_status");
  });

  it("returns error when token missing", async () => {
    delete process.env.GITHUB_TOKEN;
    const tool = createGetCIStatusTool(mockConfig);
    const result = await tool.handle({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("GitHub token is required");
  });

  it("returns CI status on success", async () => {
    process.env.GITHUB_TOKEN = "test-token";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            total_count: 1,
            workflow_runs: [
              {
                name: "CI",
                status: "completed",
                conclusion: "success",
                head_sha: "abc1234",
                head_branch: "main",
                html_url: "https://github.com/owner/repo/actions/runs/1",
                created_at: "2026-01-01T00:00:00Z",
              },
            ],
          }),
      }),
    );

    const tool = createGetCIStatusTool(mockConfig);
    const result = await tool.handle({});
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("SUCCESS");
    expect(result.content[0].text).toContain("CI");
  });

  it("uses custom branch when provided", async () => {
    process.env.GITHUB_TOKEN = "test-token";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          total_count: 1,
          workflow_runs: [
            {
              name: "CI",
              status: "completed",
              conclusion: "success",
              head_sha: "abc1234",
              head_branch: "develop",
              html_url: "https://github.com/owner/repo/actions/runs/1",
              created_at: "2026-01-01T00:00:00Z",
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const tool = createGetCIStatusTool(mockConfig);
    await tool.handle({ branch: "develop" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("branch=develop");
  });
});
