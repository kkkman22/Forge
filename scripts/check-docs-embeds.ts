#!/usr/bin/env node
/**
 * check-docs-embeds — sync gate that verifies docs embeds are up to date.
 *
 * Renders all embed directives in-memory and compares byte-by-byte
 * against existing files. Reports mismatches with unified diff output.
 *
 * Pre-commit context: only runs when staged files touch docs/, docs/_ssot/,
 *   or .tinkerman/config.md.
 * CI context: always runs.
 *
 * Flags:
 *   --json      Output diagnostics as NDJSON
 *   --help      Show help
 *
 * Exit codes: 0 = clean, 1 = stale/mismatch, 3 = internal error.
 */
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { relative, resolve } from "node:path";
import { computeExitResult } from "../src/docs-governance/cli/_runtime.js";
import { formatDiagnostics, formatNdjson } from "../src/docs-governance/reporter/diagnostic.js";
import { commonHelp } from "../src/docs-governance/cli/_help.js";
import { walkMdFiles } from "../src/docs-governance/cli/scan-files.js";
import { loadSsotData, buildDefaultRegistry } from "../src/docs-governance/ssot/ssot-loader.js";
import { syncEmbeds } from "../src/docs-governance/ssot/embed-sync.js";
import { commandsTableRenderer } from "../src/docs-governance/ssot/renderers/commands-table.js";
import { routingTableRenderer } from "../src/docs-governance/ssot/renderers/routing-table.js";
import { securityTiersRenderer } from "../src/docs-governance/ssot/renderers/security-tiers.js";
import { jsonListRenderer } from "../src/docs-governance/ssot/renderers/json-list.js";
import { countRenderer } from "../src/docs-governance/ssot/renderers/count.js";
import { parseEmbeds } from "../src/docs-governance/ssot/embed-parser.js";
import type { DiagnosticRecord, DocPath, RendererFn } from "../src/docs-governance/types.js";

const SCRIPT_NAME = "check-docs-embeds";
const DOCS_DIR = "docs";

const RENDERERS: [string, RendererFn][] = [
  ["commands-table", commandsTableRenderer as RendererFn],
  ["routing-table", routingTableRenderer as RendererFn],
  ["security-tiers", securityTiersRenderer as RendererFn],
  ["json-list", jsonListRenderer as RendererFn],
  ["count", countRenderer as RendererFn],
];

// ── Helpers ──

function loadFileEmbeds(rootDir: string, files: string[], ssotData: Map<string, unknown>): void {
  const embedPaths = new Set<string>();
  for (const filePath of files) {
    const content = readFileSync(filePath, "utf-8");
    const relPath = relative(rootDir, filePath);
    const { directives } = parseEmbeds(content, relPath as DocPath);
    for (const d of directives) {
      if (d.kind === "file-embed") {
        embedPaths.add(d.topic);
      }
    }
  }

  for (const topic of embedPaths) {
    if (ssotData.has(topic)) continue;
    const embedRelPath = topic.slice(5); // strip "file:"
    const fullPath = resolve(rootDir, embedRelPath);
    try {
      if (existsSync(fullPath)) {
        ssotData.set(topic, readFileSync(fullPath, "utf-8"));
      }
    } catch {
      // Missing — syncEmbeds reports error
    }
  }
}

function unifiedDiff(filePath: string, oldContent: string, newContent: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const maxLen = Math.max(oldLines.length, newLines.length);
  const lines: string[] = [`--- ${filePath}`, `+++ ${filePath} (rendered)`];

  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    if (oldLine !== newLine) {
      if (oldLine !== undefined) lines.push(`- ${oldLine}`);
      if (newLine !== undefined) lines.push(`+ ${newLine}`);
    }
  }

  return lines.join("\n");
}

/**
 * In pre-commit context, check if staged files touch relevant paths.
 * In CI context, always run.
 */
function shouldRun(rootDir: string): boolean {
  // In CI, always run
  if (process.env.CI === "true") return true;

  // Not in CI and no FORGE_HOOK env — assume always run
  if (!process.env.FORGE_HOOK) return true;

  try {
    const staged = execSync("git diff --cached --name-only", { cwd: rootDir, encoding: "utf-8" });
    const files = staged.trim().split("\n").filter(Boolean);
    return files.some(
      (f) =>
        f.startsWith("docs/") ||
        f.startsWith("docs/_ssot/") ||
        f === ".tinkerman/config.md",
    );
  } catch {
    // Cannot determine staged files — run anyway
    return true;
  }
}

// ── Main ──

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    commonHelp(
      SCRIPT_NAME,
      "Verify that docs embed directives are up to date.\n" +
        "Renders embeds in-memory and compares against files. Reports mismatches.\n\n" +
        "Suggestion: Run `npm run docs:embeds` to regenerate.",
    ),
  );
  process.exit(0);
}

const jsonMode = args.includes("--json");
const rootDir = resolve(process.cwd());

const result = computeExitResult((): DiagnosticRecord[] => {
  // Pre-commit gating
  if (!shouldRun(rootDir)) {
    if (!jsonMode) {
      process.stderr.write("No docs-related staged files — skipping embed check.\n");
    }
    return [];
  }

  const docsDir = resolve(rootDir, DOCS_DIR);
  if (!existsSync(docsDir)) {
    return [];
  }

  const reg = buildDefaultRegistry(RENDERERS);
  const ssotData = loadSsotData(rootDir);
  const mdFiles = walkMdFiles(docsDir, { skipSsot: true });

  // Also scan root .md files for embed directives
  const rootWhitelist = ["README.md"] as const;
  for (const name of rootWhitelist) {
    const p = resolve(rootDir, name);
    if (existsSync(p)) mdFiles.push(p);
  }

  // Load file-embed content
  loadFileEmbeds(rootDir, mdFiles, ssotData);

  const allDiagnostics: DiagnosticRecord[] = [];
  const staleFiles: string[] = [];

  for (const filePath of mdFiles) {
    const content = readFileSync(filePath, "utf-8");
    const relPath = relative(rootDir, filePath) as DocPath;

    // Quick filter: only check files with embed markers
    if (!content.includes("ssot:") && !content.includes("#[[file:")) continue;

    const { content: rendered, diagnostics } = syncEmbeds(content, relPath, reg, ssotData);
    allDiagnostics.push(...diagnostics);

    if (rendered !== content) {
      staleFiles.push(relPath);
      if (!jsonMode) {
        const diff = unifiedDiff(relPath, content, rendered);
        process.stderr.write(`${diff}\n\n`);
      }
      allDiagnostics.push({
        script: SCRIPT_NAME,
        severity: "error",
        file: relPath,
        message: "embed directives are stale — rendered content does not match file",
        code: "EMBED_STALE",
      });
    }
  }

  if (staleFiles.length > 0) {
    allDiagnostics.push({
      script: SCRIPT_NAME,
      severity: "error",
      file: "" as DocPath,
      message: `${staleFiles.length} file(s) have stale embeds. Run \`npm run docs:embeds\` to regenerate.`,
      code: "EMBED_STALE_SUMMARY",
    });
  } else if (!jsonMode) {
    process.stderr.write("All embed directives are up to date.\n");
  }

  return allDiagnostics;
});

if (jsonMode) {
  process.stdout.write(`${formatNdjson(result.diagnostics)}\n`);
} else {
  const output = formatDiagnostics(result.diagnostics);
  if (output.trim()) {
    process.stdout.write(`${output}\n`);
  }
}

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
}

process.exit(result.exitCode);
