/**
 * SkillManifest type and skill loading/merging utilities.
 *
 * Design reference: community-ecosystem § SKILL Plugin Mechanism
 * **Validates: Requirements R4.1, R4.3**
 */
/** Phase names that a SKILL can participate in. */
export type SkillPhase = "decide" | "spec" | "plan" | "build" | "build-light" | "review" | "test" | "ship" | "learn" | "debug" | "fix" | "refactor" | "loop";
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
export declare function loadSkillsFromDir(dirEntries: string[], readFile: (path: string) => string | undefined): SkillManifest[];
/**
 * Merge builtin and external SKILL lists, with builtin taking priority
 * on name conflicts.
 *
 * @param builtin - Built-in SKILL manifests (higher priority).
 * @param external - External/plugin SKILL manifests.
 * @returns Merged list with unique names, builtin preferred.
 */
export declare function mergeSkillLists(builtin: SkillManifest[], external: SkillManifest[]): SkillManifest[];
