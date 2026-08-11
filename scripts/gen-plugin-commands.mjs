#!/usr/bin/env node

// Single-entry mode: Forge only exposes /tinkerman as user-facing slash command.
// This script validates downstream count declarations and no longer generates
// wrapper command files (commands/forge-<sub>.md).
// Usage:
//   node scripts/gen-plugin-commands.mjs [--dry-run]
//   node scripts/gen-plugin-commands.mjs --verify-count
//   node scripts/gen-plugin-commands.mjs --stamp-count --allow-stamp

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from "fs";
import { join } from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const COMMANDS_DIR = join(ROOT, "commands");
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const VERIFY_COUNT = args.includes("--verify-count");
const STAMP_COUNT = args.includes("--stamp-count");
const ALLOW_STAMP = args.includes("--allow-stamp");

// --- Single Source of Truth: user-facing slash commands count ---
function getUserFacingCommandCount() {
  // Count non-wrapper .md files in commands/ (single-entry: only forge.md)
  return readdirSync(COMMANDS_DIR)
    .filter((f) => f.endsWith(".md") && !f.startsWith("forge-"))
    .length;
}

const SST_COUNT = getUserFacingCommandCount();

// --- --verify-count: CI check that all docs agree with SST ---
if (VERIFY_COUNT) {
  const targets = [
    {
      file: join(ROOT, "README.md"),
      pattern: /(\d+)\s*(?:命令|commands?)/gi,
    },
    {
      file: join(ROOT, ".claude-plugin", "plugin.json"),
      pattern: /(\d+)\s*commands?/gi,
    },
    {
      file: join(ROOT, ".claude-plugin", "marketplace.json"),
      pattern: /(\d+)\s*commands?/gi,
    },
    {
      file: join(ROOT, "docs", "reference-commands.md"),
      pattern: /(\d+)\s*(?:命令|commands?)/gi,
    },
    {
      file: join(ROOT, "ROADMAP.md"),
      pattern: /(\d+)\s*(?:个\s*)?slash\s*(?:命令|command)/gi,
    },
    {
      file: join(ROOT, "CHANGELOG.md"),
      pattern: /(\d+)\s*(?:个\s*)?slash\s*(?:命令|command)/gi,
    },
  ];

  // Scan .forge/decisions/*.md — skip lines with (historical: annotation
  const decisionsDir = join(ROOT, ".forge", "decisions");
  if (existsSync(decisionsDir)) {
    for (const entry of readdirSync(decisionsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      targets.push({
        file: join(decisionsDir, entry.name),
        pattern: /(\d+)\s*(?:个\s*)?(?:slash\s*)?(?:命令|command)/gi,
        skipHistorical: true,
      });
    }
  }

  let ok = true;
  for (const t of targets) {
    if (!existsSync(t.file)) continue;
    const content = readFileSync(t.file, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("(historical:")) continue;
      const matches = [...line.matchAll(t.pattern)];
      for (const m of matches) {
        const n = Number.parseInt(m[1], 10);
        if (n !== SST_COUNT) {
          console.error(
            `MISMATCH ${t.file}:${i + 1}: found ${n}, SST=${SST_COUNT} (context: "${m[0].trim()}")`,
          );
          ok = false;
        }
      }
    }
  }
  if (ok) {
    console.log(`OK: all command count declarations match SST=${SST_COUNT}`);
  }
  process.exit(ok ? 0 : 1);
}

// --- --stamp-count: replace {FORGE_COMMAND_COUNT} or numeric counts ---
if (STAMP_COUNT) {
  if (!ALLOW_STAMP) {
    console.error("--stamp-count requires --allow-stamp to prevent accidental overwrites");
    process.exit(1);
  }
  const replacements = [
    {
      file: join(ROOT, "README.md"),
      re: /\b18\b(?=\s*(?:命令|个命令))/g,
    },
    {
      file: join(ROOT, ".claude-plugin", "plugin.json"),
      re: /\b28\b(?=\s*commands?)/g,
    },
    {
      file: join(ROOT, ".claude-plugin", "marketplace.json"),
      re: /\b28\b(?=\s*commands?)/g,
    },
    {
      file: join(ROOT, "docs", "reference-commands.md"),
      re: /\b18\b(?=\s*(?:个命令|命令))/g,
    },
  ];

  for (const r of replacements) {
    if (!existsSync(r.file)) continue;
    const before = readFileSync(r.file, "utf-8");
    const after = before.replaceAll(r.re, String(SST_COUNT));
    if (after !== before) {
      writeFileSync(r.file, after);
      console.log(`STAMPED ${r.file}: → ${SST_COUNT}`);
    } else {
      console.log(`SKIP ${r.file}: already ${SST_COUNT} or pattern not found`);
    }
  }
  console.log(`Done: SST count = ${SST_COUNT}`);
  process.exit(0);
}

// --- Default: single-entry mode (no wrapper generation) ---

if (DRY_RUN) {
  console.log("single-entry mode: no wrapper commands generated.");
  console.log("Only commands/tinkerman.md is preserved (manual edits only).");
  console.log(`SST count: ${SST_COUNT} user-facing slash command(s)`);
  process.exit(0);
}

console.log("single-entry mode: no wrapper commands generated.");
console.log("Only commands/tinkerman.md is preserved (manual edits only).");
console.log(`Done: SST count = ${SST_COUNT}`);
