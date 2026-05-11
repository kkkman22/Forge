#!/usr/bin/env node

// Generate commands/*.md from skills/*/SKILL.md frontmatter.
// Each command is a thin wrapper that routes to the corresponding skill.
// Usage: node scripts/gen-plugin-commands.mjs [--dry-run]

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const SKILLS_DIR = join(ROOT, "skills");
const COMMANDS_DIR = join(ROOT, "commands");
const DRY_RUN = process.argv.includes("--dry-run");

const SKIP = ["shared"];

const commands = [];

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
