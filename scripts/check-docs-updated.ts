#!/usr/bin/env node
/**
 * Updated auditor — checks that docs with body changes have bumped the 'updated' frontmatter field.
 * Exit codes: 0 = clean, 1 = violation, 3 = internal error.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { findFrontmatterRange, isFrontmatterOnlyChange, parseDiffHunks } from "../src/docs-governance/updated-auditor.js";
import { computeExitResult } from "../src/docs-governance/cli/_runtime.js";
import { formatDiagnostics, formatNdjson } from "../src/docs-governance/reporter/diagnostic.js";
import { formatHelp } from "../src/docs-governance/cli/_help.js";
import type { DiagnosticRecord, DocPath } from "../src/docs-governance/types.js";

const SCRIPT_NAME = "check-docs-updated";

// ── Main ──

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    formatHelp(SCRIPT_NAME, "Check that docs with body changes have updated frontmatter date.", [
      "--json       Output diagnostics as NDJSON",
      "--fix        Auto-update 'updated' field to UTC today",
      "--help       Show this help message",
    ]),
  );
  process.exit(0);
}

const jsonMode = args.includes("--json");
const fixMode = args.includes("--fix");
const rootDir = resolve(process.cwd());

const result = computeExitResult((): DiagnosticRecord[] => {
  const diags: DiagnosticRecord[] = [];

  // Get list of staged .md files
  let stagedFiles: string;
  try {
    stagedFiles = execSync("git diff --cached --name-only --diff-filter=ACMR -- *.md", {
      cwd: rootDir,
      encoding: "utf-8",
    });
  } catch {
    // Not in a git repo or no staged files — clean
    return diags;
  }

  const files = stagedFiles.trim().split("\n").filter(Boolean);
  if (files.length === 0) return diags;

  const today = new Date().toISOString().slice(0, 10);

  for (const file of files) {
    const filePath = resolve(rootDir, file);

    // Read the staged (new) version of the file
    let fileContent: string;
    try {
      fileContent = readFileSync(filePath, "utf-8");
    } catch {
      continue; // File might have been deleted
    }

    // Get the diff for this file
    let diff: string;
    try {
      diff = execSync(`git diff --cached -- ${file}`, {
        cwd: rootDir,
        encoding: "utf-8",
      });
    } catch {
      continue;
    }

    // If frontmatter-only change, no need to bump updated
    if (isFrontmatterOnlyChange(fileContent, diff)) continue;

    // Body was changed — check if 'updated' field was bumped
    const lines = fileContent.split("\n");
    const fmRange = findFrontmatterRange(lines);
    if (!fmRange) {
      // No frontmatter at all — skip (not a governed doc)
      continue;
    }

    // Find the 'updated' line in frontmatter
    let updatedLine = -1;
    let updatedValue = "";
    for (let i = fmRange.start + 1; i < fmRange.end; i++) {
      const line = lines[i];
      if (line.trimStart().startsWith("updated:")) {
        updatedLine = i;
        updatedValue = line.split(":").slice(1).join(":").trim();
        break;
      }
    }

    if (updatedLine === -1) {
      diags.push({
        script: SCRIPT_NAME,
        severity: "error",
        file: file as DocPath,
        message: `Body changed but no 'updated' field found in frontmatter`,
        code: "UPDATED_MISSING",
      });
      continue;
    }

    // Check if the updated value matches today (or was changed in this diff)
    if (updatedValue !== today) {
      if (fixMode) {
        // Auto-fix: set updated to today
        lines[updatedLine] = `updated: ${today}`;
        writeFileSync(filePath, lines.join("\n"), "utf-8");
        // Re-stage the file
        try {
          execSync(`git add -- ${file}`, { cwd: rootDir });
        } catch {
          // Best effort
        }
        diags.push({
          script: SCRIPT_NAME,
          severity: "notice",
          file: file as DocPath,
          line: updatedLine + 1,
          message: `Auto-fixed 'updated' to ${today}`,
          code: "UPDATED_AUTO_FIXED",
        });
      } else {
        diags.push({
          script: SCRIPT_NAME,
          severity: "error",
          file: file as DocPath,
          line: updatedLine + 1,
          message: `Body changed but 'updated' is ${updatedValue}, expected ${today}`,
          code: "UPDATED_NOT_BUMPED",
        });
      }
    }
  }

  return diags;
});

if (jsonMode) {
  process.stdout.write(`${formatNdjson(result.diagnostics)}\n`);
} else {
  const output = formatDiagnostics(result.diagnostics);
  process.stdout.write(`${output}\n`);
}

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
}

process.exit(result.exitCode);
