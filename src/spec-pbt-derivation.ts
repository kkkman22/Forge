/**
 * Unchanged → PBT derivation — derives regression-test tasks from Unchanged
 * clauses in a bugfix spec.
 * Also: §2.4 three-strike reroute — fail_signature + triggerThreeStrikeReroute.
 *
 * Validates: Requirement 15, Property 11
 */

import { createHash } from "node:crypto";

import { isBugfixBundle } from "./spec-bundle.js";
import type { SpecBundle, TaskSeed } from "./spec-bundle.js";

/**
 * Derive regression-test tasks from the Unchanged Behavior section of a bugfix spec.
 * Each unchanged clause produces exactly one task (Property 11).
 */
export function derivePbtTasksFromUnchanged(bundle: SpecBundle): TaskSeed[] {
  if (!isBugfixBundle(bundle)) return [];

  const doc = bundle.primary;
  const lastFixTask = findLastFixTask(bundle);

  const tasks: TaskSeed[] = [];
  for (let i = 0; i < doc.unchanged.length; i++) {
    const clause = doc.unchanged[i];
    const isManual = clause.raw.endsWith("[manual]");
    const id = `PBT-${String(i + 1).padStart(2, "0")}`;

    tasks.push({
      id,
      title: `Regression: ${clause.when}`,
      goal: `Verify unchanged: 当 ${clause.when} 时 系统应当 ${clause.shall}`,
      related_requirements: [],
      depends_on: lastFixTask ? [lastFixTask] : undefined,
      status: "pending",
      category: "regression-test",
      verification: isManual ? "manual" : "pbt",
      source_clause: clause.raw,
    });
  }

  return tasks;
}

function findLastFixTask(bundle: SpecBundle): string | undefined {
  if (!bundle.tasks) return undefined;
  const implTasks = bundle.tasks.tasks.filter(
    (t) => t.category !== "regression-test" && t.category !== "doc" && t.category !== "config",
  );
  if (implTasks.length === 0) return undefined;
  return implTasks[implTasks.length - 1].id;
}

// ---------------------------------------------------------------------------
// §2.4 Three-strike reroute (Requirement 15)
// ---------------------------------------------------------------------------

export interface FixFailure {
  testName: string;
  firstLine: string;
}

export interface ThreeStrikeResult {
  reroute: boolean;
  failSignature: string;
  failures: FixFailure[];
}

/**
 * Compute a fail_signature from repeated test failures.
 * Signature = SHA1(sorted unique test_name + first_line pairs).
 */
export function computeFailSignature(failures: FixFailure[]): string {
  const entries = failures
    .map((f) => `${f.testName}::${f.firstLine}`)
    .sort()
    .join("|");
  return createHash("sha1").update(entries).digest("hex").slice(0, 12);
}

/**
 * Trigger §2.4 three-strike reroute when same fail_signature appears 3+ times.
 * Returns the reroute decision and accumulated failures.
 */
export function triggerThreeStrikeReroute(
  history: FixFailure[],
  currentFailure: FixFailure,
): ThreeStrikeResult {
  const allFailures = [...history, currentFailure];
  const sig = computeFailSignature(allFailures);

  // Group by fail_signature (using individual signatures for each failure)
  const signatureCounts = new Map<string, number>();
  for (const f of allFailures) {
    const fSig = computeFailSignature([f]);
    signatureCounts.set(fSig, (signatureCounts.get(fSig) ?? 0) + 1);
  }

  const currentSig = computeFailSignature([currentFailure]);
  const count = signatureCounts.get(currentSig) ?? 0;

  return {
    reroute: count >= 3,
    failSignature: sig,
    failures: allFailures,
  };
}
