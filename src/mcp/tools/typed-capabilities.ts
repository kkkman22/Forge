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
    async ({ profile }) => jsonToolResult(await runCheckProfile(projectRoot, String(profile))),
  );

  registerTool(
    "forge_diff_summary",
    {
      description: "Return a structured git diff summary.",
      inputSchema: {},
    },
    async () => jsonToolResult(await diffSummary(projectRoot)),
  );

  registerTool(
    "forge_dist_sync",
    {
      description: "Return structured dist-sync status without parsing human prose.",
      inputSchema: {},
    },
    async () => jsonToolResult(await distSyncStatus(projectRoot)),
  );

  registerTool(
    "forge_docs_drift",
    {
      description: "Return structured docs drift status.",
      inputSchema: {},
    },
    async () => jsonToolResult(await docsDriftStatus(projectRoot)),
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
      jsonToolResult({
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
      jsonToolResult({
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

function jsonToolResult(value: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    content: [{ type: "text", text: `${JSON.stringify(value, null, 2)}\n` }],
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
