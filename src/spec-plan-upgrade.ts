/**
 * Plan stage — tasks.md single source upgrade.
 *
 * Upgrades a draft TasksSeedDocument to locked status with wave blocks.
 * Provides legacy plan fallback detection.
 *
 * Validates: Requirement 4, 7
 */

import type { SpecFileFrontmatter, TaskSeed, TasksSeedDocument, Wave } from "./spec-bundle.js";

/**
 * Upgrade a draft tasks seed to locked with auto-generated wave blocks.
 * Preserves existing waves if present; generates from dependency graph otherwise.
 */
export function upgradeTasksSeed(doc: TasksSeedDocument): TasksSeedDocument {
  const tasks = doc.tasks.map((t) => ({
    ...t,
    category: t.category ?? "implementation",
    verification: t.verification ?? "auto",
    status: t.status ?? "pending",
  }));

  let waves = doc.waves;
  if (!waves || waves.length === 0) {
    waves = generateWaves(tasks);
  }

  return {
    frontmatter: { ...doc.frontmatter, status: "locked" } as SpecFileFrontmatter,
    tasks,
    waves,
  };
}

/**
 * Generate wave blocks from task dependency graph via topological sort.
 */
function generateWaves(tasks: TaskSeed[]): Wave[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const inDegree = new Map<string, number>();
  const deps = new Map<string, string[]>();

  for (const t of tasks) {
    inDegree.set(t.id, 0);
    deps.set(t.id, []);
  }

  for (const t of tasks) {
    for (const dep of t.depends_on ?? []) {
      if (taskMap.has(dep)) {
        deps.get(dep)?.push(t.id);
        inDegree.set(t.id, (inDegree.get(t.id) ?? 0) + 1);
      }
    }
  }

  const waves: Wave[] = [];
  const assigned = new Set<string>();

  while (assigned.size < tasks.length) {
    const waveTasks = tasks
      .filter((t) => !assigned.has(t.id) && (inDegree.get(t.id) ?? 0) === 0)
      .map((t) => t.id);

    if (waveTasks.length === 0) break; // cycle guard

    waves.push({ wave: waves.length + 1, tasks: waveTasks });

    for (const id of waveTasks) {
      assigned.add(id);
      for (const dependent of deps.get(id) ?? []) {
        inDegree.set(dependent, (inDegree.get(dependent) ?? 0) - 1);
      }
    }
  }

  return waves;
}

/**
 * Detect whether plan stage should fall back to legacy plans/ file.
 */
export function detectLegacyPlanFallback(input: {
  hasTasksMd: boolean;
  hasPlansMd: boolean;
  planContent: string;
}): {
  needsFallback: boolean;
  source: "plans" | "tasks" | "none";
  coexistenceWarning: boolean;
} {
  const coexistenceWarning = input.hasTasksMd && input.hasPlansMd;

  if (!input.hasTasksMd && input.hasPlansMd) {
    return { needsFallback: true, source: "plans", coexistenceWarning: false };
  }

  if (input.hasTasksMd) {
    return { needsFallback: false, source: "tasks", coexistenceWarning };
  }

  return { needsFallback: false, source: "none", coexistenceWarning: false };
}
