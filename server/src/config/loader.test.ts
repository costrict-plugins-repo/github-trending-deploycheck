import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "./loader.js";

const testDir = join(tmpdir(), "deploycheck-test-" + process.pid);

const validYaml = `
project: test-app
environments:
  staging:
    url: https://staging.test.com
    health_endpoint: /health
    docker_image: test/api
    docker_tag_source: git
ci:
  provider: github-actions
  repo: owner/repo
  branch: main
git:
  staging_ref: staging
  production_ref: production
`;

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("loads and parses a valid config file", () => {
    const path = join(testDir, "deploycheck.yml");
    writeFileSync(path, validYaml);

    const config = loadConfig(path);
    expect(config.project).toBe("test-app");
    expect(config.environments.staging.url).toBe("https://staging.test.com");
    expect(config.ci.provider).toBe("github-actions");
  });

  it("throws on missing file", () => {
    expect(() => loadConfig(join(testDir, "nonexistent.yml"))).toThrow(
      "Config file not found",
    );
  });

  it("throws on invalid YAML", () => {
    const path = join(testDir, "bad.yml");
    writeFileSync(path, ":\n  :\n    invalid: [yaml");

    expect(() => loadConfig(path)).toThrow("Invalid YAML");
  });

  it("throws on invalid config schema", () => {
    const path = join(testDir, "invalid.yml");
    writeFileSync(path, "project: test\nenvironments: {}");

    expect(() => loadConfig(path)).toThrow("Invalid deploycheck config");
  });

  it("includes field path in validation errors", () => {
    const path = join(testDir, "invalid2.yml");
    writeFileSync(
      path,
      `
project: test
environments:
  staging:
    url: not-a-url
    health_endpoint: /health
    docker_image: test/api
ci:
  provider: github-actions
  repo: owner/repo
`,
    );

    expect(() => loadConfig(path)).toThrow("environments.staging.url");
  });
});
