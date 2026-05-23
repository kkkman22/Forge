/**
 * Spec kind detection — determine feature vs bugfix from directory contents.
 *
 * Validates: Requirement 14 (T-22)
 */

import type { SpecKind } from "./spec-bundle.js";

/**
 * Detect spec kind from directory listing.
 * Returns "bugfix" if bugfix.md present or mode is "fix".
 * Returns "feature" otherwise (default).
 */
export function detectSpecKind(files: string[], mode?: "fix"): SpecKind {
  if (mode === "fix") return "bugfix";
  if (files.includes("bugfix.md")) return "bugfix";
  return "feature";
}
