#!/usr/bin/env node
/**
 * Build docs index — scans docs/ for .md files, generates INDEX.md and INDEX.en.md.
 * Exit codes: 0 = success, 1 = error (no valid docs found), 3 = internal error.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pairBilingual } from "../src/docs-governance/bilingual.js";
import { commonHelp } from "../src/docs-governance/cli/_help.js";
import { computeExitResult } from "../src/docs-governance/cli/_runtime.js";
import { makeDiagnosticFactory } from "../src/docs-governance/cli/diagnostic-helper.js";
import { walkMdFiles } from "../src/docs-governance/cli/scan-files.js";
import { classify, EXCLUDED_PREFIXES } from "../src/docs-governance/domains.js";
import { parseFrontmatter } from "../src/docs-governance/frontmatter/parser.js";
import { buildIndex } from "../src/docs-governance/index-generator/generator.js";
import { formatDiagnostics, formatNdjson } from "../src/docs-governance/reporter/diagnostic.js";
import type { DiagnosticRecord, Doc, DocPath, Frontmatter } from "../src/docs-governance/types.js";

const SCRIPT_NAME = "build-docs-index";
const makeDiagnostic = makeDiagnosticFactory(SCRIPT_NAME);

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

  // 1. Walk and collect .md files (exclude api/ build artifacts)
  const mdFiles = walkMdFiles(docsDir, { relativeTo: docsDir, symlinkSafe: true, allowDotDirs: [".tinkerman", ".kiro"], excludedPrefixes: EXCLUDED_PREFIXES })
    .filter((f) => !f.startsWith("api/"));

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
