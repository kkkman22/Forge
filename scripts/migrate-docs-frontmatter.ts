#!/usr/bin/env node
/**
 * Semi-automatic frontmatter migration — scans docs/ for .md files
 * missing frontmatter and generates draft suggestions.
 * --apply: write generated frontmatter to files
 * Default: dry-run, output suggestions only
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { commonHelp } from "../src/docs-governance/cli/_help.js";
import { walkMdFiles } from "../src/docs-governance/cli/scan-files.js";
import { parseFrontmatter } from "../src/docs-governance/frontmatter/parser.js";
import { serialize } from "../src/docs-governance/frontmatter/serializer.js";
import type { Frontmatter } from "../src/docs-governance/types.js";

const SCRIPT_NAME = "migrate-docs-frontmatter";
const DOCS_DIR = "docs";

interface MigrationSuggestion {
  file: string;
  title: string;
  category: Frontmatter["category"];
  audience: Frontmatter["audience"];
  updated: string;
  owner: string;
}

function extractH1(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function inferCategory(filePath: string, content: string): Frontmatter["category"] {
  const lower = filePath.toLowerCase() + " " + content.slice(0, 500).toLowerCase();
  if (lower.includes("getting-started") || lower.includes("getting started") || lower.includes("quick start") || lower.includes("入门") || lower.includes("快速开始")) {
    return "getting-started";
  }
  if (lower.includes("troubleshoot") || lower.includes("faq") || lower.includes("trouble")) {
    return "troubleshooting";
  }
  if (lower.includes("contribut") || lower.includes("develop") || lower.includes("贡献")) {
    return "contributing";
  }
  if (lower.includes("advanced") || lower.includes("进阶")) {
    return "advanced";
  }
  return "reference";
}

function getLastGitDate(filePath: string): string {
  try {
    return execFileSync("git", ["log", "-1", "--format=%cs", "--", filePath], { encoding: "utf-8" }).trim();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function generateSuggestion(filePath: string, content: string): MigrationSuggestion {
  const relPath = relative(process.cwd(), filePath);
  const title = extractH1(content) || relPath.replace(/\.en?\.md$/, "").replace(/.*\//, "");
  const category = inferCategory(relPath, content);
  const updated = getLastGitDate(filePath);

  return {
    file: relPath,
    title,
    category,
    audience: ["maintainer"],
    updated,
    owner: "forge-maintainers",
  };
}

function formatSuggestion(s: MigrationSuggestion): string {
  const lines = [
    `File: ${s.file}`,
    `  title: ${s.title}`,
    `  category: ${s.category}`,
    `  audience: [${s.audience.join(", ")}]`,
    `  updated: ${s.updated}`,
    `  owner: ${s.owner}`,
    "",
  ];
  return lines.join("\n");
}

function applyMigration(filePath: string, suggestion: MigrationSuggestion): void {
  const content = readFileSync(filePath, "utf-8");
  // Remove existing body (skip any partial frontmatter)
  let body = content;
  if (body.startsWith("---")) {
    const secondDash = body.indexOf("---", 3);
    if (secondDash !== -1) {
      body = body.slice(secondDash + 3).trimStart();
    }
  }

  const fm: Frontmatter = {
    title: suggestion.title,
    category: suggestion.category,
    audience: suggestion.audience,
    updated: suggestion.updated,
    owner: suggestion.owner,
  };

  const serialized = serialize(fm);
  writeFileSync(filePath, `${serialized}\n${body}`, "utf-8");
}

// ── Main ──

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    commonHelp(
      SCRIPT_NAME,
      "Semi-automatic frontmatter migration for docs/ .md files.\n" +
        "Default: dry-run (output suggestions only).\n" +
        "--apply --force: write generated frontmatter to files (requires --force for safety).",
    ),
  );
  process.exit(0);
}

const applyMode = args.includes("--apply") && args.includes("--force");
const docsDir = resolve(process.cwd(), DOCS_DIR);

if (!existsSync(docsDir)) {
  process.stderr.write(`No ${DOCS_DIR}/ directory found.\n`);
  process.exit(1);
}

const mdFiles = walkMdFiles(docsDir);
const suggestions: MigrationSuggestion[] = [];

for (const filePath of mdFiles) {
  const content = readFileSync(filePath, "utf-8");
  const { frontmatter } = parseFrontmatter(content);

  if (frontmatter === undefined || frontmatter === null) {
    // Missing frontmatter — generate suggestion
    suggestions.push(generateSuggestion(filePath, content));
  }
}

if (suggestions.length === 0) {
  process.stdout.write("All docs/ files already have valid frontmatter.\n");
  process.exit(0);
}

process.stdout.write(`Found ${suggestions.length} file(s) missing frontmatter:\n\n`);

for (const s of suggestions) {
  process.stdout.write(formatSuggestion(s));

  if (applyMode) {
    applyMigration(resolve(process.cwd(), s.file), s);
    process.stdout.write(`  [APPLIED]\n`);
  }
}

if (!applyMode && args.includes("--apply") && !args.includes("--force")) {
  process.stdout.write("\n⚠ --apply requires --force to confirm destructive writes.\n");
} else if (!applyMode) {
  process.stdout.write("\nRun with --apply --force to write frontmatter to files.\n");
}
