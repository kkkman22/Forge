/**
 * /goal integration for Forge three-tier routing (R4).
 *
 * /goal has no programmatic API — setGoal/clearGoal output instructions
 * to stdout for the user to copy or act on. buildGoalCondition and
 * shouldClearGoal are pure functions (file-read aside).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Forge routing tiers. */
export type Tier = "light" | "standard" | "full";

/**
 * Build a /goal condition string for the given routing tier.
 * Returns null for light tier (no goal needed).
 */
export function buildGoalCondition(tier: Tier): string | null {
  switch (tier) {
    case "light":
      return null;
    case "standard":
      return "完成 plan→build→review→test→ship 流程，且无 P0/P1 阻断";
    case "full":
      return "完成 decide→spec→plan→build→review→test→ship→learn 流程，且无 P0/P1 阻断";
  }
}

/**
 * Output /goal instruction to stdout for the user to copy.
 * /goal has no programmatic API — this merely echoes the command.
 */
export async function setGoal(condition: string): Promise<void> {
  process.stdout.write(`/goal ${condition}\n`);
}

/**
 * Output instruction to clear /goal.
 * /goal has no programmatic API — this merely echoes guidance.
 */
export async function clearGoal(): Promise<void> {
  process.stdout.write("请使用 /goal 命令清除或重置当前目标\n");
}

/**
 * Check whether the three-strike counter indicates the goal should be cleared.
 * Returns true when the counter file exists and count >= 3.
 *
 * @param stateRoot - Root directory containing `.tinkerman/state/`. Defaults to `process.cwd()`.
 */
export async function shouldClearGoal(stateRoot?: string): Promise<boolean> {
  const base = stateRoot ?? process.cwd();
  const statePath = resolve(base, ".tinkerman/state/three-strike-counter.json");
  if (!existsSync(statePath)) {
    return false;
  }
  try {
    const raw = readFileSync(statePath, "utf-8");
    const data = JSON.parse(raw);
    return typeof data.count === "number" && data.count >= 3;
  } catch (_err: unknown) {
    return false;
  }
}
