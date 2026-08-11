import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { parseReviewFrontmatter, isReviewComplete } from "./reviews.mjs";

/**
 * Read .tinkerman/ state and compose CanonicalSidebarPayload.
 * Pure function: same dir content → same output (R2.1).
 */

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  try {
    return parseYaml(match[1]) ?? {};
  } catch {
    return {};
  }
}

function countProgress(progressDir, taskName) {
  if (!taskName) return { total: 0, done: 0, in_progress: 0, pending: 0 };

  const filePath = join(progressDir, `${taskName}.md`);
  if (!existsSync(filePath)) return { total: 0, done: 0, in_progress: 0, pending: 0 };

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const total = { total: 0, done: 0, in_progress: 0, pending: 0 };

    for (const line of lines) {
      const m = line.match(/^\|\s*(.+?)\s*\|\s*(done|in_progress|pending)\s*\|/);
      if (m) {
        const status = m[2].trim();
        total.total++;
        if (status === "done") total.done++;
        else if (status === "in_progress") total.in_progress++;
        else total.pending++;
      }
    }
    return total;
  } catch {
    return { total: 0, done: 0, in_progress: 0, pending: 0 };
  }
}

function readReviewState(reviewsDir, taskName) {
  if (!taskName) return null;

  const filePath = join(reviewsDir, `${taskName}.md`);
  if (!existsSync(filePath)) return null;

  try {
    const fm = parseReviewFrontmatter(filePath);
    return {
      completed: isReviewComplete(fm),
      layers: fm.layers_status ?? {},
    };
  } catch {
    return null;
  }
}

/**
 * Read Forge state from a .tinkerman/ directory.
 * Returns CanonicalSidebarPayload.
 */
export function readForgeState(forgeDir) {
  const statusPath = join(forgeDir, "status.md");
  const progressDir = join(forgeDir, "progress");
  const reviewsDir = join(forgeDir, "reviews");

  if (!existsSync(statusPath)) {
    return {
      phase: "unknown",
      tier: null,
      task: null,
      progress: { total: 0, done: 0, in_progress: 0, pending: 0 },
      review: null,
    };
  }

  try {
    const content = readFileSync(statusPath, "utf-8");
    const fm = parseFrontmatter(content);

    const phase = fm.project_phase ?? "unknown";
    const tier = fm.tier ?? null;
    const task = fm.current_task ?? null;

    return {
      phase,
      tier,
      task,
      progress: countProgress(progressDir, task),
      review: readReviewState(reviewsDir, task),
    };
  } catch {
    return {
      phase: "unknown",
      tier: null,
      task: null,
      progress: { total: 0, done: 0, in_progress: 0, pending: 0 },
      review: null,
    };
  }
}
