#!/usr/bin/env node
/**
 * Bilingual checker — validates .md/.en.md file pairs for consistency.
 * Exit codes: 0 = clean, 1 = error, 2 = critical, 3 = internal error.
 */
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseFrontmatter } from "../src/docs-governance/frontmatter/parser.js";
import { pairBilingual, checkBilingualPairs } from "../src/docs-governance/bilingual.js";
import { computeExitResult } from "../src/docs-governance/cli/_runtime.js";
import { formatDiagnostics, formatNdjson } from "../src/docs-governance/reporter/diagnostic.js";
import { formatHelp } from "../src/docs-governance/cli/_help.js";
import { walkMdFiles } from "../src/docs-governance/cli/scan-files.js";
import type { DiagnosticRecord, Doc, DocPath } from "../src/docs-governance/types.js";

const SCRIPT_NAME = "check-docs-bilingual";

// ── Args ──

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    formatHelp(SCRIPT_NAME, "Validate .md/.en.md file pairs for bilingual consistency.", [
      "--json     Output diagnostics as NDJSON",
      "--help     Show this help message",
    ]),
  );
  process.exit(0);
}

const jsonMode = args.includes("--json");

// ── Build Doc objects ──

function buildDocs(files: string[], rootDir: string): { docs: Doc[]; diagnostics: DiagnosticRecord[] } {
  const docs: Doc[] = [];
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
    if (parsed.frontmatter) {
      docs.push({
        path: relPath,
        domain: "A", // domain not critical for bilingual checking
        frontmatter: parsed.frontmatter,
        bodyHash: "", // not needed for bilingual check
      });
    } else {
      for (const diag of parsed.diagnostics) {
        diagnostics.push({
          ...diag,
          script: SCRIPT_NAME,
          file: relPath,
        });
      }
    }
  }

  return { docs, diagnostics };
}

// ── Main ──

const rootDir = resolve(process.cwd());
const docsDir = join(rootDir, "docs");

const result = computeExitResult(() => {
  const files = walkMdFiles(docsDir, { extensions: [".md", ".en.md"] });
  const { docs, diagnostics } = buildDocs(files, rootDir);

  const pairs = pairBilingual(docs);
  const pairDiags = checkBilingualPairs(pairs);

  // Rewrite script name to match our CLI
  for (const d of pairDiags) {
    diagnostics.push({ ...d, script: SCRIPT_NAME });
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
