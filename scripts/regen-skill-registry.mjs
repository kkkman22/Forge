#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const LIB_DIR = join(ROOT, "skills", "forge", "lib");
const OUTPUT = join(ROOT, "skills", "forge", "registry.toml");
const CHECK_ONLY = process.argv.includes("--check-only");

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();
    if (rest.startsWith("-")) {
      // YAML list
      const items = [];
      for (const itemLine of match[1].split("\n")) {
        const trimmed = itemLine.trim();
        if (trimmed.startsWith("- ") && itemLine.includes(key) === false || items.length > 0) {
          // Already capturing list items
        }
      }
      // Simple approach: re-parse list from the frontmatter section
      const listRegex = new RegExp(`${key}:\\s*\\n((?:\\s+- .*\\n?)+)`);
      const listMatch = match[1].match(listRegex);
      if (listMatch) {
        for (const item of listMatch[1].split("\n")) {
          const m = item.match(/^\s+-\s+(.*)/);
          if (m) items.push(m[1].trim());
        }
      }
      fm[key] = items;
    } else {
      fm[key] = rest;
    }
  }
  return fm;
}

function escapeTomlString(str) {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function subsFromLib() {
  const entries = readdirSync(LIB_DIR, { withFileTypes: true });
  const subs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const instrPath = join(LIB_DIR, entry.name, "instructions.md");
    if (!existsSync(instrPath)) continue;

    const content = readFileSync(instrPath, "utf-8");
    const fm = parseFrontmatter(content);

    subs.push({
      name: entry.name,
      dispatch_mode: fm.dispatch_mode || "inline",
      allowed_tools: Array.isArray(fm.allowed_tools) ? fm.allowed_tools : [],
      description: fm.description || "",
    });
  }

  return subs.sort((a, b) => a.name.localeCompare(b.name));
}

function generateToml(subs) {
  const lines = [
    "# AUTO-GENERATED — DO NOT EDIT",
    `# Source: skills/forge/lib/<sub>/instructions.md frontmatter`,
    `# Regen: node scripts/regen-skill-registry.mjs`,
    `# Last regen: ${new Date().toISOString()}`,
    "",
  ];

  for (const sub of subs) {
    const toolsStr = sub.allowed_tools.map((t) => `"${t}"`).join(", ");
    lines.push(`[${sub.name}]`);
    lines.push(`dispatch_mode = "${sub.dispatch_mode}"`);
    lines.push(`allowed_tools = [${toolsStr}]`);
    lines.push(`description = "${escapeTomlString(sub.description)}"`);
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

const subs = subsFromLib();
const toml = generateToml(subs);

if (CHECK_ONLY) {
  if (!existsSync(OUTPUT)) {
    console.error("registry.toml does not exist");
    process.exit(1);
  }
  const existing = readFileSync(OUTPUT, "utf-8");
  // Strip timestamp lines before comparing
  const stripTs = (s) => s.replace(/# Last regen: .*\n/, "");
  if (stripTs(existing) === stripTs(toml)) {
    console.log("registry.toml is up to date");
    process.exit(0);
  }
  console.error("registry.toml is stale — regenerate with: node scripts/regen-skill-registry.mjs");
  process.exit(1);
}

writeFileSync(OUTPUT, toml);
console.log(`registry.toml generated with ${subs.length} subs`);
