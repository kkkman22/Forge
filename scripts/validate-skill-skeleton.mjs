#!/usr/bin/env node
// category: user-facing
// ============================================================================
// validate-skill-skeleton.mjs — SKILL.md section skeleton validator
//
// Scans skills/tinkerman-*/SKILL.md for required sections:
//   1. ## N. Prerequisites
//   2. ## N. Deliverable
//
// Exemptions:
//   - skeleton_exempt_legacy: true → warning only (existing skills)
//   - deliverable_exempt: true → skip Deliverable check
//
// Rules mirrored from src/skill-skeleton.ts, inline implementation.
//
// Usage:
//   node scripts/validate-skill-skeleton.mjs
//
// Exit code:
//   0  All non-exempt skills pass skeleton validation
//   1  At least one non-exempt skill fails
// ============================================================================

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: scripts/validate-skill-skeleton.mjs

Validate SKILL.md section skeleton (Prerequisites + Deliverable).
Legacy skills with skeleton_exempt_legacy are warned but not blocked.
deliverable_exempt skills skip the Deliverable check.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Frontmatter parsing (mirrors src/frontmatter.ts)
// ---------------------------------------------------------------------------

const DELIM = "---";

function parseFrontmatter(content) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith(DELIM)) return null;
  const afterFirst = trimmed.slice(DELIM.length);
  const closingIndex = afterFirst.indexOf(`\n${DELIM}`);
  if (closingIndex === -1) return null;
  return { raw: afterFirst.slice(0, closingIndex) };
}

function extractStringField(raw, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped}:\\s*"?([^"\\n]*)"?\\s*$`, "m");
  const m = raw.match(regex);
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Skeleton check (mirrors src/skill-skeleton.ts)
// ---------------------------------------------------------------------------

const PREREQUISITES_RE = /^##\s+\d+\.\s*Prerequisites/m;
const DELIVERABLE_RE = /^##\s+\d+\.\s*Deliverable/m;

function checkSkeleton(filePath, content) {
  const fm = parseFrontmatter(content);
  const deliverableExempt = fm !== null && extractStringField(fm.raw, "deliverable_exempt") === "true";
  const legacyExempt = fm !== null && extractStringField(fm.raw, "skeleton_exempt_legacy") === "true";

  const hasPrerequisites = PREREQUISITES_RE.test(content);
  const hasDeliverable = DELIVERABLE_RE.test(content);

  const errors = [];
  const warnings = [];

  if (!hasPrerequisites) {
    if (legacyExempt) warnings.push("缺少 ## Prerequisites 章节 [legacy]");
    else errors.push("缺少 ## Prerequisites 章节");
  }

  if (!hasDeliverable && !deliverableExempt) {
    if (legacyExempt) warnings.push("缺少 ## Deliverable 章节 [legacy]");
    else errors.push("缺少 ## Deliverable 章节");
  }

  const valid = legacyExempt || errors.length === 0;

  return { filePath, hasPrerequisites, hasDeliverable, deliverableExempt, legacyExempt, valid, errors, warnings };
}

// ---------------------------------------------------------------------------
// File scanning
// ---------------------------------------------------------------------------

function listSkillFiles(skillsDir) {
  const entries = readdirSync(skillsDir);
  const results = [];
  for (const name of entries) {
    if (!name.startsWith("forge-")) continue;
    const subdir = join(skillsDir, name);
    let st;
    try { st = statSync(subdir); } catch { continue; }
    if (!st.isDirectory()) continue;
    const skillPath = join(subdir, "SKILL.md");
    try { if (statSync(skillPath).isFile()) results.push(skillPath); } catch { /* skip */ }
  }
  return results.sort();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const rootDir = resolve(__dirname, "..");
  const skillsDir = join(rootDir, "skills");

  const paths = listSkillFiles(skillsDir);
  const results = paths.map((p) => checkSkeleton(p, readFileSync(p, "utf8")));

  console.log("SKILL Skeleton Check");
  console.log("====================");

  let failed = 0;
  let warned = 0;
  for (const r of results) {
    const rel = r.filePath.slice(rootDir.length + 1);
    const legacy = r.legacyExempt ? " [legacy]" : "";
    const exempt = r.deliverableExempt ? " [deliverable-exempt]" : "";

    if (r.valid && r.warnings.length === 0) {
      console.log(`✓ ${rel}${legacy}${exempt}`);
    } else if (r.valid && r.warnings.length > 0) {
      warned++;
      console.log(`⚠ ${rel}${legacy}${exempt}`);
      for (const w of r.warnings) console.log(`    [warning] ${w}`);
    } else {
      failed++;
      console.log(`✗ ${rel}${legacy}${exempt}`);
      for (const e of r.errors) console.log(`    - ${e}`);
      for (const w of r.warnings) console.log(`    [warning] ${w}`);
    }
  }

  console.log("");
  console.log(`Summary: ${results.length - failed - warned}/${results.length} passed, ${warned} warnings, ${failed} failed`);

  if (failed > 0) {
    console.log("");
    console.log(`FAIL: ${failed} skill(s) missing required skeleton sections.`);
    process.exit(1);
  }
  console.log("All skill skeletons valid ✓");
  process.exit(0);
}

main();
