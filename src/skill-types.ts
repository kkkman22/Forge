/**
 * Shared types for the SKILL plugin subsystem.
 *
 * Extracted from `skill-loader.ts` to break the circular dependency between
 * `skill-loader.ts` (loader) and `skill-validator.ts` (validator). Previously
 * the validator imported `SkillManifest` from the loader, while the loader
 * imported `validateManifest` / `checkVersionCompatibility` from the validator
 * — a type/value cycle. Both modules now import these types from this
 * dependency-free leaf module.
 *
 * Repo precedent: `router-types.ts`, `session-types.ts`, `grill/types.ts`.
 */

/** Phase names that a SKILL can participate in. @public */
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

/** Manifest describing a SKILL plugin. @public */
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
}

/** Result of skill installation. */
export interface InstallResult {
  success: boolean;
  skillName?: string;
  message: string;
}
