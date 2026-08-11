#!/usr/bin/env node

/**
 * audit-archive-candidates.mjs
 *
 * Audits .tinkerman/plans/ and .tinkerman/specs/ to determine which entries
 * correspond to shipped features and can be archived.
 *
 * Usage:
 *   node scripts/audit-archive-candidates.mjs [--dry-run] [--fix-refs]
 *
 * Modes:
 *   --dry-run   Print audit table without moving files
 *   --fix-refs  Scan docs/, README.md, .tinkerman/features/ for references
 *               to archived paths and update them
 *   (default)   Execute moves + write audit log
 */

import { readdir, readFile, writeFile, mkdir, rename, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ROOT = join(new URL(import.meta.url).pathname, "..", "..");
const FORGE_DIR = join(ROOT, ".tinkerman");
const PLANS_DIR = join(FORGE_DIR, "plans");
const SPECS_DIR = join(FORGE_DIR, "specs");
const PROGRESS_DIR = join(FORGE_DIR, "progress");
const STATUS_FILE = join(FORGE_DIR, "status.md");
const ROADMAP_FILE = join(ROOT, "ROADMAP.md");
const CHANGELOG_FILE = join(ROOT, "CHANGELOG.md");
const ARCHIVE_DIR = join(FORGE_DIR, "archive");

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const FIX_REFS = argv.includes("--fix-refs");

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function today() {
  return new Date().toISOString().slice(0, 10);
}

function slugFromName(name) {
  // "foo-bar.md" -> "foo-bar", "foo-bar" -> "foo-bar"
  return name.replace(/\.md$/, "");
}

async function readText(filePath) {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

async function readDirSafe(dirPath) {
  try {
    return await readdir(dirPath);
  } catch {
    return [];
  }
}

async function isDirectory(path) {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path) {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Spec lock detection
// ---------------------------------------------------------------------------

async function getSpecLockStatus(entryPath, entryType) {
  // entryType: "spec-dir" | "plan-file"
  if (entryType === "spec-dir") {
    const specFile = join(entryPath, "spec.md");
    const content = await readText(specFile);
    const statusMatch = content.match(/^status:\s*(\S+)/m);
    return statusMatch ? statusMatch[1] === "locked" : false;
  }
  // plan files have a status too, but lock semantics only apply to specs
  return false;
}

// ---------------------------------------------------------------------------
// Evidence collection
// ---------------------------------------------------------------------------

async function collectEvidence(slug, roadmapContent, changelogContent) {
  const evidence = {
    in_roadmap_shipped: false,
    in_changelog: false,
    in_active_progress: false,
    in_status_current: false,
  };

  // 1. ROADMAP.md — look for shipped markers mentioning the slug
  const slugPattern = new RegExp(slug.replace(/[-]/g, "[-\\s]"), "i");
  const shippedMarkers = /[✅]|已完成|shipped|completed/i;
  for (const line of roadmapContent.split("\n")) {
    if (slugPattern.test(line) && shippedMarkers.test(line)) {
      evidence.in_roadmap_shipped = true;
      break;
    }
  }

  // 2. CHANGELOG.md
  if (slugPattern.test(changelogContent)) {
    evidence.in_changelog = true;
  }

  // 3. .tinkerman/progress/ — check for files referencing this entry
  const progressFiles = await readDirSafe(PROGRESS_DIR);
  for (const pf of progressFiles) {
    if (!pf.endsWith(".md")) continue;
    const content = await readText(join(PROGRESS_DIR, pf));
    if (content.includes(slug)) {
      evidence.in_active_progress = true;
      break;
    }
  }

  // 4. .tinkerman/status.md current_task field
  const statusContent = await readText(STATUS_FILE);
  const currentTaskMatch = statusContent.match(/^current_task:\s*["']?(.+?)["']?\s*$/m);
  if (currentTaskMatch && currentTaskMatch[1].includes(slug)) {
    evidence.in_status_current = true;
  }

  return evidence;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function classify(evidence) {
  if (evidence.in_active_progress || evidence.in_status_current) {
    return "active";
  }
  if (evidence.in_roadmap_shipped && evidence.in_changelog) {
    return "shipped";
  }
  return "ambiguous";
}

// ---------------------------------------------------------------------------
// Entry discovery
// ---------------------------------------------------------------------------

async function discoverEntries() {
  const entries = []; // { type, name, slug, fullPath }

  // Plans: files (.md) directly in plans/
  const planItems = await readDirSafe(PLANS_DIR);
  for (const item of planItems) {
    if (!item.endsWith(".md")) continue;
    const fullPath = join(PLANS_DIR, item);
    if (!(await isFile(fullPath))) continue;
    entries.push({
      type: "plan-file",
      name: item,
      slug: slugFromName(item),
      fullPath,
    });
  }

  // Specs: directories containing spec.md, or standalone .md files
  const specItems = await readDirSafe(SPECS_DIR);
  for (const item of specItems) {
    const fullPath = join(SPECS_DIR, item);
    if (await isDirectory(fullPath)) {
      // Spec directory — must contain spec.md
      if (existsSync(join(fullPath, "spec.md"))) {
        entries.push({
          type: "spec-dir",
          name: item,
          slug: slugFromName(item),
          fullPath,
        });
      }
    } else if (item.endsWith(".md") && (await isFile(fullPath))) {
      entries.push({
        type: "spec-file",
        name: item,
        slug: slugFromName(item),
        fullPath,
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Archive actions
// ---------------------------------------------------------------------------

async function moveEntry(entry, dateStr) {
  const archiveName = `${dateStr}-${entry.slug}`;
  const dest = join(ARCHIVE_DIR, archiveName);

  if (existsSync(dest)) {
    return { ok: false, error: "target_exists", dest };
  }

  await mkdir(dest, { recursive: true });

  if (entry.type === "spec-dir") {
    // Move entire directory into archive
    const innerDest = join(dest, "specs");
    await mkdir(innerDest, { recursive: true });
    const targetDir = join(innerDest, entry.name);
    await rename(entry.fullPath, targetDir);
  } else if (entry.type === "plan-file") {
    const innerDest = join(dest, "plans");
    await mkdir(innerDest, { recursive: true });
    await rename(entry.fullPath, join(innerDest, entry.name));
  } else if (entry.type === "spec-file") {
    const innerDest = join(dest, "specs");
    await mkdir(innerDest, { recursive: true });
    await rename(entry.fullPath, join(innerDest, entry.name));
  }

  return { ok: true, dest };
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

async function writeAuditLog(results, dateStr) {
  await mkdir(ARCHIVE_DIR, { recursive: true });
  const logPath = join(ARCHIVE_DIR, `.audit-${dateStr}.md`);

  const header = [
    `# Archive Audit — ${dateStr}`,
    "",
    "| Path | Status | Evidence | Action |",
    "|------|--------|----------|--------|",
  ];

  const rows = results.map((r) => {
    const evidenceParts = [];
    if (r.evidence.in_roadmap_shipped) evidenceParts.push("roadmap:shipped");
    if (r.evidence.in_changelog) evidenceParts.push("changelog");
    if (r.evidence.in_active_progress) evidenceParts.push("progress:active");
    if (r.evidence.in_status_current) evidenceParts.push("status:current");
    const evidenceStr = evidenceParts.length > 0 ? evidenceParts.join(", ") : "none";

    let action;
    switch (r.status) {
      case "shipped":
        action = r.moveResult?.ok ? `moved to ${r.moveResult.dest}` : (r.moveResult?.error === "target_exists" ? "skipped (target exists)" : "dry-run");
        break;
      case "active":
        action = "kept (active)";
        break;
      case "ambiguous":
        action = "kept (ambiguous)";
        break;
      default:
        action = "unknown";
    }

    return `| ${r.relPath} | ${r.status} | ${evidenceStr} | ${action} |`;
  });

  const content = [...header, ...rows, ""].join("\n");
  await writeFile(logPath, content, "utf-8");
  return logPath;
}

// ---------------------------------------------------------------------------
// Pending file for ambiguous entries
// ---------------------------------------------------------------------------

async function writePendingFile(ambiguousEntries) {
  if (ambiguousEntries.length === 0) return;

  await mkdir(ARCHIVE_DIR, { recursive: true });
  const pendingPath = join(ARCHIVE_DIR, ".audit-pending.md");

  const existing = await readText(pendingPath);
  const existingSlugs = new Set(
    existing.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.replace(/^- /, "").trim())
  );

  const lines = ["# Ambiguous entries — requires manual review", ""];
  for (const entry of ambiguousEntries) {
    if (existingSlugs.has(entry.slug)) continue;
    lines.push(`- ${entry.slug} (from ${entry.relPath})`);
  }

  if (lines.length <= 2) return; // no new entries

  const newContent = existing
    ? existing.trimEnd() + "\n" + lines.slice(2).join("\n") + "\n"
    : lines.join("\n") + "\n";

  await writeFile(pendingPath, newContent, "utf-8");
}

// ---------------------------------------------------------------------------
// Cross-reference update (--fix-refs)
// ---------------------------------------------------------------------------

async function updateCrossReferences(archivedEntries, dateStr) {
  if (!FIX_REFS || archivedEntries.length === 0) return;

  const scanDirs = [
    join(ROOT, "docs"),
    join(ROOT, ".tinkerman", "features"),
  ];
  const scanFiles = [join(ROOT, "README.md")];

  // Build replacement map: old path fragment -> new path fragment
  const replacements = [];
  for (const entry of archivedEntries) {
    const archiveName = `${dateStr}-${entry.slug}`;
    if (entry.type === "spec-dir" || entry.type === "spec-file") {
      replacements.push({
        from: `.tinkerman/specs/${entry.name}`,
        to: `.tinkerman/archive/${archiveName}/specs/${entry.name}`,
      });
    }
    if (entry.type === "plan-file") {
      replacements.push({
        from: `.tinkerman/plans/${entry.name}`,
        to: `.tinkerman/archive/${archiveName}/plans/${entry.name}`,
      });
    }
  }

  async function processFile(filePath) {
    let content = await readText(filePath);
    if (!content) return 0;

    let changed = false;
    for (const { from, to } of replacements) {
      if (content.includes(from)) {
        content = content.replaceAll(from, to);
        changed = true;
      }
    }

    if (changed) {
      await writeFile(filePath, content, "utf-8");
      return 1;
    }
    return 0;
  }

  let updatedCount = 0;

  // Process standalone files
  for (const f of scanFiles) {
    if (existsSync(f)) {
      updatedCount += await processFile(f);
    }
  }

  // Process files in scan directories (non-recursive for safety)
  for (const dir of scanDirs) {
    const items = await readDirSafe(dir);
    for (const item of items) {
      if (!item.endsWith(".md")) continue;
      const fullPath = join(dir, item);
      if (await isFile(fullPath)) {
        updatedCount += await processFile(fullPath);
      }
    }
  }

  if (updatedCount > 0) {
    console.log(`\nUpdated ${updatedCount} file(s) with cross-reference fixes.`);
  }
}

// ---------------------------------------------------------------------------
// Dry-run table display
// ---------------------------------------------------------------------------

function printDryRunTable(results) {
  console.log("\n=== Audit Table (dry-run) ===\n");

  // Column widths
  const colPath = 45;
  const colStatus = 12;
  const colEvidence = 40;
  const colAction = 20;

  const header = [
    "Path".padEnd(colPath),
    "Status".padEnd(colStatus),
    "Evidence".padEnd(colEvidence),
    "Action".padEnd(colAction),
  ].join(" | ");

  const separator = "-".repeat(header.length);

  console.log(header);
  console.log(separator);

  for (const r of results) {
    const evidenceParts = [];
    if (r.evidence.in_roadmap_shipped) evidenceParts.push("roadmap:shipped");
    if (r.evidence.in_changelog) evidenceParts.push("changelog");
    if (r.evidence.in_active_progress) evidenceParts.push("progress:active");
    if (r.evidence.in_status_current) evidenceParts.push("status:current");
    const evidenceStr = evidenceParts.length > 0 ? evidenceParts.join(", ") : "none";

    let action;
    switch (r.status) {
      case "shipped":
        action = "would archive";
        break;
      case "active":
        action = "keep (active)";
        break;
      case "ambiguous":
        action = "keep (ambiguous)";
        break;
      default:
        action = "unknown";
    }

    const row = [
      r.relPath.padEnd(colPath),
      r.status.padEnd(colStatus),
      evidenceStr.padEnd(colEvidence),
      action.padEnd(colAction),
    ].join(" | ");

    console.log(row);
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dateStr = today();

  console.log(`Forge Archive Audit — ${dateStr}`);
  if (DRY_RUN) console.log("Mode: dry-run (no files will be moved)");
  if (FIX_REFS) console.log("Mode: fix-refs enabled");

  // Read cross-reference sources once
  const roadmapContent = await readText(ROADMAP_FILE);
  const changelogContent = await readText(CHANGELOG_FILE);

  // Discover all plan/spec entries
  const entries = await discoverEntries();
  console.log(`\nFound ${entries.length} entries to audit.\n`);

  const results = [];
  const shippedToArchive = [];
  const ambiguousEntries = [];

  for (const entry of entries) {
    const evidence = await collectEvidence(entry.slug, roadmapContent, changelogContent);
    const status = classify(evidence);
    const relPath = entry.fullPath.replace(ROOT + "/", "");

    // Check spec lock for spec directories
    if (entry.type === "spec-dir") {
      const locked = await getSpecLockStatus(entry.fullPath, entry.type);
      if (locked && status === "shipped") {
        // Skip locked specs — treat as ambiguous
        results.push({ entry, relPath, evidence, status: "ambiguous", moveResult: null });
        ambiguousEntries.push(entry);
        console.log(`  [SKIP] ${relPath} — spec locked, treating as ambiguous`);
        continue;
      }
    }

    let moveResult = null;

    if (status === "shipped") {
      if (DRY_RUN) {
        console.log(`  [SHIPPED] ${relPath} — would archive`);
        moveResult = { ok: null, dryRun: true };
      } else {
        moveResult = await moveEntry(entry, dateStr);
        if (moveResult.ok) {
          console.log(`  [ARCHIVED] ${relPath} -> ${moveResult.dest.replace(ROOT + "/", "")}`);
        } else {
          console.log(`  [ERROR] ${relPath} — ${moveResult.error}`);
        }
      }
      shippedToArchive.push(entry);
    } else if (status === "active") {
      console.log(`  [ACTIVE] ${relPath}`);
    } else {
      console.log(`  [AMBIGUOUS] ${relPath}`);
      ambiguousEntries.push(entry);
    }

    results.push({ entry, relPath, evidence, status, moveResult });
  }

  // Summary counts
  const counts = { shipped: 0, active: 0, ambiguous: 0 };
  for (const r of results) counts[r.status]++;
  console.log(`\nSummary: ${counts.shipped} shipped, ${counts.active} active, ${counts.ambiguous} ambiguous`);

  if (DRY_RUN) {
    printDryRunTable(results);
    console.log("Dry-run complete. No files were moved.");
    return;
  }

  // Write audit log
  const logPath = await writeAuditLog(results, dateStr);
  console.log(`\nAudit log: ${logPath.replace(ROOT + "/", "")}`);

  // Write pending file for ambiguous entries
  if (ambiguousEntries.length > 0) {
    await writePendingFile(ambiguousEntries);
    console.log(`Ambiguous entries recorded in .tinkerman/archive/.audit-pending.md`);
  }

  // Cross-reference update
  if (FIX_REFS && shippedToArchive.length > 0) {
    await updateCrossReferences(shippedToArchive, dateStr);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
