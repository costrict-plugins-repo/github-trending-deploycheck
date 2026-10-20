import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createGetReleaseDiffTool,
  getReleaseDiff,
} from "./get-release-diff.js";
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

describe("getReleaseDiff", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  it("throws without GITHUB_TOKEN", async () => {
    delete process.env.GITHUB_TOKEN;
    await expect(
      getReleaseDiff("owner/repo", "staging", "production"),
    ).rejects.toThrow("GitHub token is required");
  });

  it("returns diff data on success", async () => {
    process.env.GITHUB_TOKEN = "test-token";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ahead_by: 3,
            total_commits: 3,
            html_url: "https://github.com/owner/repo/compare/prod...staging",
            commits: [
              {
                sha: "abc1234567",
                commit: {
                  message: "feat: add feature\n\nDetails here",
                  author: { name: "Dev" },
                },
              },
              {
                sha: "def4567890",
                commit: {
                  message: "fix: bug fix",
                  author: { name: "Dev2" },
                },
              },
            ],
            files: [{ filename: "a.ts" }, { filename: "b.ts" }],
          }),
      }),
    );

    const diff = await getReleaseDiff("owner/repo", "staging", "production");
    expect(diff.aheadBy).toBe(3);
    expect(diff.commits).toHaveLength(2);
    expect(diff.commits[0].sha).toBe("abc1234");
    expect(diff.commits[0].message).toBe("feat: add feature");
    expect(diff.filesChanged).toBe(2);
  });
});

describe("createGetReleaseDiffTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  it("has correct tool definition", () => {
    const tool = createGetReleaseDiffTool(mockConfig);
    expect(tool.definition.name).toBe("get_release_diff");
  });

  it("uses config defaults for refs", async () => {
    process.env.GITHUB_TOKEN = "test-token";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ahead_by: 0,
          total_commits: 0,
          html_url:
            "https://github.com/owner/repo/compare/production...staging",
          commits: [],
          files: [],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const tool = createGetReleaseDiffTool(mockConfig);
    const result = await tool.handle({});

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("production...staging");
    expect(result.content[0].text).toContain("in sync");
  });
});
