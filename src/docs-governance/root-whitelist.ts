import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { DiagnosticRecord, DocPath } from "./types.js";

const SCRIPT_NAME = "root-whitelist";

/**
 * Check root directory first-level .md files against a whitelist.
 * - Non-recursive: only top-level files are scanned.
 * - Hidden files (starting with ".") are ignored.
 * - Symlinks are not followed.
 * - LICENSE/LICENSE.md mutual exclusion: both present = critical error;
 *   either present counts as a whitelist hit for "LICENSE.md".
 */
export function checkRootWhitelist(
  rootDir: string,
  whitelist: readonly string[],
): DiagnosticRecord[] {
  const diagnostics: DiagnosticRecord[] = [];
  let entries: string[];

  try {
    entries = readdirSync(rootDir);
  } catch (_err: unknown) {
    diagnostics.push({
      script: SCRIPT_NAME,
      severity: "critical",
      file: rootDir as DocPath,
      message: `Cannot read root directory: ${rootDir}`,
      code: "ROOT_DIR_UNREADABLE",
    });
    return diagnostics;
  }

  // Build a set for fast lookup
  const whitelistSet = new Set<string>(whitelist);

  // Collect first-level .md files (no hidden, no symlinks, no directories)
  // Also track non-.md files that are relevant for whitelist checks (e.g. LICENSE).
  const mdFiles: string[] = [];
  const allFirstLevelFiles: string[] = [];
  for (const entry of entries) {
    // Skip hidden files
    if (entry.startsWith(".")) continue;

    const fullPath = join(rootDir, entry);
    // Skip symlinks
    const stat = lstatSync(fullPath);
    if (stat.isSymbolicLink()) continue;
    // Skip directories
    if (stat.isDirectory()) continue;

    allFirstLevelFiles.push(entry);
    if (entry.endsWith(".md")) {
      mdFiles.push(entry);
    }
  }

  // LICENSE/LICENSE.md mutual exclusion check (LICENSE has no .md suffix)
  const hasLicense = allFirstLevelFiles.includes("LICENSE");
  const hasLicenseMd = mdFiles.includes("LICENSE.md");

  if (hasLicense && hasLicenseMd) {
    diagnostics.push({
      script: SCRIPT_NAME,
      severity: "critical",
      file: "LICENSE.md" as DocPath,
      message:
        "Both LICENSE and LICENSE.md exist in root. Only one is allowed — remove one to resolve ambiguity.",
      code: "LICENSE_MUTUAL_EXCLUSION",
    });
    diagnostics.push({
      script: SCRIPT_NAME,
      severity: "critical",
      file: "LICENSE" as DocPath,
      message:
        "Both LICENSE and LICENSE.md exist in root. Only one is allowed — remove one to resolve ambiguity.",
      code: "LICENSE_MUTUAL_EXCLUSION",
    });
  }

  // Build the effective whitelist set considering LICENSE compatibility.
  // If LICENSE exists (without LICENSE.md), it satisfies the "LICENSE.md" whitelist entry.
  const effectiveWhitelist = new Set(whitelistSet);
  if (hasLicense && !hasLicenseMd && whitelistSet.has("LICENSE.md")) {
    effectiveWhitelist.add("LICENSE");
  }

  // Check each .md file against the effective whitelist
  for (const file of mdFiles) {
    if (!effectiveWhitelist.has(file)) {
      diagnostics.push({
        script: SCRIPT_NAME,
        severity: "error",
        file: file as DocPath,
        message: `File "${file}" is not in the root whitelist. Remove it or add it to docs.root_whitelist in .tinkerman/config.md.`,
        code: "ROOT_FILE_NOT_WHITELISTED",
      });
    }
  }

  return diagnostics;
}
