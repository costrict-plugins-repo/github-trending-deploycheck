import { describe, it, expect } from "vitest";
import { configSchema } from "./schema.js";

const validConfig = {
  project: "my-app",
  environments: {
    staging: {
      url: "https://staging.myapp.com",
      health_endpoint: "/api/health",
      docker_image: "myapp/api",
      docker_tag_source: "git",
    },
    production: {
      url: "https://myapp.com",
      health_endpoint: "/api/health",
      docker_image: "myapp/api",
      docker_tag_source: "git",
    },
  },
  ci: {
    provider: "github-actions",
    repo: "owner/repo",
    branch: "main",
  },
  git: {
    staging_ref: "staging",
    production_ref: "production",
  },
};

describe("configSchema", () => {
  it("accepts a valid config", () => {
    const result = configSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("applies defaults for git refs when git is omitted", () => {
    const { git: _git, ...withoutGit } = validConfig;
    const result = configSchema.safeParse(withoutGit);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.git.staging_ref).toBe("staging");
      expect(result.data.git.production_ref).toBe("production");
    }
  });

  it("applies default branch when omitted", () => {
    const config = {
      ...validConfig,
      ci: { provider: "github-actions", repo: "owner/repo" },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ci.branch).toBe("main");
    }
  });

  it("rejects missing project name", () => {
    const { project: _project, ...rest } = validConfig;
    const result = configSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty environments", () => {
    const config = { ...validConfig, environments: {} };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("rejects invalid URL", () => {
    const config = {
      ...validConfig,
      environments: {
        staging: {
          ...validConfig.environments.staging,
          url: "not-a-url",
        },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("rejects health endpoint not starting with /", () => {
    const config = {
      ...validConfig,
      environments: {
        staging: {
          ...validConfig.environments.staging,
          health_endpoint: "api/health",
        },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("rejects unknown CI provider", () => {
    const config = {
      ...validConfig,
      ci: { ...validConfig.ci, provider: "jenkins" },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("accepts gitlab-ci provider", () => {
    const config = {
      ...validConfig,
      ci: { ...validConfig.ci, provider: "gitlab-ci" },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("rejects missing CI repo", () => {
    const config = {
      ...validConfig,
      ci: { provider: "github-actions", repo: "" },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("defaults docker_tag_source to git", () => {
    const config = {
      ...validConfig,
      environments: {
        staging: {
          url: "https://staging.myapp.com",
          health_endpoint: "/health",
          docker_image: "myapp/api",
        },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.environments.staging.docker_tag_source).toBe("git");
    }
  });
});
