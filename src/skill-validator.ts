/**
 * SKILL manifest validation and version compatibility checking.
 *
 * Design reference: community-ecosystem § SKILL Plugin Mechanism
 * **Validates: Requirements R4.2**
 */

import type { SkillManifest } from "./skill-types.js";

/** Result of manifest validation. @public */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
const REQUIRED_FIELDS: (keyof SkillManifest)[] = [
  "name",
  "version",
  "description",
  "author",
  "forgeVersion",
  "phases",
];

/**
 * Validate a SKILL manifest object for structural correctness.
 *
 * @param json - Unknown input to validate.
 * @returns Validation result with errors if invalid.
 * @public
 */
export function validateManifest(json: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof json !== "object" || json === null) {
    return { valid: false, errors: ["Input must be a non-null object"] };
  }

  const obj = json as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (obj[field] === undefined || obj[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (typeof obj.name !== "undefined" && typeof obj.name !== "string") {
    errors.push("name must be a string");
  }
  if (typeof obj.version !== "undefined" && !SEMVER_REGEX.test(String(obj.version))) {
    errors.push("version must be a valid semver (e.g., 1.0.0)");
  }
  if (typeof obj.description !== "undefined" && typeof obj.description !== "string") {
    errors.push("description must be a string");
  }
  if (typeof obj.author !== "undefined" && typeof obj.author !== "string") {
    errors.push("author must be a string");
  }
  if (typeof obj.forgeVersion !== "undefined" && !isValidVersionRange(String(obj.forgeVersion))) {
    errors.push("forgeVersion must be a valid semver range (e.g., >=2.0.0, ^2.0.0, ~2.0.0)");
  }
  if (typeof obj.phases !== "undefined") {
    if (!Array.isArray(obj.phases)) {
      errors.push("phases must be an array");
    } else if (obj.phases.length === 0) {
      errors.push("phases must be a non-empty array");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if a given Forge version satisfies the manifest's forgeVersion range.
 *
 * @param manifest - SKILL manifest with forgeVersion requirement.
 * @param currentVersion - Current Forge version (exact semver).
 * @returns true if compatible.
 * @public
 */
export function checkVersionCompatibility(
  manifest: SkillManifest,
  currentVersion: string,
): boolean {
  return satisfiesRange(currentVersion, manifest.forgeVersion);
}

/** Check if a version range string is syntactically valid. */
function isValidVersionRange(range: string): boolean {
  // Accept: >=X.Y.Z, ^X.Y.Z, ~X.Y.Z, X.Y.Z
  return /^(>=|[\^~]?)\d+\.\d+\.\d+$/.test(range);
}

/**
 * Simple semver range satisfier supporting >=, ^, ~, and exact.
 */
function satisfiesRange(version: string, range: string): boolean {
  const v = parseSemver(version);
  if (!v) return false;

  // Strip range prefix
  const exactMatch = range.match(/^\d+\.\d+\.\d+/);
  if (exactMatch) {
    const r = parseSemver(exactMatch[0]);
    return r ? compareSemver(v, r) >= 0 : false;
  }

  if (range.startsWith(">=")) {
    const r = parseSemver(range.slice(2));
    return r ? compareSemver(v, r) >= 0 : false;
  }

  if (range.startsWith("^")) {
    const r = parseSemver(range.slice(1));
    if (!r) return false;
    return v.major === r.major && compareSemver(v, r) >= 0;
  }

  if (range.startsWith("~")) {
    const r = parseSemver(range.slice(1));
    if (!r) return false;
    return v.major === r.major && v.minor === r.minor && compareSemver(v, r) >= 0;
  }

  return false;
}

interface SemverParts {
  major: number;
  minor: number;
  patch: number;
}

function parseSemver(s: string): SemverParts | null {
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function compareSemver(a: SemverParts, b: SemverParts): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}
