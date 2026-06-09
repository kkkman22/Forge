import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SubagentInvocation, SubagentResult } from "./types.js";

export type ForgePhase =
  | "decide"
  | "spec"
  | "plan"
  | "build"
  | "review"
  | "test"
  | "ship"
  | "learn";

export type WorkerKind = "subagent" | "cli-sdk";
export type WorkerStatus = "success" | "failed" | "blocked";

export interface WorkerCommandSummary {
  cmd: string;
  result: "pass" | "fail" | "skipped";
  evidence_path: string;
}

export interface WorkerFindingSummary {
  severity: "P0" | "P1" | "P2" | "P3";
  summary: string;
  evidence_path: string;
}

export interface PhaseWorkerSummary {
  phase: ForgePhase;
  worker_kind: WorkerKind;
  status: WorkerStatus;
  summary: string;
  artifact_path: string;
  commands: WorkerCommandSummary[];
  findings: {
    p0: number;
    p1: number;
    items: WorkerFindingSummary[];
  };
  next_action: string;
}

export interface PhaseWorkerRequest {
  phase: ForgePhase;
  runId: string;
  projectRoot: string;
  prompt: string;
  artifactPath: string;
  summaryPath: string;
  nextAction: string;
}

export interface CliSdkWorkerExecResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

export type SubagentWorkerExecutor = (invocation: SubagentInvocation) => Promise<SubagentResult>;

export type CliSdkWorkerExecutor = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<CliSdkWorkerExecResult>;

const MAX_SUMMARY_CHARS = 600;
const MAX_COMMANDS = 3;
const MAX_FINDINGS = 3;

function truncate(value: unknown, max: number): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text.length > max ? text.slice(0, max) : text;
}

function asWorkerStatus(value: unknown): WorkerStatus {
  return value === "success" || value === "blocked" || value === "failed" ? value : "failed";
}

function asWorkerKind(value: unknown): WorkerKind {
  return value === "subagent" || value === "cli-sdk" ? value : "cli-sdk";
}

function asPhase(value: unknown): ForgePhase {
  const phase = String(value ?? "");
  if (["decide", "spec", "plan", "build", "review", "test", "ship", "learn"].includes(phase)) {
    return phase as ForgePhase;
  }
  return "build";
}

function normalizeCommand(value: unknown): WorkerCommandSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  const result =
    obj.result === "pass" || obj.result === "fail" || obj.result === "skipped"
      ? obj.result
      : "skipped";
  return {
    cmd: truncate(obj.cmd, 160),
    result,
    evidence_path: truncate(obj.evidence_path, 240),
  };
}

function normalizeFinding(value: unknown): WorkerFindingSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  const severity =
    obj.severity === "P0" || obj.severity === "P1" || obj.severity === "P2" || obj.severity === "P3"
      ? obj.severity
      : "P3";
  return {
    severity,
    summary: truncate(obj.summary, 240),
    evidence_path: truncate(obj.evidence_path, 240),
  };
}

/** Normalize arbitrary worker output into Forge's bounded worker summary. @public */
export function normalizeWorkerSummary(input: unknown): PhaseWorkerSummary {
  const obj = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const findings =
    typeof obj.findings === "object" && obj.findings !== null
      ? (obj.findings as Record<string, unknown>)
      : {};
  const commands = Array.isArray(obj.commands)
    ? obj.commands.map(normalizeCommand).filter((v): v is WorkerCommandSummary => v !== null)
    : [];
  const items = Array.isArray(findings.items)
    ? findings.items.map(normalizeFinding).filter((v): v is WorkerFindingSummary => v !== null)
    : [];

  return {
    phase: asPhase(obj.phase),
    worker_kind: asWorkerKind(obj.worker_kind),
    status: asWorkerStatus(obj.status),
    summary: truncate(obj.summary, MAX_SUMMARY_CHARS),
    artifact_path: truncate(obj.artifact_path, 300),
    commands: commands.slice(0, MAX_COMMANDS),
    findings: {
      p0: Math.max(0, Number.isInteger(findings.p0) ? (findings.p0 as number) : 0),
      p1: Math.max(0, Number.isInteger(findings.p1) ? (findings.p1 as number) : 0),
      items: items.slice(0, MAX_FINDINGS),
    },
    next_action: truncate(obj.next_action, 120),
  };
}

/** Build a bounded failure summary for a worker that did not complete. @public */
export function buildFailureWorkerSummary(
  request: PhaseWorkerRequest,
  workerKind: WorkerKind,
  reason: string,
): PhaseWorkerSummary {
  return normalizeWorkerSummary({
    phase: request.phase,
    worker_kind: workerKind,
    status: "failed",
    summary: reason,
    artifact_path: request.artifactPath,
    commands: [],
    findings: { p0: 0, p1: 0, items: [] },
    next_action: request.nextAction,
  });
}

/** Build a subagent invocation that enforces the artifact-first worker contract. @public */
export function buildSubagentWorkerInvocation(
  request: PhaseWorkerRequest,
  agentType: string,
): SubagentInvocation {
  return {
    agentType,
    permissionMode: "default",
    maxTurns: 12,
    prompt: [
      request.prompt,
      "",
      "Forge phase worker contract:",
      `- Write the full report, logs, and detailed findings to: ${request.artifactPath}`,
      "- Return only a bounded JSON summary as your final response.",
      "- The final response MUST be a bounded JSON summary with phase, worker_kind, status, summary, artifact_path, commands, findings, and next_action.",
      "- Do not paste raw command output into the final response; reference evidence paths instead.",
    ].join("\n"),
  };
}

/** Run a phase worker through a supplied subagent executor. @public */
export async function runSubagentWorker(
  request: PhaseWorkerRequest,
  options: { agentType: string; executor: SubagentWorkerExecutor },
): Promise<PhaseWorkerSummary> {
  const invocation = buildSubagentWorkerInvocation(request, options.agentType);
  const result = await options.executor(invocation);

  if (result.status !== "success" || !result.output) {
    return buildFailureWorkerSummary(
      request,
      "subagent",
      result.error ?? "subagent worker failed without a bounded summary",
    );
  }

  try {
    return normalizeWorkerSummary(JSON.parse(result.output));
  } catch {
    return buildFailureWorkerSummary(
      request,
      "subagent",
      "subagent worker returned malformed JSON",
    );
  }
}

/** Build deterministic CLI/SDK worker arguments. @public */
export function buildCliSdkWorkerArgs(request: PhaseWorkerRequest, script: string): string[] {
  return [
    script,
    "--phase",
    request.phase,
    "--run-id",
    request.runId,
    "--project-root",
    request.projectRoot,
    "--artifact",
    request.artifactPath,
    "--summary",
    request.summaryPath,
  ];
}

async function defaultCliExecutor(
  command: string,
  args: string[],
  options: { cwd: string },
): Promise<CliSdkWorkerExecResult> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd: options.cwd }, (err, stdout, stderr) => {
      resolve({
        exitCode: err ? 1 : 0,
        stdout,
        stderr,
      });
    });
  });
}

/** Run a phase worker through a CLI/SDK command and read its summary artifact. @public */
export async function runCliSdkWorker(
  request: PhaseWorkerRequest,
  options: {
    command: string;
    script: string;
    executor?: CliSdkWorkerExecutor;
  },
): Promise<PhaseWorkerSummary> {
  mkdirSync(dirname(request.artifactPath), { recursive: true });
  const args = buildCliSdkWorkerArgs(request, options.script);
  const executor = options.executor ?? defaultCliExecutor;
  const result = await executor(options.command, args, { cwd: request.projectRoot });

  if (result.exitCode !== 0) {
    return buildFailureWorkerSummary(
      request,
      "cli-sdk",
      result.stderr || result.stdout || `cli-sdk worker exited with code ${result.exitCode}`,
    );
  }

  if (!existsSync(request.summaryPath)) {
    return buildFailureWorkerSummary(
      request,
      "cli-sdk",
      "cli-sdk worker summary file was not produced",
    );
  }

  try {
    return normalizeWorkerSummary(JSON.parse(readFileSync(request.summaryPath, "utf-8")));
  } catch {
    return buildFailureWorkerSummary(request, "cli-sdk", "cli-sdk worker summary file is invalid");
  }
}
