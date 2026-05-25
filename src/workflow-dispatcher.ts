import { execSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Subcommand = "review" | "decide" | "learn";
export type DispatchMode = "interactive" | "loop";
export type ChosenLevel = "L0" | "L1" | "L2" | "L3";

export type L1TriggerReason =
  | "gate_disabled"
  | "env_unset"
  | "non_interactive"
  | "workflow_missing"
  | "workflow_syntax_error"
  | "concurrency_uncontrolled"
  | "unmatched_state";

export type L0FailureSignature =
  | "bp_exception"
  | "schema_validation_failed"
  | "subprocess_crash"
  | "stuck_timeout"
  | "frozen_zone_blocked";

export interface DispatchContext {
  subcommand: Subcommand;
  runId: string;
  sessionId: string;
  mode: DispatchMode;
  forgeRoot: string;
  pluginRoot: string;
}

export interface DispatchRecord {
  subcommand: string;
  mode: DispatchMode;
  run_id: string;
  session_id: string;
  workflow_state_id: string;
  workflow_version: string;
  gate_enabled: boolean;
  workflow_available: boolean;
  chosen_level: ChosenLevel;
  l1_trigger_reason?: string;
  l0_failure_signature?: string;
  exit_code: number;
  duration_ms: number;
  timestamp: string;
  frozen_zone_blocked: boolean;
}

export interface DispatchResult {
  chosenLevel: ChosenLevel;
  l1TriggerReason?: L1TriggerReason;
  l0FailureSignature?: L0FailureSignature;
  methodology?: string;
  result?: string;
  payload?: unknown;
}

export interface DispatchDeps {
  tryL0?: (ctx: DispatchContext) => Promise<unknown>;
  runFallback?: (ctx: DispatchContext) => Promise<unknown>;
  allFallbacksFailed?: boolean;
}

export interface ProbeResult {
  eligible: boolean;
  reason?: L1TriggerReason;
}

// ---------------------------------------------------------------------------
// probeL0Eligibility — 5-step probe
// ---------------------------------------------------------------------------

export function probeL0Eligibility(ctx: DispatchContext): ProbeResult {
  // Step 1: env check
  if (process.env.CLAUDE_CODE_WORKFLOWS !== "1") {
    return { eligible: false, reason: "env_unset" };
  }

  // Step 2: mode check
  if (ctx.mode !== "interactive") {
    return { eligible: false, reason: "non_interactive" };
  }

  // Step 3: workflow file exists + syntax check
  const workflowFile = join(ctx.pluginRoot, "workflows", `${ctx.subcommand}.js`);
  if (!existsSync(workflowFile)) {
    return { eligible: false, reason: "workflow_missing" };
  }
  try {
    execSync(`node --check "${workflowFile}"`, { stdio: "pipe" });
  } catch {
    return { eligible: false, reason: "workflow_syntax_error" };
  }

  // Step 4 & 5: concurrency bridge probe
  const concurrencyFile = join(ctx.pluginRoot, "workflows", "lib", "concurrency.js");
  if (!existsSync(concurrencyFile)) {
    return { eligible: false, reason: "concurrency_uncontrolled" };
  }
  try {
    execSync(`node --check "${concurrencyFile}"`, { stdio: "pipe" });
  } catch {
    return { eligible: false, reason: "concurrency_uncontrolled" };
  }

  const workflowSrc = readFileSync(workflowFile, "utf-8");
  if (
    !workflowSrc.includes("from './lib/concurrency") &&
    !workflowSrc.includes('from "./lib/concurrency')
  ) {
    return { eligible: false, reason: "concurrency_uncontrolled" };
  }

  return { eligible: true };
}

// ---------------------------------------------------------------------------
// classifyL0Failure
// ---------------------------------------------------------------------------

export function classifyL0Failure(err: Error): L0FailureSignature {
  const msg = err.message.toLowerCase();
  if (msg.includes("frozenzone") || msg.includes("frozen_zone")) return "frozen_zone_blocked";
  if (msg.includes("schema validation")) return "schema_validation_failed";
  if (msg.includes("stuck timeout") || msg.includes("stuck_timeout")) return "stuck_timeout";
  if (msg.includes("subprocess") || msg.includes("exit code") || msg.includes("crash"))
    return "subprocess_crash";
  return "bp_exception";
}

// ---------------------------------------------------------------------------
// dispatch — L0 try + L1 fallback
// ---------------------------------------------------------------------------

export async function dispatch(
  ctx: DispatchContext,
  deps: DispatchDeps = {},
): Promise<DispatchResult> {
  const probe = probeL0Eligibility(ctx);

  if (!probe.eligible) {
    // L1 path
    if (deps.allFallbacksFailed) {
      return { chosenLevel: "L3", result: "blocked" };
    }

    const fallbackResult = deps.runFallback
      ? await deps.runFallback(ctx)
      : { output: "subagent fallback", methodology: "subagent-parallel" };

    return {
      chosenLevel: "L1",
      l1TriggerReason: probe.reason ?? "unmatched_state",
      methodology:
        ((fallbackResult as Record<string, unknown>)?.methodology as string) ?? "subagent-parallel",
      payload: fallbackResult,
    };
  }

  // L0 path — try workflow
  try {
    const result = deps.tryL0 ? await deps.tryL0(ctx) : { output: "workflow result" };
    return {
      chosenLevel: "L0",
      methodology: "workflow",
      payload: result,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const signature = classifyL0Failure(error);

    // Isolate partial findings
    const runDir = join(ctx.forgeRoot, "runs", ctx.runId);
    isolatePartialFindings(runDir, ctx.subcommand, error.message);

    // Fallback to L1
    if (deps.allFallbacksFailed) {
      return { chosenLevel: "L3", result: "blocked" };
    }

    const fallbackResult = deps.runFallback
      ? await deps.runFallback(ctx)
      : { output: "subagent fallback after L0 failure", methodology: "workflow-then-subagent" };

    return {
      chosenLevel: "L1",
      l0FailureSignature: signature,
      methodology: "workflow-then-subagent",
      payload: fallbackResult,
    };
  }
}

// ---------------------------------------------------------------------------
// writeDispatchRecord — 14-field JSONL
// ---------------------------------------------------------------------------

export function writeDispatchRecord(runDir: string, record: DispatchRecord): void {
  mkdirSync(runDir, { recursive: true });
  const line = JSON.stringify(record) + "\n";
  appendFileSync(join(runDir, "dispatch.jsonl"), line, "utf-8");
}

// ---------------------------------------------------------------------------
// updateStatusMd — 3 dispatch fields
// ---------------------------------------------------------------------------

export function updateStatusMd(
  statusPath: string,
  fields: {
    dispatch_chosen_level: string;
    dispatch_subcommand: string;
    dispatch_run_id: string;
  },
): void {
  let content: string;
  try {
    content = readFileSync(statusPath, "utf-8");
  } catch {
    content = "---\n---\n";
  }

  // Inject into frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    let fm = fmMatch[1];
    // Remove existing dispatch fields
    fm = fm.replace(/^dispatch_chosen_level:.*\n?/m, "");
    fm = fm.replace(/^dispatch_subcommand:.*\n?/m, "");
    fm = fm.replace(/^dispatch_run_id:.*\n?/m, "");
    fm += `\ndispatch_chosen_level: ${fields.dispatch_chosen_level}`;
    fm += `\ndispatch_subcommand: ${fields.dispatch_subcommand}`;
    fm += `\ndispatch_run_id: ${fields.dispatch_run_id}`;
    content = content.replace(fmMatch[0], `---\n${fm}\n---`);
  } else {
    content = `---\ndispatch_chosen_level: ${fields.dispatch_chosen_level}\ndispatch_subcommand: ${fields.dispatch_subcommand}\ndispatch_run_id: ${fields.dispatch_run_id}\n---\n${content}`;
  }

  writeFileSync(statusPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// isolatePartialFindings
// ---------------------------------------------------------------------------

export function isolatePartialFindings(runDir: string, subcommand: string, content: string): void {
  const partialDir = join(runDir, "l0-partial");
  mkdirSync(partialDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${subcommand}-${ts}.md`;
  writeFileSync(join(partialDir, filename), content, "utf-8");
}
