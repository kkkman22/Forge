#!/usr/bin/env node
/**
 * Stale Evolved Rules Flagger.
 *
 * Scans `.tinkerman/knowledge/evolved-rules.md` for rules that have not been
 * triggered for >= 5 sessions (where "session" = a directory under
 * `.tinkerman/runs/` with mtime later than the rule's `Last_triggered` date).
 *
 * Updates the frontmatter `stale_flags:` list accordingly.
 *
 * Invocation:
 *   node scripts/flag-stale-evolved-rules.mjs            # update in place
 *   node scripts/flag-stale-evolved-rules.mjs --dry-run  # report only
 *
 * Exit codes:
 *   0 — success (whether or not rules were flagged)
 *   1 — file read / parse error
 *
 * Called from:
 *   - Stop hook (weekly cadence, via date-based dedupe)
 *   - CI (--dry-run mode, reports drift only, does not fail)
 *   - /tinkerman learn (checks stale_flags and prompts user for retirement)
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
    evaluateStaleness,
    parseRules,
    writeStaleFlagsToFrontmatter,
} from "../dist/src/evolved-rules-staleness.js";

const RULES_FILE = path.join(process.cwd(), ".tinkerman", "knowledge", "evolved-rules.md");
const RUNS_DIR = path.join(process.cwd(), ".tinkerman", "runs");

function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!existsSync(RULES_FILE)) {
    console.log("[flag-stale] No evolved-rules.md — nothing to check.");
    return 0;
  }

  const content = readFileSync(RULES_FILE, "utf-8");
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    console.error("[flag-stale] Could not parse frontmatter");
    return 1;
  }

  const [, frontmatter, body] = frontmatterMatch;
  const rules = parseRules(body);

  // Collect mtimes of all subdirs under .tinkerman/runs/
  const runDirMtimes = [];
  if (existsSync(RUNS_DIR)) {
    try {
      for (const name of readdirSync(RUNS_DIR)) {
        const p = path.join(RUNS_DIR, name);
        try {
          const st = statSync(p);
          if (st.isDirectory()) runDirMtimes.push(st.mtimeMs);
        } catch {
          // skip unreadable entries
        }
      }
    } catch {
      // runs dir unreadable — proceed with empty mtimes
    }
  }

  const verdicts = evaluateStaleness(rules, runDirMtimes);
  const staleIds = verdicts.filter((v) => v.stale).map((v) => v.id);

  const newFrontmatter = writeStaleFlagsToFrontmatter(frontmatter, staleIds);
  const newContent = `---\n${newFrontmatter}\n---\n${body}`;

  if (staleIds.length > 0) {
    console.log(`[flag-stale] ${staleIds.length} stale rule(s) flagged: ${staleIds.join(", ")}`);
    for (const v of verdicts) {
      if (v.stale) {
        console.log(
          `  - ${v.id} "${v.title}" — last triggered ${v.lastTriggered} (${v.sessionsElapsed} sessions ago)`,
        );
      }
    }
  } else {
    console.log("[flag-stale] No stale rules.");
  }

  if (!dryRun && newContent !== content) {
    writeFileSync(RULES_FILE, newContent, "utf-8");
    console.log(`[flag-stale] Updated ${path.relative(process.cwd(), RULES_FILE)}`);
  } else if (dryRun && newContent !== content) {
    console.log("[flag-stale] (--dry-run: no file changes written)");
  }

  return 0;
}

process.exit(main());
