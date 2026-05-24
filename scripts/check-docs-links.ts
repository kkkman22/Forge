#!/usr/bin/env node
/**
 * Link checker — scans docs/ for internal markdown links and validates anchors.
 * Exit codes: 0 = clean, 1 = broken link, 3 = internal error.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname, basename } from "node:path";
import { computeExitResult } from "../src/docs-governance/cli/_runtime.js";
import { formatDiagnostics, formatNdjson } from "../src/docs-governance/reporter/diagnostic.js";
import { commonHelp } from "../src/docs-governance/cli/_help.js";
import { extractLinks, gfmAnchor, dedupAnchorsInDoc } from "../src/docs-governance/link-checker.js";
import type { DiagnosticRecord, DocPath } from "../src/docs-governance/types.js";

const SCRIPT_NAME = "check-docs-links";

interface HeadingEntry {
  text: string;
  anchor: string;
}

function walkMdFiles(dir: string, rootDir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMdFiles(full, rootDir));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(relative(rootDir, full));
    }
  }
  return results;
}

function extractHeadings(text: string): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  const lines = text.split("\n");
  let inFencedCode = false;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inFencedCode = !inFencedCode;
      continue;
    }
    if (inFencedCode) continue;

    // ATX headings: ## Title
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({ text: match[2].replace(/#+\s*$/, "").trim(), anchor: "" });
    }
  }

  dedupAnchorsInDoc(headings);
  return headings;
}

// ── Main ──

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    commonHelp(SCRIPT_NAME, "Scan docs/ for internal markdown links and validate anchors."),
  );
  process.exit(0);
}

const jsonMode = args.includes("--json");
const rootDir = resolve(process.cwd());

const result = computeExitResult((): DiagnosticRecord[] => {
  const diags: DiagnosticRecord[] = [];
  const docsDir = resolve(rootDir, "docs");

  const mdFiles = walkMdFiles(docsDir, rootDir);
  if (mdFiles.length === 0) return diags;

  // Build anchor map: file -> Set of valid anchors
  const anchorMap = new Map<string, Set<string>>();
  const fileSet = new Set(mdFiles);

  for (const file of mdFiles) {
    const fullPath = resolve(rootDir, file);
    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }

    const headings = extractHeadings(content);
    const anchors = new Set(headings.map((h) => h.anchor));
    anchorMap.set(file, anchors);
  }

  // Check links in each file
  for (const file of mdFiles) {
    const fullPath = resolve(rootDir, file);
    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }

    const links = extractLinks(content);
    const fileDir = dirname(file);

    for (const link of links) {
      const { target, line } = link;

      // Split into file path and anchor
      const hashIdx = target.indexOf("#");
      let targetPath = hashIdx >= 0 ? target.slice(0, hashIdx) : target;
      const anchor = hashIdx >= 0 ? target.slice(hashIdx + 1) : null;

      // Resolve relative path
      if (targetPath === "") {
        // Same-file anchor link like #heading
        targetPath = file;
      } else {
        targetPath = join(fileDir, targetPath);
        // Normalize
        targetPath = targetPath.replace(/\\/g, "/");
      }

      // Check if target file exists
      if (!fileSet.has(targetPath) && !fileSet.has(`${targetPath}.md`)) {
        // Try with .md extension
        const withMd = `${targetPath}.md`;
        if (fileSet.has(withMd)) {
          targetPath = withMd;
        } else {
          diags.push({
            script: SCRIPT_NAME,
            severity: "error",
            file: file as DocPath,
            line,
            message: `Broken link ${target}: file ${targetPath} not found`,
            code: "BROKEN_LINK",
          });
          continue;
        }
      }

      // Check anchor if present
      if (anchor) {
        const anchors = anchorMap.get(targetPath);
        if (!anchors || !anchors.has(anchor)) {
          diags.push({
            script: SCRIPT_NAME,
            severity: "error",
            file: file as DocPath,
            line,
            message: `Broken anchor in ${targetPath}#${anchor}: anchor not found`,
            code: "BROKEN_ANCHOR",
          });
        }
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
