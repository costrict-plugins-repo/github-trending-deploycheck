export type HealthCheckResult = {
  environment: string;
  url: string;
  healthy: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  error?: string;
};

export type CIRun = {
  workflowName: string;
  status: "success" | "failure" | "in_progress" | "cancelled" | "unknown";
  conclusion: string | null;
  commitSha: string;
  branch: string;
  link: string;
  createdAt: string;
};

export interface CIProvider {
  getLatestRun(repo: string, branch: string): Promise<CIRun>;
}

export interface RegistryProvider {
  getImageTag(image: string): Promise<string>;
  getImageTags(image: string, count?: number): Promise<string[]>;
}

export type EnvComparison = {
  source: string;
  target: string;
  sourceHealth: HealthCheckResult;
  targetHealth: HealthCheckResult;
  sourceTag: string | null;
  targetTag: string | null;
  tagMatch: boolean;
  differences: string[];
};

export type ReleaseDiff = {
  sourceRef: string;
  targetRef: string;
  aheadBy: number;
  commits: Array<{
    sha: string;
    message: string;
    author: string;
  }>;
  filesChanged: number;
  compareUrl: string;
};

export type CheckSummary = {
  overallStatus: "READY" | "NOT READY" | "WARNINGS";
  healthChecks: HealthCheckResult[];
  ciStatus: CIRun | null;
  envComparison: EnvComparison | null;
  releaseDiff: ReleaseDiff | null;
  blockers: string[];
  warnings: string[];
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type ToolHandler = {
  definition: ToolDefinition;
  handle(args: Record<string, unknown>): Promise<ToolResult>;
};

export type ToolResult = {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
};
