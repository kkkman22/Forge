/**
 * SkillManifest type and skill loading/merging utilities.
 *
 * Design reference: community-ecosystem § SKILL Plugin Mechanism
 * **Validates: Requirements R4.1, R4.3**
 */

/** Phase names that a SKILL can participate in. */
export type SkillPhase =
  | "decide"
  | "spec"
  | "plan"
  | "build"
  | "build-light"
  | "review"
  | "test"
  | "ship"
  | "learn"
  | "debug"
  | "fix"
  | "refactor"
  | "loop";

const VALID_PHASES: ReadonlySet<string> = new Set<string>([
  "decide",
  "spec",
  "plan",
  "build",
  "build-light",
  "review",
  "test",
  "ship",
  "learn",
  "debug",
  "fix",
  "refactor",
  "loop",
]);

/** Maximum manifest file size in bytes (64KB). */
const MAX_MANIFEST_SIZE = 65_536;

/** Manifest describing a SKILL plugin. */
export interface SkillManifest {
  /** Unique SKILL name (e.g., "forge-deploy"). */
  name: string;
  /** Semantic version of the SKILL. */
  version: string;
  /** One-line description. */
  description: string;
  /** Author identifier. */
  author: string;
  /** Minimum Forge version required (semver range). */
  forgeVersion: string;
  /** Phases this SKILL participates in. */
  phases: SkillPhase[];
  /** Optional i18n configuration. */
  i18n?: {
    defaultLocale: string;
    supportedLocales: string[];
  };
}

/**
 * Scan directory entries and load manifests from subdirectories
 * containing a `skill.json` file.
 *
 * @param dirEntries - Array of subdirectory names to scan.
 * @param readFile - Function to read file content (injected for testability).
 * @returns Array of parsed SkillManifest objects.
 */
export function loadSkillsFromDir(
  dirEntries: string[],
  readFile: (path: string) => string | undefined,
): SkillManifest[] {
  const manifests: SkillManifest[] = [];
  for (const entry of dirEntries) {
    const jsonPath = `${entry}/skill.json`;
    const content = readFile(jsonPath);
    if (!content) continue;

    if (content.length > MAX_MANIFEST_SIZE) continue;

    try {
      const parsed = JSON.parse(content);
      if (isSkillManifest(parsed)) {
        manifests.push(parsed);
      }
    } catch {
      // Not valid JSON — skip
    }
  }
  return manifests;
}

/**
 * Merge builtin and external SKILL lists, with builtin taking priority
 * on name conflicts.
 *
 * @param builtin - Built-in SKILL manifests (higher priority).
 * @param external - External/plugin SKILL manifests.
 * @returns Merged list with unique names, builtin preferred.
 */
export function mergeSkillLists(
  builtin: SkillManifest[],
  external: SkillManifest[],
): SkillManifest[] {
  const seen = new Set<string>();
  const merged: SkillManifest[] = [];

  for (const item of builtin) {
    if (!seen.has(item.name)) {
      seen.add(item.name);
      merged.push(item);
    }
  }
  for (const item of external) {
    if (!seen.has(item.name)) {
      seen.add(item.name);
      merged.push(item);
    }
  }
  return merged;
}

/** Type guard for SkillManifest with strict phase validation. */
function isSkillManifest(obj: unknown): obj is SkillManifest {
  if (typeof obj !== "object" || obj === null) return false;
  const m = obj as Record<string, unknown>;
  return (
    typeof m.name === "string" &&
    typeof m.version === "string" &&
    typeof m.description === "string" &&
    typeof m.author === "string" &&
    typeof m.forgeVersion === "string" &&
    Array.isArray(m.phases) &&
    m.phases.length > 0 &&
    (m.phases as unknown[]).every((p) => typeof p === "string" && VALID_PHASES.has(p))
  );
}
