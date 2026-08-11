/**
 * Canvas renderer — generates single-page dark-themed HTML review artifact.
 *
 * Reads local Forge data (reviews + diff + log) and optional Bitbucket MCP
 * enrichment, renders into a three-column HTML layout with findings data
 * embedded as a safe JSON island [R4.8].
 *
 * **Validates: Requirements R4.1–R4.10**
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tryFetchEnrichment } from "./bitbucket-mcp-adapter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CanvasFinding {
  severity: string;
  file: string;
  issue: string;
  suggestion: string;
}

export interface CanvasFindings {
  spec: readonly CanvasFinding[];
  quality: readonly CanvasFinding[];
  security: readonly CanvasFinding[];
}

export interface CanvasOptions {
  topic: string;
  cwd?: string;
  forgeDir?: string;
  findings: CanvasFindings;
}

export interface CanvasResult {
  html: string;
  outputPath: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Render the review canvas HTML.
 *
 * Steps:
 *   1. Read template files (base.html, renderer.js)
 *   2. Prepare findings data
 *   3. Embed as safe JSON island (JSON.stringify + HTML-escape)
 *   4. Write output to .forge/reviews/<topic>.canvas.html
 */
export async function renderCanvas(options: CanvasOptions): Promise<CanvasResult> {
  const { topic, findings } = options;
  const cwd = options.cwd ?? process.cwd();
  const forgeDir = options.forgeDir ?? join(cwd, ".forge");
  const templateDir = resolve(new URL(".", import.meta.url).pathname, "..", "templates", "canvas");

  // Check review file exists [R4.7]
  const reviewPath = join(forgeDir, "reviews", `${topic}.md`);
  if (!existsSync(reviewPath)) {
    throw new Error(`Review file not found: ${reviewPath}. Run /tinkerman review first.`);
  }

  // Load templates
  const baseHtml = loadTemplate(join(templateDir, "base.html.tmpl"));
  const rendererJs = loadTemplate(join(templateDir, "renderer.js.tmpl"));

  // Prepare JSON island — safe embedding via JSON.stringify + HTML escape [R4.8]
  const jsonData = {
    spec: findings.spec,
    quality: findings.quality,
    security: findings.security,
    generatedAt: new Date().toISOString(),
    footerNotice: "",
  };

  // Try Bitbucket MCP enrichment (optional) [R4.3]
  const enrichment = await tryFetchEnrichment(topic);
  if (enrichment === null) {
    jsonData.footerNotice = "Bitbucket MCP enrichment skipped (not available)";
  }

  const jsonIsland = escapeHtml(JSON.stringify(jsonData));

  // Build HTML — use function-form replace() to avoid $' / $` special patterns
  const html = baseHtml
    .replace("{{topic}}", () => escapeHtml(topic))
    .replace("{{json_island}}", () => jsonIsland)
    .replace("{{renderer_js}}", () => rendererJs);

  // Write output
  const outputDir = join(forgeDir, "reviews");
  const outputPath = join(outputDir, `${topic}.canvas.html`);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, html);

  return { html, outputPath };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadTemplate(path: string): string {
  if (!existsSync(path)) {
    // Fallback: minimal template if files not found
    return [
      '<!DOCTYPE html><html><head><meta charset="UTF-8">',
      "<title>Forge Canvas — {{topic}}</title>",
      "<style>body{background:#1a1a2e;color:#e4e4e7;font-family:sans-serif;padding:24px}",
      ".columns{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}",
      ".no-findings{text-align:center;opacity:.5;padding:24px}</style></head>",
      "<body><h1>Forge Review — {{topic}}</h1>",
      '<div class="columns" id="content"></div>',
      '<script id="findings-data" type="application/json">{{json_island}}</script>',
      "<script>{{renderer_js}}</script></body></html>",
    ].join("");
  }
  return readFileSync(path, "utf-8");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
