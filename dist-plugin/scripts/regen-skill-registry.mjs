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
  const text = match[1];

  const fm = {};
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) { i++; continue; }

    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();

    // Inline array: allowed_tools: [A, B, C]
    if (rest.startsWith("[")) {
      const items = rest
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      fm[key] = items;
      i++;
      continue;
    }

    // Block sequence: key:\n  - A\n  - B\n
    if (rest === "" && i + 1 < lines.length && /^\s+-\s/.test(lines[i + 1])) {
      const items = [];
      i++;
      while (i < lines.length && /^\s+-\s/.test(lines[i])) {
        const item = lines[i].replace(/^\s+-\s+/, "").trim();
        items.push(item);
        i++;
      }
      fm[key] = items;
      continue;
    }

    // Scalar: strip surrounding quotes
    fm[key] = rest.replace(/^["']|["']$/g, "");
    i++;
  }

  return fm;
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
    lines.push(`description = ${JSON.stringify(sub.description)}`);
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
