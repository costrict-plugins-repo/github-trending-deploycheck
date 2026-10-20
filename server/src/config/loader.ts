import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
/**
 * TypeScript module resolution. When tsc compiles with "moduleResolution": "node16" or "nodenext", runtime imports resolve to .js files (the compiled output), not .ts source files.
 * TypeScript requires us to write the import path as it will exist after compilation.
 * So import { configSchema, DeployCheckConfig } from './schema.js' means: "at runtime, load ./schema.js" — which is what schema.ts compiles to.
 * TypeScript understands this and type-checks against schema.ts during compilation.
 * This is standard behavior for ESM-based TypeScript projects (which this is — "type": "module" in package.json).
 */
import { configSchema, type DeployCheckConfig } from "./schema.js";

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

function findConfigPath(): string {
  const envPath = process.env.DEPLOYCHECK_CONFIG;
  if (envPath) {
    return resolve(envPath);
  }
  return resolve(process.cwd(), "deploycheck.yml");
}

/**
 * Loads and validates the DeployCheck configuration from a YAML file.
 *
 * Resolution order for the config file path:
 * 1. Explicit `configPath` argument
 * 2. `DEPLOYCHECK_CONFIG` environment variable
 * 3. `deploycheck.yml` in the current working directory
 *
 * The raw YAML is parsed and then validated against {@link configSchema}.
 *
 * @param configPath - Optional absolute or relative path to the config file.
 * @returns A fully validated {@link DeployCheckConfig} with Zod defaults applied.
 * @throws If the file is missing, unreadable, contains invalid YAML, or fails schema validation.
 */
export function loadConfig(configPath?: string): DeployCheckConfig {
  const path = configPath ?? findConfigPath();

  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      throw new Error(
        `Config file not found: ${path}\n` +
          `Create a deploycheck.yml in your project root or set DEPLOYCHECK_CONFIG env var.`,
        { cause: err },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read config file: ${path} — ${message}`, {
      cause: err,
    });
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`Invalid YAML in ${path}: ${(err as Error).message}`, {
      cause: err,
    });
  }

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid deploycheck config in ${path}:\n${issues}`);
  }

  return result.data;
}
