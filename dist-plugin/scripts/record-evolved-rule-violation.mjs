#!/usr/bin/env node
/**
 * Evolved Rules Violation Recorder.
 *
 * Scans recent session artifacts (`.forge/runs/<id>/events.ndjson`,
 * `.forge/progress/*.md`, `.forge/reviews/*.md`) for rule trigger signals
 * and updates `evolved-rules.md` `Last_triggered:` fields accordingly.
 *
 * Invocation:
 *   node scripts/record-evolved-rule-violation.mjs           # update in place
 *   node scripts/record-evolved-rule-violation.mjs --dry-run # report only
 *
 * Exit codes:
 *   0 — success
 *   1 — file read / parse error
 *
 * Called from:
 *   - Stop hook (per-session, via date-based dedupe)
 *   - Optional: CI workflow on merge (to capture main-branch activity)
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
    applyTriggerUpdates,
    DEFAULT_SIGNALS,
    scanForTriggers,
} from "../dist/src/evolved-rules-violations.js";

const RULES_FILE = path.join(process.cwd(), ".forge", "knowledge", "evolved-rules.md");
const RUNS_DIR = path.join(process.cwd(), ".forge", "runs");
const PROGRESS_DIR = path.join(process.cwd(), ".forge", "progress");
const REVIEWS_DIR = path.join(process.cwd(), ".forge", "reviews");

/** Lookback window (days) for session artifacts. Older artifacts are ignored. */
const LOOKBACK_DAYS = 1;

function isoDateToday() {
  return new Date().toISOString().slice(0, 10);
}

function readRecentFiles(dir, lookbackMs) {
  if (!existsSync(dir)) return [];
  const cutoff = Date.now() - lookbackMs;
  const texts = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        // Recurse once (for runs/<id>/events.ndjson)
        texts.push(...readRecentFiles(path.join(dir, entry.name), lookbackMs));
      } else {
        const p = path.join(dir, entry.name);
        try {
          const st = statSync(p);
          if (st.mtimeMs < cutoff) continue;
          texts.push(readFileSync(p, "utf-8"));
        } catch {
          // skip unreadable
        }
      }
    }
  } catch {
    // skip unreadable directory
  }
  return texts;
}

function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!existsSync(RULES_FILE)) {
    console.log("[record-violation] No evolved-rules.md — nothing to update.");
    return 0;
  }

  const lookbackMs = LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const texts = [
    ...readRecentFiles(RUNS_DIR, lookbackMs),
    ...readRecentFiles(PROGRESS_DIR, lookbackMs),
    ...readRecentFiles(REVIEWS_DIR, lookbackMs),
  ];

  if (texts.length === 0) {
    console.log("[record-violation] No recent session artifacts to scan.");
    return 0;
  }

  const combined = texts.join("\n\n");
  const today = isoDateToday();
  const report = scanForTriggers(combined, today, DEFAULT_SIGNALS);

  if (report.triggers.size === 0) {
    console.log("[record-violation] No rule signals detected.");
    return 0;
  }

  console.log(`[record-violation] Detected triggers:`);
  for (const [id, date] of report.triggers) {
    const c = report.counts.get(id) ?? { violations: 0, guards: 0 };
    console.log(`  - ${id} → ${date} (violations: ${c.violations}, guards: ${c.guards})`);
  }

  const content = readFileSync(RULES_FILE, "utf-8");
  const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
  if (!frontmatterMatch) {
    console.error("[record-violation] Could not parse frontmatter");
    return 1;
  }

  const frontmatterBlock = frontmatterMatch[0];
  const body = content.slice(frontmatterBlock.length);
  const newBody = applyTriggerUpdates(body, report);
  const newContent = `${frontmatterBlock}${newBody}`;

  if (!dryRun && newContent !== content) {
    writeFileSync(RULES_FILE, newContent, "utf-8");
    console.log(`[record-violation] Updated ${path.relative(process.cwd(), RULES_FILE)}`);
  } else if (dryRun && newContent !== content) {
    console.log("[record-violation] (--dry-run: no file changes written)");
  }

  return 0;
}

process.exit(main());
