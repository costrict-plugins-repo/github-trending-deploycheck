import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCheckHealthTool, checkEndpoint } from "./check-health.js";
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

describe("checkEndpoint", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns healthy for 200 response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await checkEndpoint(
      "staging",
      "https://staging.test.com",
      "/health",
    );
    expect(result.healthy).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.responseTimeMs).toBeTypeOf("number");
    expect(result.environment).toBe("staging");
  });

  it("returns unhealthy for 500 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 500, ok: false }),
    );

    const result = await checkEndpoint(
      "staging",
      "https://staging.test.com",
      "/health",
    );
    expect(result.healthy).toBe(false);
    expect(result.statusCode).toBe(500);
  });

  it("returns unhealthy on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    const result = await checkEndpoint(
      "staging",
      "https://staging.test.com",
      "/health",
    );
    expect(result.healthy).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.error).toContain("ECONNREFUSED");
  });
});

describe("createCheckHealthTool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns tool definition with correct name", () => {
    const tool = createCheckHealthTool(mockConfig);
    expect(tool.definition.name).toBe("check_health");
    expect(tool.definition.inputSchema.required).toContain("environment");
  });

  it("returns error for unknown environment", async () => {
    const tool = createCheckHealthTool(mockConfig);
    const result = await tool.handle({ environment: "dev" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown environment");
  });

  it("checks a single environment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 200, ok: true }),
    );

    const tool = createCheckHealthTool(mockConfig);
    const result = await tool.handle({ environment: "staging" });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("staging");
    expect(result.content[0].text).toContain("HEALTHY");
  });

  it("checks all environments", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 200, ok: true }),
    );

    const tool = createCheckHealthTool(mockConfig);
    const result = await tool.handle({ environment: "all" });
    expect(result.content[0].text).toContain("staging");
    expect(result.content[0].text).toContain("production");
  });
});
