#!/usr/bin/env node
/**
 * migrate-kiro-specs.mjs — Migrate .kiro/specs to .tinkerman/specs format
 *
 * Usage:
 *   node scripts/migrate-kiro-specs.mjs [--dry-run] [--batch-size N]
 *
 * Phases:
 *   1. Triage: categorize specs into satisfied/partial/abandoned/archived
 *   2. Archive: move abandoned + _archived specs to .tinkerman/archive/
 *   3. Migrate: rewrite active specs into .tinkerman/specs/<name>/ format
 *   4. Update index
 */

import { readdir, readFile, writeFile, mkdir, cp, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const KIRO_SPECS_DIR = join(ROOT, ".kiro", "specs");
const FORGE_SPECS_DIR = join(ROOT, ".tinkerman", "specs");
const FORGE_ARCHIVE_DIR = join(ROOT, ".tinkerman", "archive", "2026-06-07-kiro-migration");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const BATCH_SIZE = parseInt(args.find((_, i) => args[i - 1] === "--batch-size") || "20", 10);

// Categories from spec-audit-report.md
const ARCHITECTURE_ABANDONED = new Set([
  "multi-platform-support",
  "sdk-driver-decomposition",
  "audit-remediation-v221",
  "branch-lifecycle-enforcement",
  "ship-delivery-unification",
  "loop-skills-fusion",
  "build-goal-replace-loop",
  "phase-advance-hardening",
  "observability-enhancements",
  "structured-observability",
  "v2.4-review-followups",
  "branch-isolation-recommendation",
  "skill-document-optimization",
  "token-budget-compression",
]);

const PARTIAL_SPECS = new Set([
  "docs-governance-system",
  "engineering-governance-hardening",
  "forge-slimming-followups",
  "forge-slimming-plan",
  "i18n-support",
  "sandbox-phased-implementation",
  "workflows-integration",
  "configchange-hook",
  "hook-system-enhancement",
  "archive-transcript-purge",
  "ultrareview-ci-integration",
  "misc-forge-optimization",
  "output-bloat-control",
  "conflict-resolver-hook",
  "failure-sink-trigger-expansion",
  "process-lifecycle-management",
  "resume-phase-coverage",
  "ccbp-inspired-hardening",
  "pms-pack-v1",
  "token-language-optimization",
]);

const DEFERRED_SPECS = {
  "ccbp-hardening-phase2": "已被 frozen-zone-structured-feedback 部分覆盖",
  "ccbp-inspired-hardening": "同上",
  "claude-md-self-evolution": "依赖 Self-Evolution Protocol 成熟度",
  "plan-document-streamlining": "当前 Plan 输出格式可接受",
  "remaining-backlog": "随日常开发自然消化",
  "skill-behavioral-guardrails": "等待 skill 系统稳定",
  "skill-document-optimization": "token-budget-compression 已覆盖核心需求",
  "skills-cross-pollination": "等待 skill 生态成熟",
  "plugin-distribution": "插件生态非近期路线图，Q3 重新评估",
  "plugin-init-experience": "依赖 plugin-distribution",
  "parallel-status-tracking": "agent-teams 普及后再评估",
  "review-comment-bitbucket": "Bitbucket 集成优先级低于 GitHub/GitLab",
};

function log(msg) {
  console.log(`[migrate] ${msg}`);
}

function parseFrontmatter(content) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return { frontmatter: null, body: content };
  const afterFirst = trimmed.slice(3);
  const closingIndex = afterFirst.indexOf("\n---");
  if (closingIndex === -1) return { frontmatter: null, body: content };
  return {
    frontmatter: afterFirst.slice(0, closingIndex).trim(),
    body: afterFirst.slice(closingIndex + 4).trimStart(),
  };
}

function extractField(frontmatter, field) {
  if (!frontmatter) return null;
  const match = frontmatter.match(new RegExp(`^${field}:\\s*"?([^"\\n]*)"?`, "m"));
  return match ? match[1].trim() : null;
}

async function getGitDates(specDir) {
  try {
    const { execSync } = await import("node:child_process");
    const firstCommit = execSync(
      `git log --diff-filter=A --follow --format=%cs -- ".kiro/specs/${specDir}" 2>/dev/null | tail -1`,
      { encoding: "utf-8", cwd: ROOT }
    ).trim();
    const lastCommit = execSync(
      `git log --format=%cs -1 -- ".kiro/specs/${specDir}" 2>/dev/null`,
      { encoding: "utf-8", cwd: ROOT }
    ).trim();
    return { created: firstCommit || "2026-01-01", updated: lastCommit || "2026-01-01" };
  } catch {
    return { created: "2026-01-01", updated: "2026-01-01" };
  }
}

async function readKiroSpec(specDir) {
  const dir = join(KIRO_SPECS_DIR, specDir);
  const files = {};
  for (const name of ["requirements.md", "design.md", "tasks.md", "bugfix.md"]) {
    const path = join(dir, name);
    if (existsSync(path)) {
      files[name] = await readFile(path, "utf-8");
    }
  }
  return files;
}

function determineStatus(specDir, kiroFiles) {
  if (ARCHITECTURE_ABANDONED.has(specDir)) return "archived";
  if (specDir in DEFERRED_SPECS) return "deferred";

  const reqContent = kiroFiles["requirements.md"] || "";
  const { frontmatter } = parseFrontmatter(reqContent);
  const kiroStatus = extractField(frontmatter, "status");

  if (PARTIAL_SPECS.has(specDir)) return "locked";
  if (kiroStatus === "completed") return "locked";
  if (kiroStatus === "draft") return "draft";
  return "locked";
}

function determineTier(specDir) {
  if (specDir.includes("audit") || specDir.includes("security") || specDir.includes("sandbox")) return "full";
  if (specDir.includes("hook") || specDir.includes("infra") || specDir.includes("ci")) return "standard";
  return "light";
}

async function migrateSpec(specDir) {
  const kiroFiles = await readKiroSpec(specDir);
  const status = determineStatus(specDir, kiroFiles);
  const tier = determineTier(specDir);
  const dates = await getGitDates(specDir);
  const deferredReason = DEFERRED_SPECS[specDir];
  const isAbandoned = ARCHITECTURE_ABANDONED.has(specDir);

  const targetDir = isAbandoned
    ? join(FORGE_ARCHIVE_DIR, specDir)
    : join(FORGE_SPECS_DIR, specDir);

  if (!DRY_RUN) {
    await mkdir(targetDir, { recursive: true });
  }

  const results = [];

  // requirements.md
  if (kiroFiles["requirements.md"]) {
    const { frontmatter, body } = parseFrontmatter(kiroFiles["requirements.md"]);
    const healthScore = extractField(frontmatter, "health.score") || "0";
    const healthVerdict = extractField(frontmatter, "health.verdict") || "pending";

    const reqFrontmatter = [
      "---",
      `status: ${status}`,
      `feature: ${specDir}`,
      "layout: requirements",
      `created: ${dates.created}`,
      `tier: ${tier}`,
      `import_source: ".kiro/specs/${specDir}/requirements.md"`,
      "health:",
      `  score: ${healthScore}`,
      `  verdict: "${healthVerdict}"`,
    ];

    if (deferredReason) {
      reqFrontmatter.push(`deferred_reason: "${deferredReason}"`);
      reqFrontmatter.push('deferred_date: "2026-05-29"');
    }
    if (isAbandoned) {
      reqFrontmatter.push('superseded_by: "architecture-refactor-d73f51f2"');
      reqFrontmatter.push('archive_date: "2026-06-07"');
    }
    if (PARTIAL_SPECS.has(specDir)) {
      reqFrontmatter.push('partial_satisfaction: true');
      reqFrontmatter.push(`gap_ref: ".tinkerman/docs/partial-spec-satisfaction.md#${specDir}"`);
    }

    reqFrontmatter.push("---");
    reqFrontmatter.push("");

    const reqContent = reqFrontmatter.join("\n") + body;
    const reqPath = join(targetDir, "requirements.md");
    if (!DRY_RUN) await writeFile(reqPath, reqContent);
    results.push(`requirements.md`);
  }

  // design.md
  if (kiroFiles["design.md"]) {
    const { body } = parseFrontmatter(kiroFiles["design.md"]);
    const designFrontmatter = [
      "---",
      `status: ${status}`,
      `feature: ${specDir}`,
      "layout: design",
      `created: ${dates.created}`,
      "---",
      "",
    ].join("\n");
    const designPath = join(targetDir, "design.md");
    if (!DRY_RUN) await writeFile(designPath, designFrontmatter + body);
    results.push(`design.md`);
  }

  // tasks.md
  if (kiroFiles["tasks.md"]) {
    const { frontmatter, body } = parseFrontmatter(kiroFiles["tasks.md"]);
    const format = extractField(frontmatter, "format") || "standard";
    const monolith = extractField(frontmatter, "monolith_acknowledged") || "false";

    const tasksFrontmatter = [
      "---",
      `status: ${status === "locked" ? "approved" : status === "draft" ? "pending" : "approved"}`,
      `feature: ${specDir}`,
      "layout: tasks",
      `created: ${dates.created}`,
      `spec_ref: ".tinkerman/specs/${specDir}/requirements.md"`,
      `format: ${format}`,
      `monolith_acknowledged: ${monolith}`,
      "---",
      "",
    ].join("\n");
    const tasksPath = join(targetDir, "tasks.md");
    if (!DRY_RUN) await writeFile(tasksPath, tasksFrontmatter + body);
    results.push(`tasks.md`);
  }

  // bugfix.md -> bugfix.md (if exists)
  if (kiroFiles["bugfix.md"]) {
    const bugfixPath = join(targetDir, "bugfix.md");
    if (!DRY_RUN) await writeFile(bugfixPath, kiroFiles["bugfix.md"]);
    results.push(`bugfix.md`);
  }

  // Copy .config.kiro if exists (for reference)
  const configKiroPath = join(KIRO_SPECS_DIR, specDir, ".config.kiro");
  if (existsSync(configKiroPath)) {
    const targetConfigPath = join(targetDir, ".config.kiro");
    if (!DRY_RUN) await cp(configKiroPath, targetConfigPath);
    results.push(`.config.kiro`);
  }

  return { targetDir, results, status, isAbandoned };
}

async function archiveOriginal(specDir) {
  const archiveDir = join(ROOT, ".kiro", "specs", "_archived", specDir);
  const originalDir = join(KIRO_SPECS_DIR, specDir);

  if (specDir.startsWith("_")) return; // Already archived

  if (!DRY_RUN) {
    await mkdir(dirname(archiveDir), { recursive: true });
    if (existsSync(archiveDir)) {
      await rm(archiveDir, { recursive: true, force: true });
    }
    // Move to archived
    await cp(originalDir, archiveDir, { recursive: true, force: true });
    await rm(originalDir, { recursive: true, force: true });
  }
}

async function main() {
  log(`Starting migration (dry-run: ${DRY_RUN}, batch-size: ${BATCH_SIZE})`);

  // Ensure directories exist
  if (!DRY_RUN) {
    await mkdir(FORGE_SPECS_DIR, { recursive: true });
    await mkdir(FORGE_ARCHIVE_DIR, { recursive: true });
  }

  // Read all active specs
  const entries = await readdir(KIRO_SPECS_DIR, { withFileTypes: true });
  const activeSpecs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort();

  // Also handle _archived specs
  const archivedEntries = await readdir(join(KIRO_SPECS_DIR, "_archived"), { withFileTypes: true });
  const archivedSpecs = archivedEntries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  log(`Found ${activeSpecs.length} active specs, ${archivedSpecs.length} archived specs`);

  const stats = { migrated: 0, archived: 0, skipped: 0, errors: [] };

  // Process active specs in batches
  for (let i = 0; i < activeSpecs.length; i += BATCH_SIZE) {
    const batch = activeSpecs.slice(i, i + BATCH_SIZE);
    log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(activeSpecs.length / BATCH_SIZE)}: ${batch.join(", ")}`);

    for (const specDir of batch) {
      try {
        const forgeSpecDir = join(FORGE_SPECS_DIR, specDir);
        if (existsSync(forgeSpecDir)) {
          log(`  SKIP: ${specDir} already exists in .tinkerman/specs/`);
          stats.skipped++;
          continue;
        }

        const result = await migrateSpec(specDir);
        log(`  ${result.isAbandoned ? "ARCHIVE" : "MIGRATE"}: ${specDir} → ${result.targetDir} (${result.results.join(", ")})`);
        stats.migrated++;

        if (!DRY_RUN && result.isAbandoned) {
          await archiveOriginal(specDir);
        }
      } catch (err) {
        log(`  ERROR: ${specDir} — ${err.message}`);
        stats.errors.push({ spec: specDir, error: err.message });
      }
    }
  }

  // Process archived specs
  for (const specDir of archivedSpecs) {
    try {
      const archiveTarget = join(FORGE_ARCHIVE_DIR, specDir);
      if (existsSync(archiveTarget)) {
        log(`  SKIP archived: ${specDir} already exists`);
        continue;
      }
      if (!DRY_RUN) {
        await mkdir(archiveTarget, { recursive: true });
        const originalDir = join(KIRO_SPECS_DIR, "_archived", specDir);
        await cp(originalDir, archiveTarget, { recursive: true, force: true });
      }
      log(`  ARCHIVE: _archived/${specDir} → ${archiveTarget}`);
      stats.archived++;
    } catch (err) {
      log(`  ERROR archived: ${specDir} — ${err.message}`);
      stats.errors.push({ spec: `_archived/${specDir}`, error: err.message });
    }
  }

  log("---");
  log(`Migration complete:`);
  log(`  Migrated: ${stats.migrated}`);
  log(`  Archived: ${stats.archived}`);
  log(`  Skipped: ${stats.skipped}`);
  log(`  Errors: ${stats.errors.length}`);
  if (stats.errors.length > 0) {
    for (const e of stats.errors) {
      log(`    - ${e.spec}: ${e.error}`);
    }
  }

  if (DRY_RUN) {
    log("\nThis was a DRY RUN. No files were written.");
    log("Run without --dry-run to execute.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
