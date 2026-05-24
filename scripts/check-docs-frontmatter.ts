#!/usr/bin/env node
/**
 * Frontmatter checker — validates frontmatter schema for docs/ markdown files.
 * Exit codes: 0 = clean, 1 = error, 2 = critical, 3 = internal error.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseFrontmatter } from "../src/docs-governance/frontmatter/parser.js";
import { computeExitResult } from "../src/docs-governance/cli/_runtime.js";
import { formatDiagnostics, formatNdjson } from "../src/docs-governance/reporter/diagnostic.js";
import { commonHelp, formatHelp } from "../src/docs-governance/cli/_help.js";
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

// ── File scanning ──

function shouldExclude(filename: string): boolean {
  if (filename.match(/^INDEX/i)) return true;
  if (filename === "README.md") return true;
  return false;
}

function collectMdFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(current: string): void {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }

    for (const entry of entries) {
      // Skip hidden files and directories
      if (entry.startsWith(".")) continue;

      const fullPath = join(current, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && entry.endsWith(".md") && !shouldExclude(entry)) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results.sort();
}

// ── Main ──

const rootDir = resolve(process.cwd());
const docsDir = join(rootDir, "docs");

const result = computeExitResult(() => {
  const files = collectMdFiles(docsDir);
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
