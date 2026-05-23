/**
 * Unchanged → PBT derivation — derives regression-test tasks from Unchanged
 * clauses in a bugfix spec.
 *
 * Validates: Requirement 15, Property 11
 */

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
