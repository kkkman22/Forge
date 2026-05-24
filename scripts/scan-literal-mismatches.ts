#!/usr/bin/env node
/**
 * Literal mismatch scanner — finds hardcoded command counts in docs/
 * that should be replaced with SSOT embed directives.
 * Outputs a migration suggestion list.
 */
import { existsSync, readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { commonHelp } from "../src/docs-governance/cli/_help.js";

const SCRIPT_NAME = "scan-literal-mismatches";
const DOCS_DIR = "docs";

// Patterns that indicate hardcoded command/feature counts
const LITERAL_PATTERNS = [
  /(\d+)\s*(?:个\s*)?(?:命令|commands?)(?!\w)/giu,
  /(\d+)\s*(?:个\s*)?(?:子命令|sub-?commands?)(?!\w)/giu,
  /(\d+)\s*(?:个\s*)?(?:技能|skills?)(?!\w)/giu,
  /(\d+)\s*(?:个\s*)?(?:检查器|checkers?)(?!\w)/giu,
] as const;

interface LiteralMatch {
  file: string;
  line: number;
  literal: string;
  count: number;
  suggestion: string;
}

function collectMdFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMdFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

function isInFencedCodeBlock(lines: string[], targetLineIdx: number): boolean {
  let inBlock = false;
  for (let i = 0; i < targetLineIdx; i++) {
    if (lines[i].trimStart().startsWith("```")) {
      inBlock = !inBlock;
    }
  }
  return inBlock;
}

function scanFile(filePath: string): LiteralMatch[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const matches: LiteralMatch[] = [];
  const relPath = relative(process.cwd(), filePath);

  for (let i = 0; i < lines.length; i++) {
    if (isInFencedCodeBlock(lines, i)) continue;

    const line = lines[i];
    for (const pattern of LITERAL_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null = pattern.exec(line);
      while (match !== null) {
        matches.push({
          file: relPath,
          line: i + 1,
          literal: match[0],
          count: Number.parseInt(match[1], 10),
          suggestion: `<!-- ssot:begin topic=commands render=commands-table --> ... <!-- ssot:end topic=commands -->`,
        });
        match = pattern.exec(line);
      }
    }
  }

  return matches;
}

// ── Main ──

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    commonHelp(
      SCRIPT_NAME,
      "Scan docs/ for hardcoded command/feature counts that should be\n" +
        "replaced with SSOT embed directives.",
    ),
  );
  process.exit(0);
}

const docsDir = resolve(process.cwd(), DOCS_DIR);

if (!existsSync(docsDir)) {
  process.stderr.write(`No ${DOCS_DIR}/ directory found.\n`);
  process.exit(1);
}

const mdFiles = collectMdFiles(docsDir);
const allMatches: LiteralMatch[] = [];

for (const filePath of mdFiles) {
  allMatches.push(...scanFile(filePath));
}

if (allMatches.length === 0) {
  process.stdout.write("No hardcoded literal counts found in docs/.\n");
  process.exit(0);
}

process.stdout.write(`Found ${allMatches.length} literal count(s) in docs/:\n\n`);

for (const m of allMatches) {
  process.stdout.write(
    `  ${m.file}:${m.line} — "${m.literal}" (${m.count})\n` +
      `    Suggestion: ${m.suggestion}\n\n`,
  );
}
