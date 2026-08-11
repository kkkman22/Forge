/**
 * Zone_Registry — runtime-loadable frozen-zone rule source (frozen-zone-
 * structured-feedback R4).
 *
 * R4 requires the frozen-zone hook to read its rules from `.tinkerman/config.md`
 * at each invocation so rule changes take effect without redeploying hook
 * scripts. This module parses the `frozen_zone` frontmatter field (a list of
 * glob patterns) from `.tinkerman/config.md` and falls back to the hard-coded
 * defaults (the FROZEN_PATTERNS in state.ts) when the config is missing,
 * unparseable, or omits the field.
 *
 * Design:
 *   - Pure function `loadZoneRegistry(forgeRoot)` → ZoneRule[].
 *   - R4.2: missing/unparseable config → default rules + stderr warning.
 *   - R4.3: glob patterns supported; status qualifier is handled by the hook
 *     reading the target file's frontmatter (capped at 100ms by the caller).
 *   - R4.4: a flat `<path-glob> <category> <reason_code>` listing is produced
 *     by `formatZoneRegistry` for the print-zone-registry.sh CLI.
 *   - R4.5: in-process caching — `loadZoneRegistryCached` parses once per
 *     process; parallel Write calls within one turn reuse the parse.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractListField, parseFrontmatter } from "./frontmatter.js";

/** A single frozen-zone rule. */
export interface ZoneRule {
  /** Glob/path pattern relative to .tinkerman/ (e.g. "specs/", "plans/", "config.md"). */
  pattern: string;
  /** Frozen-zone category (mirrors FrozenDiagnostic.category). */
  category: "frozen-spec" | "frozen-plan" | "frozen-config";
  /** Reason code (mirrors FrozenDiagnostic.reason_code). */
  reason_code: string;
}

/**
 * Hard-coded default rules (R4.2 fallback). Mirror state.ts FROZEN_PATTERNS +
 * the frozen-zone-hook.ts classifyFrozenPath categories.
 */
export const DEFAULT_ZONE_RULES: ReadonlyArray<ZoneRule> = [
  { pattern: "specs/", category: "frozen-spec", reason_code: "SPEC_LOCKED" },
  { pattern: "plans/", category: "frozen-plan", reason_code: "PLAN_APPROVED" },
  { pattern: "config.md", category: "frozen-config", reason_code: "CONFIG_ROOT" },
] as const;

/** Infer the category + reason_code from a pattern (R4.3 glob → category). */
function classifyPattern(pattern: string): Pick<ZoneRule, "category" | "reason_code"> {
  if (pattern.startsWith("specs/") || pattern.includes("spec")) {
    return { category: "frozen-spec", reason_code: "SPEC_LOCKED" };
  }
  if (pattern.startsWith("plans/") || pattern.includes("plan")) {
    return { category: "frozen-plan", reason_code: "PLAN_APPROVED" };
  }
  if (pattern.includes("config")) {
    return { category: "frozen-config", reason_code: "CONFIG_ROOT" };
  }
  return { category: "frozen-spec", reason_code: "ZONE_OVERRIDE_MISSING" };
}

/**
 * Load the Zone_Registry from `.tinkerman/config.md` (R4.1).
 *
 * Reads the `frozen_zone` frontmatter field (a YAML list of glob patterns).
 * If the file is missing, unparseable, or omits the field, falls back to
 * DEFAULT_ZONE_RULES and emits a warning to stderr (R4.2).
 *
 * @param forgeRoot absolute path to the project root (parent of .tinkerman/)
 * @returns the active zone rules
 */
export function loadZoneRegistry(forgeRoot: string): ZoneRule[] {
  const configPath = join(forgeRoot, ".tinkerman", "config.md");
  if (!existsSync(configPath)) {
    process.stderr.write(
      "[zone-registry] .tinkerman/config.md missing — falling back to default frozen-zone rules. Run /tinkerman init.\n",
    );
    return [...DEFAULT_ZONE_RULES];
  }

  let content: string;
  try {
    content = readFileSync(configPath, "utf-8");
  } catch {
    process.stderr.write(
      "[zone-registry] .tinkerman/config.md unreadable — falling back to default frozen-zone rules.\n",
    );
    return [...DEFAULT_ZONE_RULES];
  }

  const parsed = parseFrontmatter(content);
  if (!parsed) {
    // R4.2: unparseable → default + warning.
    process.stderr.write(
      "[zone-registry] .tinkerman/config.md frontmatter unparseable — falling back to default frozen-zone rules.\n",
    );
    return [...DEFAULT_ZONE_RULES];
  }

  const frozenZone = extractListField(parsed.raw, "frozen_zone");
  if (!frozenZone || frozenZone.length === 0) {
    // Field absent → default (no warning; field is optional).
    return [...DEFAULT_ZONE_RULES];
  }

  // Build rules from the configured patterns (R4.3 glob support).
  return frozenZone.map((pattern) => ({
    pattern,
    ...classifyPattern(pattern),
  }));
}

// R4.5: in-process cache so parallel Write calls in one turn parse once.
let cachedRegistry: ZoneRule[] | null = null;
let cachedForgeRoot: string | null = null;

/**
 * Cached variant of loadZoneRegistry (R4.5). Parses `.tinkerman/config.md` once
 * per process; subsequent calls with the same forgeRoot reuse the parse.
 * A different forgeRoot invalidates the cache.
 */
export function loadZoneRegistryCached(forgeRoot: string): ZoneRule[] {
  if (cachedRegistry !== null && cachedForgeRoot === forgeRoot) {
    return cachedRegistry;
  }
  cachedRegistry = loadZoneRegistry(forgeRoot);
  cachedForgeRoot = forgeRoot;
  return cachedRegistry;
}

/** Reset the in-process cache (for tests). */
export function resetZoneRegistryCache(): void {
  cachedRegistry = null;
  cachedForgeRoot = null;
}

/**
 * Format the registry as a flat `<pattern> <category> <reason_code>` listing
 * (R4.4). Used by scripts/print-zone-registry.sh for debugging.
 */
export function formatZoneRegistry(rules: ZoneRule[]): string {
  return rules.map((r) => `${r.pattern} ${r.category} ${r.reason_code}`).join("\n");
}
