import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

import { checkVersionCompatibility, validateManifest } from "./skill-validator.js";

// Re-export the shared SKILL types so existing `import { SkillManifest } from
// "./skill-loader.js"` callers keep working. Canonical definitions live in
// `skill-types.ts` (dependency-free leaf) to break the skill-loader ↔
// skill-validator cycle.
export type { InstallResult, SkillManifest, SkillPhase } from "./skill-types.js";

import type { InstallResult, SkillManifest } from "./skill-types.js";

/**
 * SkillManifest type and skill loading/merging utilities.
 *
 * Design reference: community-ecosystem § SKILL Plugin Mechanism
 * **Validates: Requirements R4.1, R4.3**
 */

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

/**
 * Scan directory entries and load manifests from subdirectories
 * containing a `skill.json` file.
 *
 * @param dirEntries - Array of subdirectory names to scan.
 * @param readFile - Function to read file content (injected for testability).
 * @returns Array of parsed SkillManifest objects.
 * @public
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
    } catch (_err: unknown) {
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
 * @public
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

/**
 * Install a SKILL plugin from a local directory into the project.
 *
 * @param sourcePath - Absolute path to the skill directory containing skill.json and SKILL.md.
 * @param targetRoot - Absolute path to the project's skills root directory.
 * @param currentVersion - Current Forge version for compatibility checking.
 * @returns InstallResult indicating success or failure with details.
 * @public
 */
export function installSkill(
  sourcePath: string,
  targetRoot: string,
  currentVersion: string,
): InstallResult {
  const manifestPath = path.join(sourcePath, "skill.json");
  const skillMdPath = path.join(sourcePath, "SKILL.md");

  if (!existsSync(manifestPath)) {
    return { success: false, message: `Missing skill.json in ${sourcePath}` };
  }
  if (!existsSync(skillMdPath)) {
    return { success: false, message: `Missing SKILL.md in ${sourcePath}` };
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch (_err: unknown) {
    return { success: false, message: `Invalid JSON in skill.json` };
  }

  const validation = validateManifest(manifest);
  if (!validation.valid) {
    return { success: false, message: `Invalid manifest: ${validation.errors.join(", ")}` };
  }

  const skillManifest = manifest as SkillManifest;

  if (!checkVersionCompatibility(skillManifest, currentVersion)) {
    return {
      success: false,
      message: `Incompatible forgeVersion: ${skillManifest.forgeVersion} (current: ${currentVersion})`,
    };
  }

  const targetDir = path.join(targetRoot, skillManifest.name);
  if (existsSync(targetDir)) {
    return { success: false, message: `Skill ${skillManifest.name} already installed` };
  }

  mkdirSync(targetDir, { recursive: true });

  // Copy skill.json and SKILL.md
  copyFileSync(manifestPath, path.join(targetDir, "skill.json"));
  copyFileSync(skillMdPath, path.join(targetDir, "SKILL.md"));

  // Copy locale variants if present
  for (const file of readdirSync(sourcePath)) {
    if (file.startsWith("SKILL.") && file.endsWith(".md")) {
      copyFileSync(path.join(sourcePath, file), path.join(targetDir, file));
    }
  }

  return {
    success: true,
    skillName: skillManifest.name,
    message: `Installed ${skillManifest.name} v${skillManifest.version}`,
  };
}

// readFileSync is imported via node:fs above
import { readFileSync } from "node:fs";

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
