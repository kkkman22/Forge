import { readdirSync, lstatSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { classify, EXCLUDED_PREFIXES } from "../src/docs-governance/domains.js";

interface BaselineEntry {
  path: string;
  domain: string;
  targetPath: string;
  timestamp: string;
}

function walkMarkdownFiles(rootDir: string): string[] {
  const results: string[] = [];
  const resolvedRoot = resolve(rootDir);
  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      // Skip symlinks to prevent escaping the repo
      const stat = lstatSync(fullPath);
      if (stat.isSymbolicLink()) continue;
      // Verify path stays under rootDir
      if (!resolve(fullPath).startsWith(resolvedRoot)) continue;
      if (entry.name.startsWith(".") && entry.name !== ".tinkerman" && entry.name !== ".kiro" && entry.name !== ".claude") continue;
      const rel = relative(rootDir, fullPath);
      if (EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) continue;
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(".md")) {
        results.push(rel);
      }
    }
  }
  walk(rootDir);
  return results;
}

function generateBaseline(rootDir: string): BaselineEntry[] {
  const files = walkMarkdownFiles(rootDir);
  const timestamp = new Date().toISOString().slice(0, 10);
  return files.map((path) => {
    const domain = classify(path);
    let targetPath = path;
    if (domain === "UNCLASSIFIED") {
      targetPath = "NEEDS_CLASSIFICATION";
    }
    return { path, domain, targetPath, timestamp };
  });
}

function formatBaselineReport(entries: BaselineEntry[]): string {
  const lines = [
    "# Docs Governance Baseline Report",
    "",
    `Generated: ${entries[0]?.timestamp ?? "N/A"}`,
    "",
    "| Path | Domain | Target Path |",
    "|------|--------|-------------|",
  ];
  for (const e of entries) {
    lines.push(`| ${e.path} | ${e.domain} | ${e.targetPath} |`);
  }

  const unclassified = entries.filter((e) => e.domain === "UNCLASSIFIED");
  if (unclassified.length > 0) {
    lines.push("");
    lines.push(`## UNCLASSIFIED (${unclassified.length} files)`);
    for (const u of unclassified) {
      lines.push(`- ${u.path}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

const rootDir = process.cwd();
// Guard: verify we're in a project root
if (!existsSync(join(rootDir, ".tinkerman/config.md")) && !existsSync(join(rootDir, "package.json"))) {
  console.error("Error: not in a project root (no .tinkerman/config.md or package.json found).");
  process.exit(3);
}
const entries = generateBaseline(rootDir);
const report = formatBaselineReport(entries);

writeFileSync("docs-governance-baseline.md", report);

const unclassified = entries.filter((e) => e.domain === "UNCLASSIFIED");
if (unclassified.length > 0) {
  console.error(`UNCLASSIFIED_DOC: ${unclassified.length} files need classification`);
  for (const u of unclassified) {
    console.error(`  ${u.path}`);
  }
  process.exit(1);
}

console.log(`Baseline report generated: ${entries.length} files classified.`);
console.log(`Domains: A=${entries.filter((e) => e.domain === "A").length}, B=${entries.filter((e) => e.domain === "B").length}, C=${entries.filter((e) => e.domain === "C").length}, D=${entries.filter((e) => e.domain === "D").length}`);
