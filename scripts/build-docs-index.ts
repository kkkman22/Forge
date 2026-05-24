#!/usr/bin/env node
/**
 * Build docs index — scans docs/ for .md files, generates INDEX.md and INDEX.en.md.
 * Exit codes: 0 = success, 1 = error (no valid docs found), 3 = internal error.
 */
import { readdirSync, lstatSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseFrontmatter } from "../src/docs-governance/frontmatter/parser.js";
import { pairBilingual } from "../src/docs-governance/bilingual.js";
import { buildIndex } from "../src/docs-governance/index-generator/generator.js";
import { classify, EXCLUDED_PREFIXES } from "../src/docs-governance/domains.js";
import { computeExitResult } from "../src/docs-governance/cli/_runtime.js";
import { formatDiagnostics, formatNdjson } from "../src/docs-governance/reporter/diagnostic.js";
import { commonHelp } from "../src/docs-governance/cli/_help.js";
import type { Doc, DocPath, Frontmatter, DiagnosticRecord, Severity } from "../src/docs-governance/types.js";

const SCRIPT_NAME = "build-docs-index";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function walkMarkdownFiles(rootDir: string): string[] {
  const results: string[] = [];
  const resolvedRoot = resolve(rootDir);
  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const stat = lstatSync(fullPath);
      if (stat.isSymbolicLink()) continue;
      if (!resolve(fullPath).startsWith(resolvedRoot)) continue;
      if (entry.name.startsWith(".") && entry.name !== ".forge" && entry.name !== ".kiro") continue;
      const rel = relative(rootDir, fullPath);
      if (EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) continue;
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(".md")) {
        results.push(rel);
      }
    }
  }
  walk(rootDir);
  return results;
}

function makeDiagnostic(
  file: DocPath,
  severity: Severity,
  message: string,
  extra?: Record<string, string | number | boolean>,
): DiagnosticRecord {
  return {
    script: SCRIPT_NAME,
    severity,
    file,
    message,
    ...(extra ? { extra } : {}),
  };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    commonHelp(SCRIPT_NAME, "Scan docs/ for .md files and generate INDEX.md / INDEX.en.md."),
  );
  process.exit(0);
}

const jsonMode = args.includes("--json");
// First non-flag argument is the docs directory; default to "docs"
const docsDir = resolve(
  args.find((a) => !a.startsWith("-")) ?? "docs",
);

const result = computeExitResult(() => {
  const diagnostics: DiagnosticRecord[] = [];

  if (!existsSync(docsDir)) {
    diagnostics.push(
      makeDiagnostic("docs/" as DocPath, "error", `docs directory not found: ${docsDir}`),
    );
    return diagnostics;
  }

  // 1. Walk and collect .md files
  const mdFiles = walkMarkdownFiles(docsDir);

  // 2. Parse frontmatter for each file
  const docs: Doc[] = [];
  for (const relPath of mdFiles) {
    const fullPath = join(docsDir, relPath);
    const raw = readFileSync(fullPath, "utf-8");
    const parsed = parseFrontmatter(raw);

    if (!parsed.frontmatter) {
      diagnostics.push(
        makeDiagnostic(relPath as DocPath, "warning", `skipping: no valid frontmatter`),
      );
      continue;
    }

    // Filter out INDEX files to avoid self-referencing
    if (relPath === "INDEX.md" || relPath === "INDEX.en.md") continue;

    const domain = classify(relPath);

    docs.push({
      path: relPath as DocPath,
      domain: domain === "EXCLUDED" || domain === "UNCLASSIFIED" ? "A" : domain,
      frontmatter: parsed.frontmatter as Frontmatter,
      bodyHash: "",
    });
  }

  if (docs.length === 0) {
    diagnostics.push(
      makeDiagnostic("docs/" as DocPath, "error", "no documents with valid frontmatter found"),
    );
    return diagnostics;
  }

  // 3. Pair bilingual documents
  const pairs = pairBilingual(docs);

  // 4. Build index
  const indexContent = buildIndex(pairs);

  // 5. Write output files
  const cnIndexPath = join(docsDir, "INDEX.md");
  const enIndexPath = join(docsDir, "INDEX.en.md");

  writeFileSync(cnIndexPath, indexContent.cn, "utf-8");
  writeFileSync(enIndexPath, indexContent.en, "utf-8");

  diagnostics.push(
    makeDiagnostic("docs/INDEX.md" as DocPath, "info", `generated with ${docs.length} docs, ${pairs.length} pairs`),
  );

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
