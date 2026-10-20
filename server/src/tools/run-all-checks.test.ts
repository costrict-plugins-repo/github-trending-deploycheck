import { describe, it, expect, vi, afterEach } from "vitest";
import { createRunAllChecksTool } from "./run-all-checks.js";
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
    production: {
      url: "https://prod.test.com",
      health_endpoint: "/health",
      docker_image: "test/api",
      docker_tag_source: "git",
    },
  },
  ci: { provider: "github-actions", repo: "owner/repo", branch: "main" },
  git: { staging_ref: "staging", production_ref: "production" },
};

describe("createRunAllChecksTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  it("has correct tool definition", () => {
    const tool = createRunAllChecksTool(mockConfig);
    expect(tool.definition.name).toBe("run_all_checks");
  });

  it("returns READY when all checks pass", async () => {
    process.env.GITHUB_TOKEN = "test-token";

    // Mock fetch to handle all different API calls
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/health")) {
        return Promise.resolve({ status: 200, ok: true });
      }
      if (url.includes("/actions/runs")) {
        return Promise.resolve({
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
        });
      }
      if (url.includes("/compare/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ahead_by: 0,
              total_commits: 0,
              html_url: "https://github.com/compare",
              commits: [],
              files: [],
            }),
        });
      }
      // Docker Hub tags
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 1,
            results: [
              { name: "v1.0.0", last_updated: "2026-01-01", digest: "sha:abc" },
            ],
          }),
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const tool = createRunAllChecksTool(mockConfig);
    const result = await tool.handle({});

    expect(result.content[0].text).toContain("READY");
    expect(result.content[0].text).toContain("Health Checks");
    expect(result.content[0].text).toContain("CI Status");
  });

  it("returns NOT READY when health check fails", async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("staging")) {
        return Promise.resolve({ status: 200, ok: true });
      }
      if (url.includes("prod")) {
        return Promise.resolve({ status: 503, ok: false });
      }
      // All other requests fail gracefully
      return Promise.reject(new Error("skip"));
    });
    vi.stubGlobal("fetch", mockFetch);

    const tool = createRunAllChecksTool(mockConfig);
    const result = await tool.handle({});

    expect(result.content[0].text).toContain("NOT READY");
    expect(result.content[0].text).toContain("Blocker");
  });
});
