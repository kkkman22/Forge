#!/usr/bin/env node
/**
 * build-docs-embeds — render all SSOT embed directives in docs/ files.
 *
 * Scans docs/ for Markdown files containing embed directives,
 * renders each directive via syncEmbeds(), and writes the result back.
 *
 * Flags:
 *   --dry-run   Preview changes without writing files
 *   --json      Output diagnostics as NDJSON
 *   --help      Show help
 *
 * Exit codes: 0 = clean, 1 = error, 3 = internal error.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadConfigWithDefaults } from "../src/docs-governance/config.js";
import { computeExitResult } from "../src/docs-governance/cli/_runtime.js";
import { formatDiagnostics, formatNdjson } from "../src/docs-governance/reporter/diagnostic.js";
import { commonHelp } from "../src/docs-governance/cli/_help.js";
import { syncEmbeds } from "../src/docs-governance/ssot/embed-sync.js";
import { createRendererRegistry } from "../src/docs-governance/ssot/renderer-registry.js";
import { commandsTableRenderer } from "../src/docs-governance/ssot/renderers/commands-table.js";
import { routingTableRenderer } from "../src/docs-governance/ssot/renderers/routing-table.js";
import { securityTiersRenderer } from "../src/docs-governance/ssot/renderers/security-tiers.js";
import { jsonListRenderer } from "../src/docs-governance/ssot/renderers/json-list.js";
import { parseEmbeds } from "../src/docs-governance/ssot/embed-parser.js";
import type { DiagnosticRecord, DocPath, RendererFn } from "../src/docs-governance/types.js";

const SCRIPT_NAME = "build-docs-embeds";
const DOCS_DIR = "docs";

// ── Helpers ──

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

function hasValidDirectives(content: string, filePath: DocPath): boolean {
  const { directives, diagnostics } = parseEmbeds(content, filePath);
  const structuralErrors = diagnostics.filter(
    (d) =>
      d.severity === "error" &&
      (d.code === "EMBED_UNCLOSED" ||
        d.code === "EMBED_TOPIC_MISMATCH" ||
        d.code === "EMBED_NESTING" ||
        d.code === "EMBED_ORPHAN_END"),
  );
  return directives.length > 0 && structuralErrors.length === 0;
}

function loadSsotData(rootDir: string): Map<string, string> {
  const configPath = resolve(rootDir, ".forge/config.md");
  let raw = "";
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    return new Map();
  }

  const config = loadConfigWithDefaults(raw);
  const ssotData = new Map<string, string>();

  for (const entry of config.docs.ssot_sources) {
    const sourcePath = resolve(rootDir, entry.source);
    try {
      if (existsSync(sourcePath)) {
        const content = readFileSync(sourcePath, "utf-8");
        ssotData.set(entry.topic, content);
      }
    } catch {
      // Source file missing — renderer will handle null source
    }
  }

  return ssotData;
}

function loadFileEmbeds(rootDir: string, files: string[], ssotData: Map<string, string>): void {
  // Collect file-embed paths from all doc files
  const embedPaths = new Set<string>();
  for (const filePath of files) {
    const content = readFileSync(filePath, "utf-8");
    const relPath = relative(rootDir, filePath);
    const { directives } = parseEmbeds(content, relPath as DocPath);
    for (const d of directives) {
      if (d.kind === "file-embed") {
        // topic is "file:relative/path"
        embedPaths.add(d.topic);
      }
    }
  }

  // Load each unique file-embed
  for (const topic of embedPaths) {
    if (ssotData.has(topic)) continue;
    // topic format: "file:relative/path"
    const embedRelPath = topic.slice(5); // strip "file:"
    const fullPath = resolve(rootDir, embedRelPath);
    try {
      if (existsSync(fullPath)) {
        ssotData.set(topic, readFileSync(fullPath, "utf-8"));
      }
    } catch {
      // Missing file — syncEmbeds will report EMBED_FILE_NOT_FOUND
    }
  }
}

function buildRegistry(): ReturnType<typeof createRendererRegistry> {
  const reg = createRendererRegistry();
  reg.register("commands-table", commandsTableRenderer as RendererFn);
  reg.register("routing-table", routingTableRenderer as RendererFn);
  reg.register("security-tiers", securityTiersRenderer as RendererFn);
  reg.register("json-list", jsonListRenderer as RendererFn);
  return reg;
}

// ── Main ──

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    commonHelp(
      SCRIPT_NAME,
      "Render all SSOT embed directives in docs/ files.\n" +
        "Replaces directive blocks with rendered content from SSOT sources.",
    ),
  );
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const jsonMode = args.includes("--json");
const rootDir = resolve(process.cwd());

const result = computeExitResult((): DiagnosticRecord[] => {
  const docsDir = resolve(rootDir, DOCS_DIR);
  if (!existsSync(docsDir)) {
    return [];
  }

  const reg = buildRegistry();
  const ssotData = loadSsotData(rootDir);
  const mdFiles = collectMdFiles(docsDir);

  // Load file-embed content
  loadFileEmbeds(rootDir, mdFiles, ssotData);

  const allDiagnostics: DiagnosticRecord[] = [];
  let filesProcessed = 0;

  for (const filePath of mdFiles) {
    const content = readFileSync(filePath, "utf-8");
    const relPath = relative(rootDir, filePath) as DocPath;

    if (!hasValidDirectives(content, relPath)) continue;

    filesProcessed++;
    const { content: newContent, diagnostics } = syncEmbeds(content, relPath, reg, ssotData);
    allDiagnostics.push(...diagnostics);

    if (newContent !== content && !dryRun) {
      writeFileSync(filePath, newContent, "utf-8");
    }
  }

  if (!jsonMode) {
    const mode = dryRun ? "[dry-run] " : "";
    process.stderr.write(`${mode}Processed ${filesProcessed} file(s) with embed directives.\n`);
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
