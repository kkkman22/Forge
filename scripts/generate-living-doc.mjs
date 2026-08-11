#!/usr/bin/env node

/**
 * generate-living-doc.mjs — CLI wrapper for Forge Living Documentation.
 *
 * Scans .tinkerman/specs/ for spec files, parses frontmatter and scenarios,
 * generates a self-contained HTML site at .tinkerman/docs/living/.
 *
 * Usage:
 *   node scripts/generate-living-doc.mjs [--specs-dir DIR] [--acceptance-dir DIR] [--output-dir DIR]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { specsDir: null, acceptanceDir: null, outputDir: null };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case "--specs-dir":
        args.specsDir = argv[++i];
        break;
      case "--acceptance-dir":
        args.acceptanceDir = argv[++i];
        break;
      case "--output-dir":
        args.outputDir = argv[++i];
        break;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const specsDir = args.specsDir || path.join(projectRoot, ".tinkerman", "specs");
const acceptanceDir = args.acceptanceDir || path.join(projectRoot, ".tinkerman", "acceptance");
const outputDir = args.outputDir || path.join(projectRoot, ".tinkerman", "docs", "living");

// ---------------------------------------------------------------------------
// Spec parsing (inlined from generator.ts logic)
// ---------------------------------------------------------------------------

function parseSpecScenarios(content) {
  const lines = content.split("\n");
  let context = null;
  const scenarios = [];

  // Extract context from frontmatter
  let inFrontmatter = false;
  let frontmatterEnded = false;
  for (const line of lines) {
    if (line.trim() === "---") {
      if (!inFrontmatter && !frontmatterEnded) {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        frontmatterEnded = true;
        break;
      }
    }
    if (inFrontmatter) {
      const match = line.match(/^context:\s*(.+)$/);
      if (match) context = match[1].trim();
    }
  }

  // Find "## Scenarios" section
  let inScenarios = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+Scenarios/.test(line)) {
      inScenarios = true;
      continue;
    }
    if (inScenarios && /^##\s+/.test(line)) {
      inScenarios = false;
      continue;
    }
    if (!inScenarios) continue;

    const numbered = line.match(/^###\s+Scenario\s+\d+:\s*(.+)$/);
    const bare = line.match(/^###\s+(.+)$/);
    let rawTitle = numbered ? numbered[1] : bare ? bare[1] : null;

    if (rawTitle) {
      const tags = [];
      const tagRe = /\[([^\]]+)\]/g;
      let m;
      while ((m = tagRe.exec(rawTitle)) !== null) tags.push(m[1]);
      const title = rawTitle.replace(/\s*\[[^\]]+\]\s*/g, " ").trim();
      scenarios.push({ title, tags, sourceLine: i + 1 });
    }
  }

  return { context, scenarios };
}

// ---------------------------------------------------------------------------
// Acceptance report parsing
// ---------------------------------------------------------------------------

const VERDICT_PATTERNS = [
  { pattern: /✅\s*PASS/, verdict: "pass" },
  { pattern: /❌\s*FAIL/, verdict: "fail" },
  { pattern: /⏳\s*PENDING/, verdict: "pending" },
  { pattern: /⏭\s*SKIP/, verdict: "skip" },
];

function parseAcceptanceVerdicts(content) {
  const result = new Map();
  if (!content) return result;
  const timestamp = new Date().toISOString();
  for (const line of content.split("\n")) {
    const match = line.match(/^-\s+\*\*Scenario\*\*:\s*(.+?)\s*—\s*(.+)$/);
    if (match) {
      const title = match[1].trim();
      for (const { pattern, verdict } of VERDICT_PATTERNS) {
        if (pattern.test(match[2])) {
          result.set(title, { verdict, timestamp });
          break;
        }
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Generate data
// ---------------------------------------------------------------------------

function generateData() {
  const globalStats = { totalScenarios: 0, pass: 0, fail: 0, pending: 0 };
  const contexts = new Map();
  const DEFAULT_CONTEXT = "default";

  // Parse acceptance reports
  const allVerdicts = new Map();
  if (fs.existsSync(acceptanceDir)) {
    for (const f of fs.readdirSync(acceptanceDir).filter((f) => f.endsWith(".md"))) {
      const rp = path.join(acceptanceDir, f);
      const verdicts = parseAcceptanceVerdicts(fs.readFileSync(rp, "utf-8"));
      for (const [title, entry] of verdicts) {
        allVerdicts.set(title, { ...entry, reportPath: rp });
      }
    }
  }

  // Parse specs
  const specFiles = fs.existsSync(specsDir)
    ? fs.readdirSync(specsDir).filter((f) => f.endsWith(".md"))
    : [];

  for (const specFile of specFiles) {
    const sp = path.join(specsDir, specFile);
    const { context: ctxName, scenarios: rawScenarios } = parseSpecScenarios(
      fs.readFileSync(sp, "utf-8"),
    );
    const contextName = ctxName || DEFAULT_CONTEXT;

    const scenarios = rawScenarios.map((s) => {
      const v = allVerdicts.get(s.title);
      return {
        title: s.title,
        tags: s.tags,
        lastVerdict: v ? v.verdict : "pending",
        lastRunAt: v ? v.timestamp : null,
        sourceLine: s.sourceLine,
        acceptanceReportPath: v ? v.reportPath : null,
      };
    });

    if (!contexts.has(contextName)) {
      contexts.set(contextName, {
        name: contextName,
        specs: [],
        stats: { total: 0, pass: 0, fail: 0, pending: 0 },
      });
    }
    const ctx = contexts.get(contextName);
    ctx.specs.push({ topic: specFile.replace(/\.md$/, ""), scenarios, specPath: sp });

    for (const s of scenarios) {
      ctx.stats.total++;
      globalStats.totalScenarios++;
      if (s.lastVerdict === "pass") { ctx.stats.pass++; globalStats.pass++; }
      else if (s.lastVerdict === "fail") { ctx.stats.fail++; globalStats.fail++; }
      else if (s.lastVerdict === "pending") { ctx.stats.pending++; globalStats.pending++; }
    }
  }

  return { generatedAt: new Date().toISOString(), contexts, globalStats };
}

// ---------------------------------------------------------------------------
// HTML rendering (inlined from renderer.ts logic)
// ---------------------------------------------------------------------------

function esc(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function verdictEmoji(v) {
  return { pass: "✅", fail: "❌", pending: "⏳", skip: "⏭" }[v] || "⏳";
}

function renderStyles() {
  return `*,*::before,*::after{box-sizing:border-box}
:root{--color-pass:#16a34a;--color-fail:#dc2626;--color-pending:#d97706;--color-skip:#6b7280;--bg:#f9fafb;--surface:#fff;--text:#111827;--text-muted:#6b7280;--border:#e5e7eb;--radius:8px}
html{font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:var(--text);background:var(--bg)}
body{margin:0;padding:2rem;max-width:72rem}
h1{margin:0 0 .5rem;font-size:1.5rem}h2{margin:1.5rem 0 .75rem;font-size:1.25rem}
a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}
.stats{display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:.75rem 1.25rem;min-width:6rem}
.stat .label{font-size:.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em}
.stat .value{font-size:1.5rem;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));gap:1rem;margin:1rem 0}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.25rem}
.card h3{margin:0 0 .5rem;font-size:1rem}.card .meta{font-size:.875rem;color:var(--text-muted)}
.rate{font-weight:600}.rate.high{color:var(--color-pass)}.rate.mid{color:var(--color-pending)}.rate.low{color:var(--color-fail)}
table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{text-align:left;padding:.5rem .75rem;border-bottom:1px solid var(--border)}
th{font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);background:var(--bg)}
.back{display:inline-block;margin-bottom:1rem;font-size:.875rem}footer{margin-top:2rem;font-size:.75rem;color:var(--text-muted)}`;
}

function renderIndexPage(data) {
  const cards = Array.from(data.contexts.entries())
    .map(([name, ctx]) => {
      const total = ctx.stats.total;
      const rate = total > 0 ? ((ctx.stats.pass / total) * 100).toFixed(0) : "0";
      const rc = +rate >= 80 ? "high" : +rate >= 50 ? "mid" : "low";
      return `<a href="${esc(name)}.html" class="card"><h3>${esc(name)}</h3><p class="meta">${ctx.stats.total} scenarios</p><p class="meta">Pass rate: <span class="rate ${rc}">${rate}%</span></p></a>`;
    }).join("\n");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forge Living Documentation</title><link rel="stylesheet" href="assets/styles.css"></head>
<body><h1>Forge Living Documentation</h1><p class="meta">Generated at ${esc(data.generatedAt)}</p>
<h2>Global Statistics</h2><div class="stats">
<div class="stat"><div class="label">Total</div><div class="value">${data.globalStats.totalScenarios}</div></div>
<div class="stat"><div class="label">Pass</div><div class="value" style="color:var(--color-pass)">${data.globalStats.pass}</div></div>
<div class="stat"><div class="label">Fail</div><div class="value" style="color:var(--color-fail)">${data.globalStats.fail}</div></div>
<div class="stat"><div class="label">Pending</div><div class="value" style="color:var(--color-pending)">${data.globalStats.pending}</div></div>
</div><h2>Contexts</h2><div class="grid">${cards}</div><footer>Forge Living Documentation</footer></body></html>`;
}

function renderContextPage(ctx, name, generatedAt) {
  const rows = [];
  for (const spec of ctx.specs) {
    for (const s of spec.scenarios) {
      const lr = s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : "—";
      rows.push(`<tr><td>${esc(s.title)}</td><td>${verdictEmoji(s.lastVerdict)} ${s.lastVerdict}</td><td>${esc(lr)}</td><td><a href="${esc(spec.specPath)}#L${s.sourceLine}">${esc(spec.specPath)}</a></td></tr>`);
    }
  }
  const total = ctx.stats.total;
  const rate = total > 0 ? ((ctx.stats.pass / total) * 100).toFixed(0) : "0";
  const rc = +rate >= 80 ? "high" : +rate >= 50 ? "mid" : "low";

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Context: ${esc(name)}</title><link rel="stylesheet" href="assets/styles.css"></head>
<body><a href="index.html" class="back">&larr; Back to index</a><h1>Context: ${esc(name)}</h1><p class="meta">Generated at ${esc(generatedAt)}</p>
<h2>Statistics</h2><div class="stats">
<div class="stat"><div class="label">Total</div><div class="value">${ctx.stats.total}</div></div>
<div class="stat"><div class="label">Pass</div><div class="value" style="color:var(--color-pass)">${ctx.stats.pass}</div></div>
<div class="stat"><div class="label">Fail</div><div class="value" style="color:var(--color-fail)">${ctx.stats.fail}</div></div>
<div class="stat"><div class="label">Pending</div><div class="value" style="color:var(--color-pending)">${ctx.stats.pending}</div></div>
<div class="stat"><div class="label">Pass rate</div><div class="value rate ${rc}">${rate}%</div></div>
</div><h2>Scenarios</h2><table><thead><tr><th>Title</th><th>Verdict</th><th>Last Run</th><th>Spec</th></tr></thead><tbody>${rows.join("\n")}</tbody></table><footer>Forge Living Documentation</footer></body></html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const data = generateData();

fs.mkdirSync(path.join(outputDir, "assets"), { recursive: true });
fs.writeFileSync(path.join(outputDir, "assets", "styles.css"), renderStyles(), "utf-8");
fs.writeFileSync(path.join(outputDir, "index.html"), renderIndexPage(data), "utf-8");

for (const [name, ctx] of data.contexts) {
  // Sanitize context name to prevent path traversal
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  fs.writeFileSync(path.join(outputDir, `${safeName}.html`), renderContextPage(ctx, safeName, data.generatedAt), "utf-8");
}

console.log(`✅ Living doc generated at ${outputDir}/index.html (${data.globalStats.totalScenarios} scenarios)`);
