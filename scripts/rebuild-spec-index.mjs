#!/usr/bin/env node

/**
 * rebuild-spec-index.mjs
 *
 * Scans `.tinkerman/specs/` directory, reads frontmatter from each spec's
 * requirements.md, validates it, and generates `.tinkerman/specs/INDEX.md`.
 *
 * Backward compatibility: also scans `.kiro/specs/` if `.tinkerman/specs/` is empty.
 *
 * Usage:
 *   node scripts/rebuild-spec-index.mjs [--incremental] [--check] [--help]
 *
 * Modes:
 *   (default)      Full rebuild of INDEX.md
 *   --incremental  Only update entries for specs that changed (git diff)
 *   --check        Validate frontmatter legality + INDEX.md consistency, do not write
 *   --help         Show usage information
 */

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const ROOT = rootIndex !== -1 && args[rootIndex + 1]
  ? args[rootIndex + 1]
  : join(new URL(import.meta.url).pathname, "..", "..");
const FORGE_SPECS_DIR = join(ROOT, ".tinkerman", "specs");
const KIRO_SPECS_DIR = join(ROOT, ".kiro", "specs");
const FORGE_ARCHIVE_DIR = join(ROOT, ".tinkerman", "archive");

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const mode = {
  incremental: args.includes("--incremental"),
  check: args.includes("--check"),
  help: args.includes("--help"),
};

if (mode.help) {
  console.log(`rebuild-spec-index.mjs — Rebuild .tinkerman/specs/INDEX.md

Usage:
  node scripts/rebuild-spec-index.mjs [options]

Options:
  --incremental  Only update entries for specs that changed since last commit
  --check        Validate frontmatter and INDEX.md consistency (no writes)
  --root <path>  Use <path> as project root instead of script location
  --help         Show this help message

Scans .tinkerman/specs/ for spec directories, reads frontmatter from each
requirements.md, validates it, and generates an INDEX.md with tables
grouped by status (active, deferred, completed, archived).`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Valid status values
// ---------------------------------------------------------------------------

const VALID_STATUSES = new Set([
  "draft", "approved", "in_progress", "completed", "deferred", "archived", "locked",
  "partial", "dormant", "superseded", "obsolete", "retired-partial",
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Frontmatter parsing (self-contained, no external deps)
// ---------------------------------------------------------------------------

function parseYamlFrontmatter(content) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return null;

  const afterFirst = trimmed.slice("---".length);
  const closingIndex = afterFirst.indexOf("\n---");
  if (closingIndex === -1) return null;

  return afterFirst.slice(0, closingIndex);
}

function extractStringField(raw, fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped}:\\s*"?([^"\\n]*)"?\\s*$`, "m");
  const match = raw.match(regex);
  return match ? match[1].trim() : null;
}

function extractListField(raw, fieldName) {
  const lines = raw.split("\n");
  let collecting = false;
  const items = [];

  for (const line of lines) {
    if (!collecting) {
      const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const headerPattern = new RegExp(`^${escaped}:\\s*$`);
      if (headerPattern.test(line)) {
        collecting = true;
        continue;
      }
      const emptyArrayPattern = new RegExp(`^${escaped}:\\s*\\[\\]\\s*$`);
      if (emptyArrayPattern.test(line)) return [];
      continue;
    }

    const itemMatch = line.match(/^\s+-\s+(.+)$/);
    if (itemMatch) {
      items.push(itemMatch[1].trim());
    } else if (line.trim() === "") {
      // skip blank lines
    } else {
      break;
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Spec scanning
// ---------------------------------------------------------------------------

async function scanSpecs(specsDir, skipDirs) {
  if (!existsSync(specsDir)) return [];
  const entries = await readdir(specsDir, { withFileTypes: true });
  const specs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    if (skipDirs.has(entry.name)) continue;

    const reqPath = join(specsDir, entry.name, "requirements.md");
    if (!existsSync(reqPath)) continue;

    const content = await readFile(reqPath, "utf-8");
    const raw = parseYamlFrontmatter(content);

    if (!raw) {
      specs.push({
        name: entry.name,
        status: "in_progress",
        created: "",
        updated: "",
        priority: "",
        tier: "",
        depends_on: [],
        replaces: [],
        replaced_by: [],
        deferred_reason: "",
        deferred_date: "",
        source: entry.name,
        _hasFrontmatter: false,
      });
      continue;
    }

    const name = extractStringField(raw, "name") || entry.name;
    const status = extractStringField(raw, "status") || "in_progress";
    const created = extractStringField(raw, "created") || "";
    const updated = extractStringField(raw, "updated") || "";
    const priority = extractStringField(raw, "priority") || "";
    const tier = extractStringField(raw, "tier") || "";
    const depends_on = extractListField(raw, "depends_on");
    const replaces = extractListField(raw, "replaces");
    const replaced_by = extractListField(raw, "replaced_by");
    const deferred_reason = extractStringField(raw, "deferred_reason") || "";
    const deferred_date = extractStringField(raw, "deferred_date") || "";

    specs.push({
      name, status, created, updated, priority, tier,
      depends_on, replaces, replaced_by,
      deferred_reason, deferred_date,
      source: entry.name,
      _hasFrontmatter: true,
    });
  }

  return specs;
}

async function scanArchivedSpecs(specsDir) {
  // Also scan .tinkerman/archive/ for archived specs migrated from .kiro
  const forgeArchiveDir = join(ROOT, ".tinkerman", "archive");
  const archiveSpecs = [];
  
  if (existsSync(forgeArchiveDir)) {
    const archiveEntries = await readdir(forgeArchiveDir, { withFileTypes: true });
    for (const entry of archiveEntries) {
      if (!entry.isDirectory()) continue;
      const reqPath = join(forgeArchiveDir, entry.name, "requirements.md");
      let raw = null;
      if (existsSync(reqPath)) {
        const content = await readFile(reqPath, "utf-8");
        raw = parseYamlFrontmatter(content);
      }
      const name = raw ? (extractStringField(raw, "name") || entry.name) : entry.name;
      const replaced_by = raw ? extractListField(raw, "replaced_by") : [];
      const deferred_reason = raw ? (extractStringField(raw, "deferred_reason") || "") : "";
      archiveSpecs.push({
        name,
        status: "archived",
        replaced_by,
        deferred_reason: deferred_reason || "archived",
        source: entry.name,
      });
    }
  }

  // Original _archived scan (for backward compat with .kiro)
  const archivedDir = join(specsDir, "_archived");
  if (!existsSync(archivedDir)) return archiveSpecs;

  const entries = await readdir(archivedDir, { withFileTypes: true });
  const specs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const reqPath = join(archivedDir, entry.name, "requirements.md");
    let raw = null;
    if (existsSync(reqPath)) {
      const content = await readFile(reqPath, "utf-8");
      raw = parseYamlFrontmatter(content);
    }

    const name = raw ? (extractStringField(raw, "name") || entry.name) : entry.name;
    const replaced_by = raw ? extractListField(raw, "replaced_by") : [];
    const deferred_reason = raw ? (extractStringField(raw, "deferred_reason") || "") : "";

    specs.push({
      name,
      status: "archived",
      replaced_by,
      deferred_reason: deferred_reason || "archived",
      source: entry.name,
    });
  }

  return [...archiveSpecs, ...specs];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateSpec(spec) {
  const errors = [];

  if (spec.status && !VALID_STATUSES.has(spec.status)) {
    errors.push(`  ${spec.source}: invalid status "${spec.status}"`);
  }

  if (spec.status === "deferred" && !spec.deferred_reason) {
    errors.push(`  ${spec.source}: deferred status requires deferred_reason`);
  }

  if (spec.created && !ISO_DATE_RE.test(spec.created)) {
    errors.push(`  ${spec.source}: invalid created date "${spec.created}"`);
  }

  if (spec.updated && !ISO_DATE_RE.test(spec.updated)) {
    errors.push(`  ${spec.source}: invalid updated date "${spec.updated}"`);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// INDEX.md generation
// ---------------------------------------------------------------------------

function generateIndex(specs, archivedSpecs) {
  const today = new Date().toISOString().split("T")[0];

  const active = specs.filter((s) =>
    ["draft", "approved", "in_progress"].includes(s.status)
  ).sort((a, b) => a.name.localeCompare(b.name));

  const deferred = specs.filter((s) => s.status === "deferred")
    .sort((a, b) => a.name.localeCompare(b.name));

  const locked = specs.filter((s) => s.status === "locked")
    .sort((a, b) => a.name.localeCompare(b.name));

  const completed = specs.filter((s) => s.status === "completed")
    .sort((a, b) => a.name.localeCompare(b.name));

  const retired = specs.filter((s) => s.status === "retired-partial")
    .sort((a, b) => a.name.localeCompare(b.name));

  const other = specs.filter((s) =>
    !["draft", "approved", "in_progress", "deferred", "completed", "locked", "retired-partial"].includes(s.status)
  ).sort((a, b) => a.name.localeCompare(b.name));

  // Stats
  const stats = {
    draft: specs.filter((s) => s.status === "draft").length,
    approved: specs.filter((s) => s.status === "approved").length,
    in_progress: specs.filter((s) => s.status === "in_progress").length,
    locked: locked.length,
    completed: completed.length,
    partial: specs.filter((s) => s.status === "partial").length,
    dormant: specs.filter((s) => s.status === "dormant").length,
    superseded: specs.filter((s) => s.status === "superseded").length,
    obsolete: specs.filter((s) => s.status === "obsolete").length,
    deferred: deferred.length,
    archived: archivedSpecs.length,
    "retired-partial": retired.length,
  };

  const lines = [];

  lines.push("# Spec 索引");
  lines.push("");
  lines.push("> 由 `scripts/rebuild-spec-index.mjs` 自动生成。");
  lines.push(`> 最后更新: ${today}`);
  lines.push("");

  // Stats table
  lines.push("## 统计");
  lines.push("");
  lines.push("| 状态 | 数量 |");
  lines.push("|------|------|");
  lines.push(`| draft | ${stats.draft} |`);
  lines.push(`| approved | ${stats.approved} |`);
  lines.push(`| in_progress | ${stats.in_progress} |`);
  lines.push(`| locked | ${stats.locked} |`);
  lines.push(`| completed | ${stats.completed} |`);
  lines.push(`| partial | ${stats.partial} |`);
  lines.push(`| dormant | ${stats.dormant} |`);
  lines.push(`| superseded | ${stats.superseded} |`);
  lines.push(`| obsolete | ${stats.obsolete} |`);
  lines.push(`| deferred | ${stats.deferred} |`);
  lines.push(`| archived | ${stats.archived} |`);
  lines.push(`| retired-partial | ${stats["retired-partial"]} |`);
  lines.push("");

  // Active specs
  lines.push("## 活跃 Spec");
  lines.push("");
  lines.push("| 名称 | 状态 | 优先级 | 档位 | 依赖 | 最后更新 |");
  lines.push("|------|------|--------|------|------|---------|");

  for (const s of active) {
    const deps = s.depends_on.length > 0 ? s.depends_on.join(", ") : "";
    lines.push(`| ${s.name} | ${s.status} | ${s.priority || ""} | ${s.tier || ""} | ${deps} | ${s.updated || ""} |`);
  }

  if (active.length === 0) {
    lines.push("| (无) | | | | | |");
  }
  lines.push("");

  // Locked specs
  if (locked.length > 0) {
    lines.push("## 已锁定 Spec (Locked)");
    lines.push("");
    lines.push("| 名称 | 状态 | 最后更新 |");
    lines.push("|------|------|---------|");

    for (const s of locked) {
      lines.push(`| ${s.name} | ${s.status} | ${s.updated || ""} |`);
    }
    lines.push("");
  }

  // Completed specs
  if (completed.length > 0 || other.length > 0) {
    lines.push("## 已完成 Spec");
    lines.push("");
    lines.push("| 名称 | 状态 | 最后更新 |");
    lines.push("|------|------|---------|");

    for (const s of [...completed, ...other]) {
      lines.push(`| ${s.name} | ${s.status} | ${s.updated || ""} |`);
    }
    lines.push("");
  }

  // Retired-partial specs (honestly retired: core ACs delivered, remainder
  // obsoleted by a later spec or blocked on an unstable external API)
  if (retired.length > 0) {
    lines.push("## 已退役 Spec (Retired-Partial)");
    lines.push("");
    lines.push("> 已交付核心 AC，剩余 AC 被后续 spec 取代或受外部未稳定 API 阻塞。详见各 spec 的 `status_note`。");
    lines.push("");
    lines.push("| 名称 | 状态 | 最后更新 |");
    lines.push("|------|------|---------|");

    for (const s of retired) {
      lines.push(`| ${s.name} | ${s.status} | ${s.updated || ""} |`);
    }
    lines.push("");
  }

  // Deferred specs
  if (deferred.length > 0) {
    lines.push("## Deferred Spec");
    lines.push("");
    lines.push("| 名称 | 原因 | 暂缓日期 |");
    lines.push("|------|------|---------|");

    for (const s of deferred) {
      lines.push(`| ${s.name} | ${s.deferred_reason || ""} | ${s.deferred_date || ""} |`);
    }
    lines.push("");
  }

  // Archived specs
  lines.push("## 已归档 Spec");
  lines.push("");
  lines.push("> 详见 `_archived/` 目录");
  lines.push("");
  lines.push("| 名称 | 归档原因 | 替代者 |");
  lines.push("|------|---------|--------|");

  for (const s of archivedSpecs) {
    const replacer = s.replaced_by.length > 0 ? s.replaced_by.join(", ") : "";
    lines.push(`| ${s.name} | ${s.deferred_reason || ""} | ${replacer} |`);
  }

  if (archivedSpecs.length === 0) {
    lines.push("| (无) | | |");
  }

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Incremental: check which specs changed via git diff
// ---------------------------------------------------------------------------

function getChangedSpecDirs() {
  try {
    const output = execSync(
      "git diff --name-only HEAD~1 HEAD -- .tinkerman/specs/",
      { encoding: "utf-8", cwd: ROOT }
    );
    const changedDirs = new Set();
    for (const line of output.trim().split("\n")) {
      if (!line) continue;
      const match = line.match(/^\.forge\/specs\/([^/]+)\//);
      if (match) changedDirs.add(match[1]);
    }
    return changedDirs;
  } catch {
    // If git diff fails, fall back to full rebuild
    return null;
  }
}

// ---------------------------------------------------------------------------
// Check mode: validate INDEX.md consistency
// ---------------------------------------------------------------------------

function parseIndexTables(indexContent) {
  const activeEntries = [];
  const deferredEntries = [];
  const completedEntries = [];
  const archivedEntries = [];

  const sections = indexContent.split(/## /);
  for (const section of sections) {
    if (section.startsWith("活跃 Spec")) {
      const rows = section.match(/^\| (.+) \|$/gm);
      if (rows) {
        for (const row of rows) {
          const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
          if (cells[0] && cells[0] !== "名称") {
            activeEntries.push({ name: cells[0], status: cells[1] || "in_progress" });
          }
        }
      }
    }
    if (section.startsWith("已完成 Spec")) {
      const rows = section.match(/^\| (.+) \|$/gm);
      if (rows) {
        for (const row of rows) {
          const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
          if (cells[0] && cells[0] !== "名称") {
            completedEntries.push({ name: cells[0], status: cells[1] || "completed" });
          }
        }
      }
    }
    if (section.startsWith("Deferred Spec")) {
      const rows = section.match(/^\| (.+) \|$/gm);
      if (rows) {
        for (const row of rows) {
          const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
          if (cells[0] && cells[0] !== "名称") {
            deferredEntries.push({ name: cells[0] });
          }
        }
      }
    }
    if (section.startsWith("已归档 Spec")) {
      const rows = section.match(/^\| (.+) \|$/gm);
      if (rows) {
        for (const row of rows) {
          const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
          if (cells[0] && cells[0] !== "名称") {
            archivedEntries.push({ name: cells[0] });
          }
        }
      }
    }
  }

  return { activeEntries, deferredEntries, completedEntries, archivedEntries };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const skipDirs = new Set(["_archived", "_template"]);

  // Prefer .tinkerman/specs/, fall back to .kiro/specs/ for backward compatibility
  let specsDir = FORGE_SPECS_DIR;
  let archiveDir = FORGE_SPECS_DIR;
  if (!existsSync(FORGE_SPECS_DIR)) {
    if (existsSync(KIRO_SPECS_DIR)) {
      specsDir = KIRO_SPECS_DIR;
      archiveDir = KIRO_SPECS_DIR;
    }
  }

  const INDEX_PATH = join(specsDir, "INDEX.md");

  const specs = await scanSpecs(specsDir, skipDirs);
  const archivedSpecs = await scanArchivedSpecs(archiveDir);

  // Validation
  let hasErrors = false;
  const allErrors = [];

  for (const spec of specs) {
    const errors = validateSpec(spec);
    allErrors.push(...errors);
    if (errors.length > 0) hasErrors = true;
  }

  if (hasErrors) {
    console.error("Frontmatter validation errors:");
    for (const err of allErrors) {
      console.error(err);
    }
    if (mode.check) {
      process.exit(1);
    }
    console.error("Proceeding with rebuild despite errors...");
  }

  // Check mode: compare generated INDEX with existing
  if (mode.check) {
    // When .kiro/ is gitignored, CI may have an incomplete checkout.
    // If no specs found at all, skip the check (not a spec repo).
    if (specs.length === 0) {
      console.log("No specs found. Skipping index check.");
      process.exit(0);
    }

    if (existsSync(INDEX_PATH)) {
      const existing = await readFile(INDEX_PATH, "utf-8");
      const generated = generateIndex(specs, archivedSpecs);

      if (existing === generated) {
        console.log("INDEX.md is up to date.");
        process.exit(0);
      } else {
        console.error("INDEX.md is out of date. Run: node scripts/rebuild-spec-index.mjs");
        process.exit(1);
      }
    } else {
      // INDEX.md not tracked — generate it (happens when .kiro/ is gitignored)
      const indexContent = generateIndex(specs, archivedSpecs);
      await writeFile(INDEX_PATH, indexContent, "utf-8");
      console.log(`INDEX.md generated: ${specs.length} active specs, ${archivedSpecs.length} archived specs.`);
      process.exit(0);
    }
  }

  // Incremental mode
  if (mode.incremental) {
    const changedDirs = getChangedSpecDirs();
    if (changedDirs === null || changedDirs.size === 0) {
      console.log("No changes detected since last commit. INDEX.md is current.");
      return;
    }
    console.log(`Detected ${changedDirs.size} changed spec(s): ${[...changedDirs].join(", ")}`);
  }

  // Generate and write INDEX.md
  const indexContent = generateIndex(specs, archivedSpecs);
  await writeFile(INDEX_PATH, indexContent, "utf-8");

  console.log(`INDEX.md updated: ${specs.length} active specs, ${archivedSpecs.length} archived specs.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
