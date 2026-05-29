/**
 * /goal integration for Forge three-tier routing (R4).
 *
 * /goal has no programmatic API — setGoal/clearGoal output instructions
 * to stdout for the user to copy or act on. buildGoalCondition and
 * shouldClearGoal are pure functions (file-read aside).
 */
/** Forge routing tiers. */
export type Tier = "light" | "standard" | "full";
/**
 * Build a /goal condition string for the given routing tier.
 * Returns null for light tier (no goal needed).
 */
export declare function buildGoalCondition(tier: Tier): string | null;
/**
 * Output /goal instruction to stdout for the user to copy.
 * /goal has no programmatic API — this merely echoes the command.
 */
export declare function setGoal(condition: string): Promise<void>;
/**
 * Output instruction to clear /goal.
 * /goal has no programmatic API — this merely echoes guidance.
 */
export declare function clearGoal(): Promise<void>;
/**
 * Check whether the three-strike counter indicates the goal should be cleared.
 * Returns true when the counter file exists and count >= 3.
 *
 * @param stateRoot - Root directory containing `.forge/state/`. Defaults to `process.cwd()`.
 */
export declare function shouldClearGoal(stateRoot?: string): Promise<boolean>;
