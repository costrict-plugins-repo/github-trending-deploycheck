import { z } from "zod";

/**
 * Schema for a single deployment environment (e.g. staging, production).
 * Defines the target URL, health-check path, and the Docker image whose
 * deployed tag will be compared against the latest available tag.
 */
const environmentSchema = z.object({
  url: z.string().url("Environment URL must be a valid URL"),
  health_endpoint: z
    .string()
    .startsWith("/", "Health endpoint must start with /"),
  docker_image: z.string().min(1, "Docker image name is required"),
  docker_tag_source: z
    .enum(["git", "docker-hub"])
    .default("git")
    .describe("Where to resolve the latest tag from"),
});

/**
 * Schema for CI/CD provider configuration.
 * Used to query pipeline status for the project's repository and branch.
 */
const ciSchema = z.object({
  provider: z
    .enum(["github-actions", "gitlab-ci"])
    .describe("CI provider to use"),
  repo: z
    .string()
    .min(1, "Repository identifier is required (owner/repo or project ID)"),
  branch: z.string().default("main").describe("Branch to check CI status for"),
});

/**
 * Schema for git ref configuration.
 * Maps logical environment names (staging / production) to the actual
 * branches or tags used for release-diff comparisons.
 */
const gitSchema = z.object({
  staging_ref: z
    .string()
    .default("staging")
    .describe("Branch or tag representing staging"),
  production_ref: z
    .string()
    .default("production")
    .describe("Branch or tag representing production"),
});

/**
 * Top-level configuration schema for a DeployCheck project.
 * Combines the project name, one or more environments, CI settings,
 * and optional git ref overrides into a single validated config object.
 */
export const configSchema = z.object({
  project: z.string().min(1, "Project name is required"),
  environments: z
    .record(z.string(), environmentSchema)
    .refine((envs) => Object.keys(envs).length > 0, {
      message: "At least one environment must be defined",
    }),
  ci: ciSchema,
  git: gitSchema
    .optional()
    .default({ staging_ref: "staging", production_ref: "production" }),
});

/** Inferred TypeScript type for a fully validated DeployCheck configuration. */
export type DeployCheckConfig = z.infer<typeof configSchema>;

/** Inferred TypeScript type for a single environment entry within the config. */
export type EnvironmentConfig = z.infer<typeof environmentSchema>;
