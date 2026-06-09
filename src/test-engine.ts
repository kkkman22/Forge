/**
 * Test engine — core logic extracted from forge-test/SKILL.md.
 *
 * Implements:
 *   - validatePreCompletionChecklist: Verifies all 7 checklist items pass
 *   - ChecklistItem enum and ChecklistState type for structured checklist handling
 *
 * Pre-completion checklist (Property 12):
 *   Verification passes ONLY when ALL 7 items are true.
 *   ANY item being false → verification fails.
 *
 * The 7 checklist items:
 *   1. testsJustRan       — Tests were run in the current session
 *   2. allTestsPass       — All tests passed (zero failures)
 *   3. typeCheckPass       — Type check passed (zero errors)
 *   4. lintPass            — Lint passed (zero errors)
 *   5. acceptanceCriteria  — Acceptance criteria confirmed against Spec
 *   6. noTodoFixme         — No leftover TODO/FIXME in changed files
 *   7. progressUpdated     — .forge/progress/ updated with all tasks complete
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The 7 pre-completion checklist items from forge-test/SKILL.md §2 Layer 3.
 */
export interface ChecklistState {
  testsJustRan: boolean;
  allTestsPass: boolean;
  typeCheckPass: boolean;
  lintPass: boolean;
  acceptanceCriteria: boolean;
  noTodoFixme: boolean;
  progressUpdated: boolean;
}

/** All 7 checklist item keys, in order. */
export const CHECKLIST_KEYS: (keyof ChecklistState)[] = [
  "testsJustRan",
  "allTestsPass",
  "typeCheckPass",
  "lintPass",
  "acceptanceCriteria",
  "noTodoFixme",
  "progressUpdated",
];

/** Human-readable labels for each checklist item. */
export const CHECKLIST_LABELS: Record<keyof ChecklistState, string> = {
  testsJustRan: "测试刚运行过",
  allTestsPass: "所有测试通过",
  typeCheckPass: "类型检查通过",
  lintPass: "Lint 通过",
  acceptanceCriteria: "验收标准逐条确认",
  noTodoFixme: "无遗留 TODO/FIXME",
  progressUpdated: "Progress 已更新",
};

export interface ChecklistResult {
  passed: boolean;
  failedItems: string[];
}

// ---------------------------------------------------------------------------
// Pre-completion checklist validation (Property 12)
// ---------------------------------------------------------------------------

/**
 * Validate the pre-completion checklist.
 *
 * Per SKILL.md §2 Layer 3 and design Property 12:
 *   - ALL 7 items must be true for verification to pass
 *   - ANY item being false → verification fails
 *   - Failed items are listed with human-readable labels
 *
 * Returns { passed, failedItems } where failedItems lists all items that are false.
 */
export function validatePreCompletionChecklist(state: ChecklistState): ChecklistResult {
  const failedItems: string[] = [];

  for (const key of CHECKLIST_KEYS) {
    if (!state[key]) {
      failedItems.push(CHECKLIST_LABELS[key]);
    }
  }

  return {
    passed: failedItems.length === 0,
    failedItems,
  };
}

// ---------------------------------------------------------------------------
// Failure-sink driver helper
// ---------------------------------------------------------------------------

import { type EvidenceWriteResult, writeEvidenceArtifact } from "./evidence-artifact.js";
import type { FailureContext } from "./failure-sink.js";

type EvidenceWriteFailure = Extract<EvidenceWriteResult, { ok: false }>;

export interface TestLayerFailedInput {
  topic: string;
  tier: "light" | "standard" | "full";
  failedLayer: string;
  failedCases?: string[];
}

export function buildTestLayerFailedContext(input: TestLayerFailedInput): FailureContext {
  const cases = input.failedCases?.length ? `，失败用例：${input.failedCases.join("、")}` : "";
  return {
    skill: "forge-test",
    topic: input.topic,
    tier: input.tier,
    trigger: "test_layer_failed",
    situation: `${input.failedLayer} 验证失败${cases}`,
    rootCause: `${input.failedLayer} 失败${cases}`,
  };
}

export type TestEvidenceWriteResult =
  | { ok: true; artifactId: string; path: string; indexPath: string }
  | EvidenceWriteFailure;

export interface PersistTestEvidenceArtifactInput {
  topic: string;
  commit: string;
  command: string;
  exitCode: number;
  stdoutTail?: string;
  stderrTail?: string;
  inputHash?: string;
  artifactId?: string;
  runId?: string;
  createdAt?: string;
  producer?: string;
}

export function persistTestEvidenceArtifact(
  projectRoot: string,
  input: PersistTestEvidenceArtifactInput,
): TestEvidenceWriteResult {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const artifactId =
    input.artifactId ?? `test-${safeSegment(input.topic)}-${safeSegment(createdAt)}`;
  const result = writeEvidenceArtifact(projectRoot, {
    schema_version: 1,
    artifact_id: artifactId,
    kind: "test",
    topic: input.topic,
    run_id: input.runId ?? artifactId,
    commit: input.commit,
    command: input.command,
    exit_code: input.exitCode,
    stdout_tail: input.stdoutTail,
    stderr_tail: input.stderrTail,
    input_hash: input.inputHash,
    result: input.exitCode === 0 ? "pass" : "fail",
    producer: input.producer ?? "forge-test",
    created_at: createdAt,
  });

  return result.ok ? { ...result, artifactId } : result;
}

function safeSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "artifact";
}
