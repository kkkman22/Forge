/**
 * Subagent orchestration for review — team building, truncation detection, result merging.
 *
 * @module review/subagent
 */

import {
  assessTruncationSeverity,
  detectTruncation,
  type ReviewLayer,
  type TruncationAssessment,
} from "../truncation-detection.js";
import type { SubagentInvocation, SubagentResult } from "../types.js";
import { applyCrossValidation, deduplicateFindings, filterByConfidence } from "./core.js";
import type { MergedFinding, ReviewFinding } from "./types.js";

/** Context for building review subagent invocations. */
export interface ReviewSubagentContext {
  hasSpec: boolean;
  specPath?: string;
  changedFiles: string[];
  /**
   * Merged context file list (plan frontmatter `context_files` +
   * `.forge/runs/<runId>/context.jsonl`, deduplicated via
   * `mergeContextSources`). When present and non-empty, each diff-context
   * review agent (spec/quality/security) gets a "Relevant artifacts" section
   * listing these paths to Read before judging, rather than blindly scanning
   * the diff. Spec: context-injection-activation.
   */
  contextFiles?: string[];
}

/** Review agent types that have per-agent maxTurns configuration. */
type ReviewAgentType = "spec-check" | "quality-check" | "security-check" | "frontend-check";

const REVIEW_AGENT_MAX_TURNS: Record<ReviewAgentType, number> = {
  "spec-check": 15,
  "quality-check": 12,
  "security-check": 10,
  "frontend-check": 10,
};

export const WORKTREE_EDIT_PREFLIGHT =
  "Before editing files, verify you are operating in the intended worktree. If Forge policy reports shared-checkout edits are blocked, enter or request the assigned worktree before attempting edits.";

const FINAL_REPORT_CONTRACT = `Final-Report Contract (HARD):
Your last assistant message MUST be a Markdown report block with this exact shape:
  1. A heading like "## Layer N — <Title>" matching your role.
  2. At least one Markdown table whose header includes a "Severity" column
     (use "无 issue 发现" inside the table body if everything is clean — keep the header).
  3. End the message with the literal sentinel line: <!-- review-final -->
The orchestrator only treats your run as complete when it sees the sentinel.
A message ending with a preamble like "Now let me check..." or "Let me verify..."
is rejected as incomplete and your run will be retried, even if the SDK reports success.`;

const DIFF_CONTEXT_PREAMBLE = `Diff context: .forge/reviews/.diff-context.md
Turn Budget: Read diff-context first → produce FINDINGS → use remaining turns for deep-dives (max 3-5 reads).
Hard constraint: Your final turn MUST be a text block containing FINDINGS, not a tool_use call.
If turn budget is running low (≤2 remaining), stop reading files and output partial FINDINGS immediately.
Insufficient evidence for a finding → omit it rather than spend turns investigating.

${FINAL_REPORT_CONTRACT}`;

function buildPrompt(task: string, contextFiles?: string[]): string {
  const contextSection =
    contextFiles && contextFiles.length > 0
      ? `\nRelevant artifacts (Read these before judging — they are the spec/research files this task declared):\n${contextFiles.map((f) => `- ${f}`).join("\n")}\n`
      : "";
  return `${DIFF_CONTEXT_PREAMBLE}\n${task}${contextSection}`;
}

export function buildReviewSubagents(context: ReviewSubagentContext): SubagentInvocation[] {
  const invocations: SubagentInvocation[] = [];
  const { contextFiles } = context;

  if (context.hasSpec) {
    invocations.push({
      agentType: "spec-check",
      prompt: buildPrompt(
        `Review spec alignment. Spec path: ${context.specPath ?? "unknown"}.`,
        contextFiles,
      ),
      permissionMode: "default",
      maxTurns: REVIEW_AGENT_MAX_TURNS["spec-check"],
    });
  }

  invocations.push({
    agentType: "quality-check",
    prompt: buildPrompt("Review code quality.", contextFiles),
    permissionMode: "default",
    maxTurns: REVIEW_AGENT_MAX_TURNS["quality-check"],
  });

  invocations.push({
    agentType: "security-check",
    prompt: buildPrompt("Review security and risk.", contextFiles),
    permissionMode: "default",
    maxTurns: REVIEW_AGENT_MAX_TURNS["security-check"],
  });

  const hasVueFiles = context.changedFiles.some((f) => f.endsWith(".vue"));
  if (hasVueFiles) {
    const vueFiles = context.changedFiles.filter((f) => f.endsWith(".vue"));
    invocations.push({
      agentType: "frontend-check",
      prompt: `Review frontend accessibility. Changed Vue files: ${vueFiles.join(", ")}`,
      permissionMode: "default",
      maxTurns: REVIEW_AGENT_MAX_TURNS["frontend-check"],
    });
  }

  return invocations;
}

/** Agent types that map to review layers (excludes frontend-check, unknown). */
type LayerMappingAgent = "spec-check" | "quality-check" | "security-check";

const AGENT_TYPE_TO_LAYER: Record<LayerMappingAgent, ReviewLayer> = {
  "spec-check": "spec",
  "quality-check": "quality",
  "security-check": "security",
};

/**
 * Run truncation detection across review subagent results.
 */
export function processReviewTruncation(
  results: Array<{ agentType: string; result: string }>,
): TruncationAssessment {
  const layerResults = results
    .filter((r) => r.agentType in AGENT_TYPE_TO_LAYER)
    .map((r) => detectTruncation(AGENT_TYPE_TO_LAYER[r.agentType as LayerMappingAgent], r.result));

  return assessTruncationSeverity(layerResults);
}

/** Runtime validation for ReviewFinding objects parsed from Subagent output. */
function isValidReviewFinding(value: unknown): value is ReviewFinding {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.severity === "string" &&
    ["P0", "P1", "P2", "P3"].includes(obj.severity) &&
    typeof obj.confidence === "number" &&
    typeof obj.fixRoute === "string" &&
    typeof obj.filePath === "string" &&
    typeof obj.lineNumber === "number" &&
    typeof obj.description === "string" &&
    typeof obj.suggestion === "string" &&
    typeof obj.reviewer === "string"
  );
}

export function mergeReviewResults(results: SubagentResult[]): MergedFinding[] {
  const allFindings: ReviewFinding[] = [];

  for (const result of results) {
    if (result.status === "success" && result.output) {
      try {
        const parsed = JSON.parse(result.output);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (isValidReviewFinding(item)) {
              allFindings.push(item);
            }
          }
        }
      } catch (_err: unknown) {
        // Output is not JSON — skip this result
      }
    }
  }

  const { included } = filterByConfidence(allFindings);
  const deduped = deduplicateFindings(included);
  return applyCrossValidation(deduped);
}
