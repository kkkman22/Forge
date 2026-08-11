#!/usr/bin/env tsx
/**
 * build-dogfooding-dashboard.ts — aggregate Forge's self-hosting (dogfooding)
 * behavior KPIs from the existing `.tinkerman/` directory into a static Markdown
 * dashboard.
 *
 * READ-ONLY against `.tinkerman/` — adds no instrumentation, no hooks, no runtime
 * collection. Every KPI has an explicit methodology footnote (numerator/
 * denominator) so the numbers are auditable rather than self-reported.
 *
 * Three KPIs:
 *   1. spec→ship complete chain rate — features with a locked spec + tasks + a
 *      ship marker, over total features.
 *   2. review interception by severity — P0/P1/P2/P3 counts aggregated from
 *      review `severity_counts` YAML frontmatter.
 *   3. replay evidence-chain ratio — sessions with an `evidence_chain` marker,
 *      over total sessions.
 *
 * Usage:
 *   npx tsx scripts/build-dogfooding-dashboard.ts [--output <path>] [--root <path>]
 *   npx tsx scripts/build-dogfooding-dashboard.ts --help
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types (exported for tests)
// ---------------------------------------------------------------------------

export interface SpecChainKpi {
  total: number;
  complete: number;
  rate: number;
  methodology: string;
}

export interface FindingsKpi {
  P0: number;
  P1: number;
  P2: number;
  P3: number;
  reviewCount: number;
  methodology: string;
}

export interface EpisodesKpi {
  total: number;
  withEvidence: number;
  rate: number;
  methodology: string;
}

export interface DashboardKpis {
  specs: SpecChainKpi;
  findings: FindingsKpi;
  episodes: EpisodesKpi;
}

// ---------------------------------------------------------------------------
// scanSpecs [REQ-01]: spec→ship complete chain rate
// ---------------------------------------------------------------------------

const SPEC_METHODOLOGY =
  "complete chain = locked spec (status:locked) + tasks.md + ship marker; rate = complete / total specs";

/**
 * A feature counts as "complete chain" when it has a locked spec (status:
 * "locked" in requirements.md frontmatter) AND a tasks.md AND a matching ship
 * marker file under `.tinkerman/ship/`.
 */
export function scanSpecs(forgeRoot: string): SpecChainKpi {
  const specsDir = join(forgeRoot, "specs");
  const shipDir = join(forgeRoot, "ship");

  if (!existsSync(specsDir)) {
    return { total: 0, complete: 0, rate: 0, methodology: SPEC_METHODOLOGY };
  }

  const shipMarkers = existsSync(shipDir)
    ? new Set(
        readdirSync(shipDir)
          .filter((f) => f.endsWith(".md"))
          .map((f) => f.replace(/\.md$/, "")),
      )
    : new Set<string>();

  const featureDirs = readdirSync(specsDir).filter((name) => {
    const full = join(specsDir, name);
    return (
      !name.startsWith("_") &&
      name !== "INDEX.md" &&
      existsSync(full) &&
      statSync(full).isDirectory()
    );
  });

  let complete = 0;
  for (const name of featureDirs) {
    const reqPath = join(specsDir, name, "requirements.md");
    const tasksPath = join(specsDir, name, "tasks.md");
    const hasTasks = existsSync(tasksPath);
    const fm = existsSync(reqPath) ? parseFrontmatter(readFileSync(reqPath, "utf-8")) : {};
    const hasLockedSpec = fm.status === "locked";
    // Match by feature name prefix (ship markers may be named <feature>-<suffix>.md)
    const hasShip = [...shipMarkers].some(
      (marker) => marker === name || marker.startsWith(`${name}-`),
    );
    if (hasTasks && hasLockedSpec && hasShip) complete += 1;
  }

  const total = featureDirs.length;
  return { total, complete, rate: total > 0 ? complete / total : 0, methodology: SPEC_METHODOLOGY };
}

// ---------------------------------------------------------------------------
// scanFindings [REQ-01]: review interception by severity
// ---------------------------------------------------------------------------

const FINDINGS_METHODOLOGY =
  "aggregated from review severity_counts frontmatter; P0/P1 block ship per §3.3";

/**
 * Aggregates P0/P1/P2/P3 counts from the `severity_counts` YAML frontmatter of
 * review files under `.tinkerman/reviews/`. Reviews may be in subdirectories
 * (e.g. `<runid>/combined.md`) or standalone `.md` files.
 */
export function scanFindings(forgeRoot: string): FindingsKpi {
  const reviewsDir = join(forgeRoot, "reviews");
  if (!existsSync(reviewsDir)) {
    return { P0: 0, P1: 0, P2: 0, P3: 0, reviewCount: 0, methodology: FINDINGS_METHODOLOGY };
  }

  const reviewFiles = collectMarkdownFiles(reviewsDir);
  const totals = { P0: 0, P1: 0, P2: 0, P3: 0 };
  let reviewCount = 0;

  for (const file of reviewFiles) {
    const fm = parseFrontmatter(readFileSync(file, "utf-8"));
    const sc = fm.severity_counts;
    // Only count files that actually declare severity_counts (real reviews)
    if (!sc || typeof sc !== "object") continue;
    reviewCount += 1;
    const counts = sc as Record<string, unknown>;
    for (const key of ["P0", "P1", "P2", "P3"] as const) {
      const val = Number(counts[key] ?? 0);
      totals[key] += Number.isFinite(val) ? val : 0;
    }
  }

  return { ...totals, reviewCount, methodology: FINDINGS_METHODOLOGY };
}

// ---------------------------------------------------------------------------
// scanEpisodes [REQ-01]: replay evidence-chain ratio
// ---------------------------------------------------------------------------

const EPISODE_METHODOLOGY =
  "sessions with evidence_chain:true frontmatter; rate = withEvidence / total sessions";

/**
 * Counts session files under `.tinkerman/knowledge/sessions/` that carry an
 * `evidence_chain: true` marker in their frontmatter.
 */
export function scanEpisodes(forgeRoot: string): EpisodesKpi {
  const sessionsDir = join(forgeRoot, "knowledge", "sessions");
  if (!existsSync(sessionsDir)) {
    return { total: 0, withEvidence: 0, rate: 0, methodology: EPISODE_METHODOLOGY };
  }

  const sessionFiles = collectMarkdownFiles(sessionsDir);
  let withEvidence = 0;
  for (const file of sessionFiles) {
    const fm = parseFrontmatter(readFileSync(file, "utf-8"));
    if (fm.evidence_chain === true) withEvidence += 1;
  }

  const total = sessionFiles.length;
  return {
    total,
    withEvidence,
    rate: total > 0 ? withEvidence / total : 0,
    methodology: EPISODE_METHODOLOGY,
  };
}

// ---------------------------------------------------------------------------
// renderMarkdown [REQ-02, REQ-03]
// ---------------------------------------------------------------------------

export function renderMarkdown(kpis: DashboardKpis): string {
  const lines: string[] = [];
  lines.push("# Forge Dogfooding 仪表盘");
  lines.push("");
  lines.push(`> 生成于 ${new Date().toISOString().slice(0, 10)} · 数据源 .tinkerman/ · 口径见各 KPI 脚注`);
  lines.push("");
  lines.push("## 纪律执行率");
  lines.push("");
  lines.push("| KPI | 数值 | 口径 |");
  lines.push("|-----|------|------|");
  const specCell =
    kpis.specs.total === 0
      ? "无数据"
      : `${kpis.specs.complete}/${kpis.specs.total} (${pct(kpis.specs.rate)})`;
  lines.push(`| spec→ship 完整链路率 | ${specCell} | ${kpis.specs.methodology} |`);
  const epCell =
    kpis.episodes.total === 0
      ? "无数据"
      : `${kpis.episodes.withEvidence}/${kpis.episodes.total} (${pct(kpis.episodes.rate)})`;
  lines.push(`| replay 证据链占比 | ${epCell} | ${kpis.episodes.methodology} |`);
  lines.push("");
  lines.push("## 评审拦截");
  lines.push("");
  lines.push("| 级别 | 数量 | 口径 |");
  lines.push("|------|------|------|");
  if (kpis.findings.reviewCount === 0) {
    lines.push("| 全部 | 无数据 | — |");
  } else {
    lines.push(`| P0 (阻断) | ${kpis.findings.P0} | ${kpis.findings.methodology} |`);
    lines.push(`| P1 (阻断) | ${kpis.findings.P1} | ${kpis.findings.methodology} |`);
    lines.push(`| P2 | ${kpis.findings.P2} | ${kpis.findings.methodology} |`);
    lines.push(`| P3 | ${kpis.findings.P3} | ${kpis.findings.methodology} |`);
    lines.push(`| 评审总数 | ${kpis.findings.reviewCount} | — |`);
  }
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// main / CLI
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const rootIdx = args.indexOf("--root");
  const forgeRoot =
    rootIdx !== -1 && args[rootIdx + 1] ? resolve(args[rootIdx + 1]) : resolve(process.cwd(), ".tinkerman");

  if (!existsSync(forgeRoot)) {
    console.error(`Error: ${forgeRoot} is not a Forge project (.tinkerman/ not found)`);
    process.exit(1);
  }

  const kpis: DashboardKpis = {
    specs: scanSpecs(forgeRoot),
    findings: scanFindings(forgeRoot),
    episodes: scanEpisodes(forgeRoot),
  };

  const md = renderMarkdown(kpis);
  const outIdx = args.indexOf("--output");
  const outPath =
    outIdx !== -1 && args[outIdx + 1]
      ? resolve(args[outIdx + 1])
      : resolve(forgeRoot, "dashboards", "dogfooding.md");

  // Ensure dashboards dir exists
  const outDir = resolve(outPath, "..");
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  writeFileSync(outPath, md);
  console.error(`Dashboard written to ${outPath}`);
  console.error(
    `  spec→ship: ${kpis.specs.complete}/${kpis.specs.total} | ` +
      `findings P0/P1/P2/P3: ${kpis.findings.P0}/${kpis.findings.P1}/${kpis.findings.P2}/${kpis.findings.P3} | ` +
      `evidence-chain: ${kpis.episodes.withEvidence}/${kpis.episodes.total}`,
  );
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/build-dogfooding-dashboard.ts [options]

Aggregate Forge dogfooding behavior KPIs from .tinkerman/ into a static Markdown dashboard.

Options:
  --output <path>   Output file path (default: .tinkerman/dashboards/dogfooding.md)
  --root <path>     Path to .tinkerman/ directory (default: ./.forge)
  --help, -h        Show this help message

Read-only: adds no instrumentation. Every KPI carries a methodology footnote.`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect .md files under a directory. */
function collectMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectMarkdownFiles(full));
    } else if (entry.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Parse a YAML frontmatter block into a flat record. Supports one level of
 * nesting (for `severity_counts:` blocks). Values are best-effort typed.
 */
function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const body = match[1];
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;

  for (const line of body.split("\n")) {
    const topMatch = line.match(/^([a-zA-Z_][\w]*):\s*(.*)$/);
    if (topMatch && !line.startsWith(" ") && !line.startsWith("\t")) {
      const [, key, value] = topMatch;
      if (value === "") {
        currentKey = key;
        result[key] = {};
      } else {
        currentKey = null;
        result[key] = parseScalar(value);
      }
      continue;
    }
    const nestedMatch = line.match(/^\s+([a-zA-Z_][\w]*):\s*(.*)$/);
    if (nestedMatch && currentKey) {
      const [, key, value] = nestedMatch;
      (result[currentKey] as Record<string, unknown>)[key] = parseScalar(value);
    }
  }
  return result;
}

/** Parse a YAML scalar value into number/boolean/string. */
function parseScalar(raw: string): unknown {
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const num = Number(trimmed);
  if (trimmed !== "" && Number.isFinite(num)) return num;
  return trimmed;
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

// Run main when invoked directly (not when imported by tests)
const invokedAs = process.argv[1] ?? "";
if (invokedAs.endsWith("build-dogfooding-dashboard.ts")) {
  main();
}
