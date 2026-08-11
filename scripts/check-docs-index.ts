#!/usr/bin/env node
/**
 * Check docs index sync — verifies INDEX.md / INDEX.en.md match the generated output.
 * Exit codes: 0 = in sync, 1 = mismatch, 3 = internal error.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseFrontmatter } from "../src/docs-governance/frontmatter/parser.js";
import { pairBilingual } from "../src/docs-governance/bilingual.js";
import { buildIndex } from "../src/docs-governance/index-generator/generator.js";
import { classify, EXCLUDED_PREFIXES } from "../src/docs-governance/domains.js";
import { computeExitResult } from "../src/docs-governance/cli/_runtime.js";
import { formatDiagnostics, formatNdjson } from "../src/docs-governance/reporter/diagnostic.js";
import { commonHelp } from "../src/docs-governance/cli/_help.js";
import { walkMdFiles } from "../src/docs-governance/cli/scan-files.js";
import { makeDiagnosticFactory } from "../src/docs-governance/cli/diagnostic-helper.js";
import type { Doc, DocPath, Frontmatter, DiagnosticRecord } from "../src/docs-governance/types.js";

const SCRIPT_NAME = "check-docs-index";
const makeDiagnostic = makeDiagnosticFactory(SCRIPT_NAME);

function unifiedDiffSummary(expected: string, actual: string, maxLines = 200): string {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const lines: string[] = [];

  const maxLen = Math.max(expectedLines.length, actualLines.length);
  let diffCount = 0;

  for (let i = 0; i < maxLen; i++) {
    const expLine = expectedLines[i] ?? "";
    const actLine = actualLines[i] ?? "";

    if (expLine !== actLine) {
      diffCount++;
      if (lines.length < maxLines) {
        lines.push(`- ${expLine}`);
        lines.push(`+ ${actLine}`);
      }
    }
  }

  if (diffCount === 0) return "";

  const header = `diff: ${diffCount} lines differ`;
  if (lines.length >= maxLines) {
    return `${header}\n${lines.join("\n")}\n... (truncated at ${maxLines} lines)`;
  }
  return `${header}\n${lines.join("\n")}`;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    commonHelp(
      SCRIPT_NAME,
      "Check that INDEX.md / INDEX.en.md are in sync with the generated output.",
    ),
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
  const mdFiles = walkMdFiles(docsDir, { relativeTo: docsDir, symlinkSafe: true, allowDotDirs: [".tinkerman", ".kiro"], excludedPrefixes: EXCLUDED_PREFIXES });

  // 2. Parse frontmatter for each file
  const docs: Doc[] = [];
  for (const relPath of mdFiles) {
    if (relPath === "INDEX.md" || relPath === "INDEX.en.md") continue;

    const fullPath = join(docsDir, relPath);
    const raw = readFileSync(fullPath, "utf-8");
    const parsed = parseFrontmatter(raw);

    if (!parsed.frontmatter) continue;

    const domain = classify(relPath);

    docs.push({
      path: relPath as DocPath,
      domain: domain === "EXCLUDED" || domain === "UNCLASSIFIED" ? "A" : domain,
      frontmatter: parsed.frontmatter as Frontmatter,
      bodyHash: "",
    });
  }

  // 3. Build expected index in-memory
  const pairs = pairBilingual(docs);
  const expected = buildIndex(pairs);

  // 4. Compare with existing files
  const cnIndexPath = join(docsDir, "INDEX.md");
  const enIndexPath = join(docsDir, "INDEX.en.md");

  let hasMismatch = false;

  // Check CN index
  if (!existsSync(cnIndexPath)) {
    diagnostics.push(
      makeDiagnostic("docs/INDEX.md" as DocPath, "error", "INDEX.md does not exist"),
    );
    hasMismatch = true;
  } else {
    const existingCn = readFileSync(cnIndexPath, "utf-8");
    if (existingCn !== expected.cn) {
      const diff = unifiedDiffSummary(expected.cn, existingCn);
      diagnostics.push(
        makeDiagnostic("docs/INDEX.md" as DocPath, "error", `INDEX.md mismatch\n${diff}`),
      );
      hasMismatch = true;
    }
  }

  // Check EN index
  if (!existsSync(enIndexPath)) {
    diagnostics.push(
      makeDiagnostic("docs/INDEX.en.md" as DocPath, "error", "INDEX.en.md does not exist"),
    );
    hasMismatch = true;
  } else {
    const existingEn = readFileSync(enIndexPath, "utf-8");
    if (existingEn !== expected.en) {
      const diff = unifiedDiffSummary(expected.en, existingEn);
      diagnostics.push(
        makeDiagnostic("docs/INDEX.en.md" as DocPath, "error", `INDEX.en.md mismatch\n${diff}`),
      );
      hasMismatch = true;
    }
  }

  if (hasMismatch) {
    diagnostics.push(
      makeDiagnostic(
        "docs/INDEX.md" as DocPath,
        "error",
        'Run `npm run docs:index` to regenerate, then re-stage.',
      ),
    );
  } else {
    diagnostics.push(
      makeDiagnostic("docs/INDEX.md" as DocPath, "info", "index in sync"),
    );
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
