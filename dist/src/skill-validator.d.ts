/**
 * SKILL manifest validation and version compatibility checking.
 *
 * Design reference: community-ecosystem § SKILL Plugin Mechanism
 * **Validates: Requirements R4.2**
 */
import type { SkillManifest } from "./skill-loader.js";
/** Result of manifest validation. */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}
/**
 * Validate a SKILL manifest object for structural correctness.
 *
 * @param json - Unknown input to validate.
 * @returns Validation result with errors if invalid.
 */
export declare function validateManifest(json: unknown): ValidationResult;
/**
 * Check if a given Forge version satisfies the manifest's forgeVersion range.
 *
 * @param manifest - SKILL manifest with forgeVersion requirement.
 * @param currentVersion - Current Forge version (exact semver).
 * @returns true if compatible.
 */
export declare function checkVersionCompatibility(manifest: SkillManifest, currentVersion: string): boolean;
