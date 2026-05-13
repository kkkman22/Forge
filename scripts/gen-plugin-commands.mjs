#!/usr/bin/env node

// Generate commands/*.md from skills/*/SKILL.md frontmatter.
// Each command is a thin wrapper that routes to the corresponding skill.
// Usage:
//   node scripts/gen-plugin-commands.mjs [--dry-run]
//   node scripts/gen-plugin-commands.mjs --verify-count
//   node scripts/gen-plugin-commands.mjs --stamp-count

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from "fs";
import { join } from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const SKILLS_DIR = join(ROOT, "skills");
const COMMANDS_DIR = join(ROOT, "commands");
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const VERIFY_COUNT = args.includes("--verify-count");
const STAMP_COUNT = args.includes("--stamp-count");

const SKIP = ["shared"];

// --- Single Source of Truth: count subcommands from commands/forge.md ---
function getSubcommandCount() {
  const forgeMd = readFileSync(join(COMMANDS_DIR, "forge.md"), "utf-8");
  const rows = forgeMd.match(/^\| `\w[^`]+` \| `forge-/gm);
  return rows ? rows.length : 0;
}

const SST_COUNT = getSubcommandCount();

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
  ];

  let ok = true;
  for (const t of targets) {
    if (!existsSync(t.file)) continue;
    const content = readFileSync(t.file, "utf-8");
    const matches = [...content.matchAll(t.pattern)];
    for (const m of matches) {
      const n = Number.parseInt(m[1], 10);
      if (n !== SST_COUNT) {
        console.error(
          `MISMATCH ${t.file}: found ${n}, SST=${SST_COUNT} (line context: "${m[0]}")`,
        );
        ok = false;
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

// --- Default: generate command files ---

// Pack conditional registration: load enabled pack feature flags
const PACKS_DIR = join(ROOT, "packs");
const enabledFlags = new Set();

if (existsSync(PACKS_DIR)) {
  for (const entry of readdirSync(PACKS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packFile = join(PACKS_DIR, entry.name, "pack.yaml");
    if (!existsSync(packFile)) continue;
    const packContent = readFileSync(packFile, "utf-8");
    if (/^enabled:\s*true\b/m.test(packContent) || !/^enabled:/m.test(packContent)) {
      const ffMatch = packContent.match(/^feature_flags:\s*\n([\s\S]*?)(?=\n\S|\n$)/m);
      if (ffMatch) {
        const flagNames = ffMatch[1].match(/^\s{2}(\w[\w-]*)/gm);
        if (flagNames) {
          for (const f of flagNames) enabledFlags.add(f.trim());
        }
      }
    }
  }
}

const commands = [];
const skippedPackConditional = [];

for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory() || SKIP.includes(entry.name)) continue;

  const skillFile = join(SKILLS_DIR, entry.name, "SKILL.md");
  if (!existsSync(skillFile)) continue;

  const content = readFileSync(skillFile, "utf-8");
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) continue;

  const fm = frontmatterMatch[1];
  const nameMatch = fm.match(/^name:\s*["']?(.+?)["']?\s*$/m);
  const descMatch = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m);

  // Pack conditional: check if skill requires a pack feature flag
  const packCondMatch = fm.match(/^pack_conditional:\s*\n\s+required_flag:\s*(\S+)/m);
  if (packCondMatch) {
    const requiredFlag = packCondMatch[1];
    if (!enabledFlags.has(requiredFlag)) {
      skippedPackConditional.push({ skillName: entry.name, requiredFlag });
      console.log(`SKIP-PACK  ${entry.name} (requires flag: ${requiredFlag})`);
      continue;
    }
  }

  const name = nameMatch ? nameMatch[1].trim() : entry.name;
  const desc = descMatch
    ? descMatch[1].trim().replace(/^["']|["']$/g, "")
    : `${entry.name} skill`;

  commands.push({ skillName: entry.name, name, description: desc });
}

if (commands.length === 0) {
  console.error("No skills found");
  process.exit(1);
}

// Also add the main forge command (already exists, skip if present)
const FORGE_COMMAND = {
  skillName: "forge",
  name: "forge",
  description:
    "Forge 主命令。支持子命令直接调用和任务描述路由两种模式。",
};

let generated = 0;
let skipped = 0;

for (const cmd of [...commands, FORGE_COMMAND]) {
  const filename = `${cmd.name}.md`;
  const filepath = join(COMMANDS_DIR, filename);

  if (cmd.name === "forge" && existsSync(filepath)) {
    console.log(`SKIP  ${filename} (exists, preserve)`);
    skipped++;
    continue;
  }

  const content = `---
description: "${cmd.description.replace(/"/g, '\\"')}"
---

调用 \`${cmd.skillName}\` skill。
`;

  if (DRY_RUN) {
    console.log(`WOULD CREATE ${filename}`);
  } else {
    writeFileSync(filepath, content);
    console.log(`CREATED ${filename}`);
  }
  generated++;
}

console.log(`\nDone: ${generated} created, ${skipped} skipped`);
