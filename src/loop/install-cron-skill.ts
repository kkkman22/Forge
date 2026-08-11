/**
 * installCronSkill — unified cron installer for skills (regenerative-checkpoint R5/D7).
 *
 * learn --install and triage --install share this primitive to install/uninstall/status
 * periodic skill triggers via CC's native CronCreate. Pure functions only — they produce
 * the invocation spec that skill instructions relay to the CC runtime (which owns CronCreate).
 *
 * Design ref: .tinkerman/specs/regenerative-checkpoint/design.md §D7
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** @public */
export interface CronConfigBlock {
  enabled?: boolean;
  cron?: string;
  interval_days?: number;
}

/** @public */
export interface CronConfigDefaults {
  enabled: boolean;
  cron: string;
  intervalDays: number;
}

/** @public */
export interface ResolvedCronConfig {
  enabled: boolean;
  cron: string;
  intervalDays: number;
}

/** @public */
export type CronAction = "install" | "uninstall" | "status";

/**
 * Minimum gap (ms) between two cron-triggered skill spawns, to debounce rapid
 * re-triggers. Aligned with MiMo-Code auto-dream.ts MIN_SPAWN_GAP (10s).
 * Checked by shouldDebounceSpawn against a last-trigger timestamp.
 */
export const MIN_SPAWN_GAP_MS = 10_000;

/** @public */
export interface CronInstallSpec {
  tool: "CronCreate";
  action: CronAction;
  label: string;
  cron: string;
  prompt: string;
}

// ---------------------------------------------------------------------------
// Cron validation
// ---------------------------------------------------------------------------

const CRON_FIELD_RANGES: ReadonlyArray<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7], // day of week (0 and 7 both = Sunday; 0-6 is the canonical range, 7 is the Sunday alias)
];

/**
 * Validate a 5-field cron expression.
 * Supports: numbers, ranges (1-5), lists (1,3,5), step values (star/15, 1-10/2), and star.
 */
export function validateCronExpression(expr: string): boolean {
  if (!expr || typeof expr !== "string") return false;
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  for (let i = 0; i < 5; i++) {
    if (!isValidField(fields[i], CRON_FIELD_RANGES[i][0], CRON_FIELD_RANGES[i][1])) {
      return false;
    }
  }
  return true;
}

function isValidField(field: string, min: number, max: number): boolean {
  // Handle step values: */N or range/N
  const stepMatch = field.match(/^(.+)\/(\d+)$/);
  if (stepMatch) {
    return isValidField(stepMatch[1], min, max) && Number.parseInt(stepMatch[2], 10) > 0;
  }
  // Wildcard
  if (field === "*") return true;
  // List: comma-separated values/ranges
  if (field.includes(",")) {
    return field.split(",").every((part) => isValidField(part, min, max));
  }
  // Range: N-M
  const rangeMatch = field.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const lo = Number.parseInt(rangeMatch[1], 10);
    const hi = Number.parseInt(rangeMatch[2], 10);
    return lo >= min && lo <= max && hi >= min && hi <= max && lo <= hi;
  }
  // Single number
  if (/^\d+$/.test(field)) {
    const val = Number.parseInt(field, 10);
    return val >= min && val <= max;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

/**
 * Resolve cron config from a config block (parsed from .tinkerman/config.md) with defaults.
 * The `enabled` flag only gates --install; manual skill invocation is never blocked.
 */
export function resolveCronConfig(input: {
  configBlock: CronConfigBlock | undefined;
  defaults: CronConfigDefaults;
}): ResolvedCronConfig {
  const block = input.configBlock ?? {};
  return {
    enabled: block.enabled ?? input.defaults.enabled,
    cron: block.cron ?? input.defaults.cron,
    intervalDays: block.interval_days ?? input.defaults.intervalDays,
  };
}

// ---------------------------------------------------------------------------
// Install spec builder
// ---------------------------------------------------------------------------

/**
 * Build the CronCreate invocation spec for a skill's --install/--uninstall/--status.
 * The skill instructions use this spec to instruct the main agent to call CronCreate.
 */
export function buildCronInstallSpec(input: {
  skillName: string;
  cron: string;
  prompt: string;
  action?: CronAction;
}): CronInstallSpec {
  const action = input.action ?? "install";
  return {
    tool: "CronCreate",
    action,
    label: `forge-${input.skillName}`,
    cron: input.cron,
    prompt: input.prompt,
  };
}

/**
 * Debounce check: returns true if a cron-triggered spawn should be skipped
 * because the last trigger was within MIN_SPAWN_GAP_MS. Prevents rapid
 * re-triggers (e.g. cron firing twice, or manual + cron collision).
 *
 * @param lastTriggerMs - timestamp (ms) of last spawn, or undefined if never.
 * @param nowMs - current timestamp (ms), defaults to Date.now().
 */
export function shouldDebounceSpawn(
  lastTriggerMs: number | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (lastTriggerMs === undefined) return false;
  return nowMs - lastTriggerMs < MIN_SPAWN_GAP_MS;
}
