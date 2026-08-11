#!/usr/bin/env node
/**
 * cleanup-kiro-specs.mjs — Remove migrated .kiro/specs after verification
 *
 * Usage:
 *   node scripts/cleanup-kiro-specs.mjs [--dry-run]
 *
 * Safety checks:
 *   1. Verify every .kiro/specs/<name>/ exists in .tinkerman/specs/<name>/
 *   2. Verify requirements.md, design.md, tasks.md are present in .tinkerman/
 *   3. Only then delete .kiro/specs/<name>/
 *   4. Keep .kiro/specs/_archived/ intact (optional)
 */

import { readdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(new URL(import.meta.url).pathname, "..", "..");
const KIRO_SPECS_DIR = join(ROOT, ".kiro", "specs");
const FORGE_SPECS_DIR = join(ROOT, ".tinkerman", "specs");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

function log(msg) {
  console.log(`[cleanup] ${msg}`);
}

async function main() {
  log(`Starting cleanup (dry-run: ${DRY_RUN})`);

  const entries = await readdir(KIRO_SPECS_DIR, { withFileTypes: true });
  const activeSpecs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort();

  log(`Found ${activeSpecs.length} active specs in .kiro/specs/`);

  let removed = 0;
  let skipped = 0;
  let errors = [];

  for (const specDir of activeSpecs) {
    const kiroDir = join(KIRO_SPECS_DIR, specDir);
    const forgeDir = join(FORGE_SPECS_DIR, specDir);

    // Safety check 1: .tinkerman/specs/<name>/ must exist
    if (!existsSync(forgeDir)) {
      log(`  SKIP: ${specDir} — not found in .tinkerman/specs/`);
      skipped++;
      continue;
    }

    // Safety check 2: core files must exist in .tinkerman/
    const requiredFiles = ["requirements.md", "design.md", "tasks.md"];
    const missing = requiredFiles.filter((f) => !existsSync(join(forgeDir, f)));
    if (missing.length > 0) {
      log(`  SKIP: ${specDir} — missing in .tinkerman/specs/: ${missing.join(", ")}`);
      skipped++;
      continue;
    }

    // Safety check 3: .tinkerman/ files must be non-empty
    const emptyFiles = [];
    for (const f of requiredFiles) {
      const s = await stat(join(forgeDir, f));
      if (s.size === 0) emptyFiles.push(f);
    }
    if (emptyFiles.length > 0) {
      log(`  SKIP: ${specDir} — empty files in .tinkerman/specs/: ${emptyFiles.join(", ")}`);
      skipped++;
      continue;
    }

    // All checks passed — delete .kiro/specs/<name>/
    if (!DRY_RUN) {
      try {
        await rm(kiroDir, { recursive: true, force: true });
        removed++;
        log(`  REMOVE: ${specDir}`);
      } catch (err) {
        errors.push({ spec: specDir, error: err.message });
        log(`  ERROR: ${specDir} — ${err.message}`);
      }
    } else {
      log(`  WOULD REMOVE: ${specDir}`);
      removed++;
    }
  }

  log("---");
  log(`Cleanup complete:`);
  log(`  Removed: ${removed}`);
  log(`  Skipped: ${skipped}`);
  log(`  Errors: ${errors.length}`);

  if (DRY_RUN) {
    log("\nThis was a DRY RUN. No files were deleted.");
    log("Run without --dry-run to execute removal.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
