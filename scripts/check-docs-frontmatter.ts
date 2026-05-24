#!/usr/bin/env node
/**
 * Frontmatter checker — validates frontmatter schema for docs/ markdown files.
 * Exit codes: 0 = clean, 1 = error, 2 = critical, 3 = internal error.
 */
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parseFrontmatter } from "../src/docs-governance/frontmatter/parser.js";
import { computeExitResult } from "../src/docs-governance/cli/_runtime.js";
import { formatDiagnostics, formatNdjson } from "../src/docs-governance/reporter/diagnostic.js";
import { formatHelp } from "../src/docs-governance/cli/_help.js";
import { walkMdFiles, shouldExcludeIndex } from "../src/docs-governance/cli/scan-files.js";
import type { DiagnosticRecord, DocPath } from "../src/docs-governance/types.js";

const SCRIPT_NAME = "check-docs-frontmatter";

// ── Args ──

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    formatHelp(SCRIPT_NAME, "Validate frontmatter schema for docs/ markdown files.", [
      "--json     Output diagnostics as NDJSON",
      "--help     Show this help message",
    ]),
  );
  process.exit(0);
}

const jsonMode = args.includes("--json");

// ── Main ──

const rootDir = resolve(process.cwd());
const docsDir = resolve(rootDir, "docs");

const result = computeExitResult(() => {
  const files = walkMdFiles(docsDir, { excludeFn: shouldExcludeIndex });
  const diagnostics: DiagnosticRecord[] = [];

  for (const filePath of files) {
    const relPath = relative(rootDir, filePath) as DocPath;
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      diagnostics.push({
        script: SCRIPT_NAME,
        severity: "error",
        file: relPath,
        message: `Cannot read file: ${relPath}`,
      });
      continue;
    }

    const parsed = parseFrontmatter(content);
    for (const diag of parsed.diagnostics) {
      diagnostics.push({
        ...diag,
        script: SCRIPT_NAME,
        file: relPath,
      });
    }
  }

  return diagnostics;
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
