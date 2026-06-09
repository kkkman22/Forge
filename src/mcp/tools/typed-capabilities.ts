import { z } from "zod";
import { buildHealthSnapshot } from "../../doctor.js";
import { type EvidenceArtifactKind, queryEvidenceArtifacts } from "../../evidence-artifact.js";
import { parseDiffStat, parseStatusPorcelain } from "../trimmers/git.js";
import { execCommand } from "./forge-exec.js";

export const TYPED_CAPABILITY_TOOL_NAMES = [
  "forge_check_command",
  "forge_diff_summary",
  "forge_dist_sync",
  "forge_docs_drift",
  "forge_artifact_query",
  "forge_review_context",
] as const;

export type TypedCapabilityToolName = (typeof TYPED_CAPABILITY_TOOL_NAMES)[number];

export type TypedCapabilityConsumer = "doctor" | "status" | "review" | "ship";

const CapabilityStatusSchema = z.enum(["pass", "fail", "warn", "unknown"]);
const EvidenceKindSchema = z.enum([
  "review",
  "test",
  "ship_gate",
  "verify",
  "mutation",
  "docs_check",
  "dist_sync",
]);
const EvidenceResultSchema = z.enum(["pass", "fail", "warn", "blocked", "inconclusive"]);

const EvidenceArtifactSchema = z
  .object({
    schema_version: z.literal(1),
    artifact_id: z.string(),
    kind: EvidenceKindSchema,
    topic: z.string(),
    run_id: z.string(),
    trace_id: z.string().optional(),
    commit: z.string(),
    command: z.string().optional(),
    exit_code: z.number().optional(),
    stdout_tail: z.string().optional(),
    stderr_tail: z.string().optional(),
    input_hash: z.string().optional(),
    result: EvidenceResultSchema,
    producer: z.string(),
    created_at: z.string(),
    supersedes: z.string().optional(),
  })
  .strict();

const CheckCommandOutputSchema = z
  .object({
    schema_version: z.literal(1),
    profile: z.string(),
    command: z.string(),
    exit_code: z.number(),
    status: z.enum(["pass", "fail"]),
    timed_out: z.boolean(),
    stdout_tail: z.string(),
    stderr_tail: z.string(),
  })
  .strict();

const DiffSummaryOutputSchema = z
  .object({
    schema_version: z.literal(1),
    status: CapabilityStatusSchema,
    summary: z
      .object({
        fileCount: z.number(),
        files: z.array(
          z
            .object({
              filePath: z.string(),
              added: z.number(),
              removed: z.number(),
            })
            .strict(),
        ),
        totalAdded: z.number(),
        totalRemoved: z.number(),
        fullDiffPath: z.string().nullable(),
      })
      .strict()
      .optional(),
    error: z.string().optional(),
  })
  .strict();

const GitStatusCategorySchema = z
  .object({
    count: z.number(),
    files: z.array(z.string()),
  })
  .strict();

const DistSyncOutputSchema = z
  .object({
    schema_version: z.literal(1),
    status: z.enum(["pass", "fail", "unknown"]),
    summary: z
      .object({
        staged: GitStatusCategorySchema,
        modified: GitStatusCategorySchema,
        untracked: GitStatusCategorySchema,
      })
      .strict()
      .optional(),
    error: z.string().optional(),
  })
  .strict();

const CommandDriftOutputSchema = z
  .object({
    schema_version: z.literal(1),
    status: z.enum(["pass", "fail"]),
    command: z.string(),
    exit_code: z.number(),
    stdout_tail: z.string(),
    stderr_tail: z.string(),
  })
  .strict();

const ArtifactQueryOutputSchema = z
  .object({
    schema_version: z.literal(1),
    artifacts: z.array(EvidenceArtifactSchema),
  })
  .strict();

const HealthReasonSchema = z
  .object({
    code: z.enum([
      "STATUS_UNKNOWN",
      "NO_NEXT_PHASE",
      "MISSING_ARTIFACT",
      "STALE_ARTIFACT",
      "FAILING_ARTIFACT",
    ]),
    source: z.string(),
    detail: z.string(),
  })
  .strict();

const HealthCheckSchema = z
  .object({
    status: CapabilityStatusSchema,
    message: z.string(),
    source: z.string().optional(),
  })
  .strict();

const ProgressHealthCheckSchema = HealthCheckSchema.extend({
  total: z.number(),
  completed: z.number(),
}).strict();

const HealthSnapshotSchema = z
  .object({
    task: z
      .object({
        id: z.string(),
        tier: z.string().optional(),
        phase: z.string().optional(),
      })
      .strict(),
    policyProfile: z.enum(["solo", "team", "enterprise"]),
    branch: HealthCheckSchema,
    worktree: HealthCheckSchema,
    spec: HealthCheckSchema,
    plan: HealthCheckSchema,
    progress: ProgressHealthCheckSchema,
    freshness: z
      .object({
        review: HealthCheckSchema,
        test: HealthCheckSchema,
      })
      .strict(),
    shipGate: HealthCheckSchema,
    distSync: HealthCheckSchema,
    docsDrift: HealthCheckSchema,
    toolHealth: HealthCheckSchema,
    gates: z.record(z.string(), HealthCheckSchema),
    artifacts: z.record(z.string(), z.string()),
    nextStep: z
      .object({
        phase: z.string().nullable(),
        allowed: z.boolean(),
        edge: z.string().optional(),
        reasons: z.array(HealthReasonSchema),
      })
      .strict(),
    generatedAt: z.string(),
  })
  .strict();

const ReviewContextOutputSchema = z
  .object({
    schema_version: z.literal(1),
    health: HealthSnapshotSchema,
    diff: DiffSummaryOutputSchema,
  })
  .strict();

const TypedCapabilityOutputSchemas = {
  forge_check_command: CheckCommandOutputSchema,
  forge_diff_summary: DiffSummaryOutputSchema,
  forge_dist_sync: DistSyncOutputSchema,
  forge_docs_drift: CommandDriftOutputSchema,
  forge_artifact_query: ArtifactQueryOutputSchema,
  forge_review_context: ReviewContextOutputSchema,
} satisfies Record<TypedCapabilityToolName, z.ZodType>;

const ConsumerTypedCapabilityPreferences = {
  doctor: ["forge_review_context", "forge_artifact_query", "forge_dist_sync", "forge_docs_drift"],
  status: ["forge_review_context", "forge_artifact_query"],
  review: ["forge_review_context", "forge_diff_summary"],
  ship: ["forge_artifact_query", "forge_dist_sync", "forge_docs_drift"],
} as const satisfies Record<TypedCapabilityConsumer, readonly TypedCapabilityToolName[]>;

export function validateTypedCapabilityOutput(toolName: TypedCapabilityToolName, value: unknown) {
  return TypedCapabilityOutputSchemas[toolName].safeParse(value);
}

export function preferredTypedCapabilitiesForConsumer(
  consumer: TypedCapabilityConsumer,
): TypedCapabilityToolName[] {
  return [...ConsumerTypedCapabilityPreferences[consumer]];
}

type ToolHandler = (input: Record<string, unknown>) => Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}>;

interface ToolServer {
  registerTool: unknown;
}

type ToolConfig = {
  description: string;
  inputSchema: Record<string, unknown>;
};

type RegisterTool = (name: string, config: ToolConfig, handler: ToolHandler) => unknown;

export function registerTypedCapabilityTools(server: ToolServer, root?: { path: string }): void {
  const projectRoot = root?.path ?? process.cwd();
  const registerTool = (name: string, config: ToolConfig, handler: ToolHandler): unknown =>
    (server.registerTool as RegisterTool).call(server, name, config, handler);

  registerTool(
    "forge_check_command",
    {
      description: "Run a configured Forge check profile and return structured JSON.",
      inputSchema: {
        profile: z.enum(["typecheck", "test", "check", "docs"]).default("check"),
      },
    },
    async ({ profile }) =>
      jsonToolResult("forge_check_command", await runCheckProfile(projectRoot, String(profile))),
  );

  registerTool(
    "forge_diff_summary",
    {
      description: "Return a structured git diff summary.",
      inputSchema: {},
    },
    async () => jsonToolResult("forge_diff_summary", await diffSummary(projectRoot)),
  );

  registerTool(
    "forge_dist_sync",
    {
      description: "Return structured dist-sync status without parsing human prose.",
      inputSchema: {},
    },
    async () => jsonToolResult("forge_dist_sync", await distSyncStatus(projectRoot)),
  );

  registerTool(
    "forge_docs_drift",
    {
      description: "Return structured docs drift status.",
      inputSchema: {},
    },
    async () => jsonToolResult("forge_docs_drift", await docsDriftStatus(projectRoot)),
  );

  registerTool(
    "forge_artifact_query",
    {
      description: "Query latest evidence artifacts by topic/kind/commit/run id.",
      inputSchema: {
        topic: z.string().optional(),
        kind: z
          .enum(["review", "test", "ship_gate", "verify", "mutation", "docs_check", "dist_sync"])
          .optional(),
        commit: z.string().optional(),
        run_id: z.string().optional(),
      },
    },
    async (input) =>
      jsonToolResult("forge_artifact_query", {
        schema_version: 1,
        artifacts: queryEvidenceArtifacts(projectRoot, {
          topic: typeof input.topic === "string" ? input.topic : undefined,
          kind: isEvidenceKind(input.kind) ? input.kind : undefined,
          commit: typeof input.commit === "string" ? input.commit : undefined,
          run_id: typeof input.run_id === "string" ? input.run_id : undefined,
        }),
      }),
  );

  registerTool(
    "forge_review_context",
    {
      description: "Return a structured review/status context bundle.",
      inputSchema: {
        currentHead: z.string().default("HEAD"),
      },
    },
    async (input) =>
      jsonToolResult("forge_review_context", {
        schema_version: 1,
        health: buildHealthSnapshot({
          projectRoot,
          currentHead: typeof input.currentHead === "string" ? input.currentHead : "HEAD",
        }),
        diff: await diffSummary(projectRoot),
      }),
  );
}

async function runCheckProfile(
  projectRoot: string,
  profile: string,
): Promise<Record<string, unknown>> {
  const command =
    profile === "typecheck"
      ? "npm run typecheck"
      : profile === "test"
        ? "npm test"
        : profile === "docs"
          ? "npm run docs:check"
          : "npm run check";
  const result = await execCommand(command, profile === "check" ? 300000 : 120000, {
    cwd: projectRoot,
  });
  return {
    schema_version: 1,
    profile,
    command,
    exit_code: result.exitCode,
    status: result.exitCode === 0 ? "pass" : "fail",
    timed_out: result.timedOut,
    stdout_tail: tail(result.stdout),
    stderr_tail: tail(result.stderr),
  };
}

async function diffSummary(projectRoot: string): Promise<Record<string, unknown>> {
  const result = await execCommand("git diff --stat", 30000, { cwd: projectRoot });
  if (result.exitCode !== 0) {
    return {
      schema_version: 1,
      status: "unknown",
      error: result.stderr || result.stdout || "git diff failed",
    };
  }
  return {
    schema_version: 1,
    status: "pass",
    summary: parseDiffStat(result.stdout),
  };
}

async function distSyncStatus(projectRoot: string): Promise<Record<string, unknown>> {
  const result = await execCommand("git status --porcelain dist", 30000, { cwd: projectRoot });
  if (result.exitCode !== 0) {
    return {
      schema_version: 1,
      status: "unknown",
      error: result.stderr || result.stdout || "git status failed",
    };
  }
  const summary = parseStatusPorcelain(result.stdout);
  return {
    schema_version: 1,
    status:
      summary.modified.count + summary.staged.count + summary.untracked.count === 0
        ? "pass"
        : "fail",
    summary,
  };
}

async function docsDriftStatus(projectRoot: string): Promise<Record<string, unknown>> {
  const result = await execCommand("npm run docs:check", 120000, { cwd: projectRoot });
  return {
    schema_version: 1,
    status: result.exitCode === 0 ? "pass" : "fail",
    command: "npm run docs:check",
    exit_code: result.exitCode,
    stdout_tail: tail(result.stdout),
    stderr_tail: tail(result.stderr),
  };
}

function jsonToolResult(
  toolName: TypedCapabilityToolName,
  value: unknown,
): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  const validation = validateTypedCapabilityOutput(toolName, value);
  if (!validation.success) {
    return {
      content: [
        {
          type: "text",
          text: `${JSON.stringify(
            {
              schema_version: 1,
              error: "TYPED_CAPABILITY_OUTPUT_SCHEMA_MISMATCH",
              tool: toolName,
              issues: validation.error.issues,
            },
            null,
            2,
          )}\n`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [{ type: "text", text: `${JSON.stringify(validation.data, null, 2)}\n` }],
  };
}

function isEvidenceKind(value: unknown): value is EvidenceArtifactKind {
  return (
    value === "review" ||
    value === "test" ||
    value === "ship_gate" ||
    value === "verify" ||
    value === "mutation" ||
    value === "docs_check" ||
    value === "dist_sync"
  );
}

function tail(text: string, maxLines = 20): string {
  const lines = text.split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}
