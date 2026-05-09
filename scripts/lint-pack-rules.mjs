#!/usr/bin/env node

/**
 * Pack Lint Rules CI integration script.
 * Loads enabled pack lint rules and scans source files for violations.
 * Usage: node scripts/lint-pack-rules.mjs [--pack-root <path>] [--src-dir <path>]
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const args = process.argv.slice(2);
const projectRoot = args[args.indexOf("--project-root") + 1] || process.cwd();
const packRoot = args[args.indexOf("--pack-root") + 1] || join(projectRoot, "packs");
const srcDir = args[args.indexOf("--src-dir") + 1] || join(projectRoot, "src");

function parseYaml(text) {
  const result = {};
  let currentKey = null;
  let inArray = false;
  let arrayItems = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("- ")) {
      if (inArray) {
        const val = trimmed.slice(2).trim().replace(/^["']|["']$/g, "");
        arrayItems.push(val);
      }
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const val = trimmed.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");

    if (currentKey && inArray) {
      result[currentKey] = arrayItems;
    }

    currentKey = key;
    if (val === "") {
      inArray = true;
      arrayItems = [];
    } else {
      inArray = false;
      result[key] = val;
    }
  }

  if (currentKey && inArray) {
    result[currentKey] = arrayItems;
  }

  return result;
}

function loadManifest(packPath) {
  const manifestPath = join(packPath, "lint-rules", "manifest.yaml");
  if (!existsSync(manifestPath)) return null;

  const content = readFileSync(manifestPath, "utf-8");
  const rules = [];

  const ruleBlocks = content.split(/\n(?=\s*-\s+id:)/);
  for (const block of ruleBlocks) {
    const parsed = parseYaml(block);
    if (parsed.id) {
      rules.push({
        id: parsed.id,
        severity: parsed.severity || "warn",
        entry: parsed.entry,
        target_globs: parsed.target_globs || [],
        description: parsed.description || "",
      });
    }
  }

  return rules;
}

function loadRuleYaml(packPath, entryPath) {
  const fullPath = join(packPath, "lint-rules", entryPath);
  if (!existsSync(fullPath)) return null;
  return parseYaml(readFileSync(fullPath, "utf-8"));
}

function globToRegex(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.replace(/\*\*/g, "{{GLOBSTAR}}").replace(/\*/g, "[^/]*").replace(/{{GLOBSTAR}}/g, ".*");
  return new RegExp(pattern);
}

function matchesGlob(filePath, glob) {
  return globToRegex(glob).test(filePath);
}

function collectFiles(dir, ext = ".ts") {
  const files = [];
  if (!existsSync(dir)) return files;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      files.push(fullPath);
    }
  }
  return files;
}

// Main
const packs = existsSync(packRoot) ? readdirSync(packRoot, { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join(packRoot, d.name, "pack.yaml")))
  .map(d => d.name) : [];

let totalFindings = 0;

for (const packName of packs) {
  const packPath = join(packRoot, packName);
  const manifestRules = loadManifest(packPath);
  if (!manifestRules || manifestRules.length === 0) continue;

  const rules = [];
  for (const entry of manifestRules) {
    const ruleYaml = loadRuleYaml(packPath, entry.entry);
    if (ruleYaml && ruleYaml.patterns) {
      rules.push({ ...entry, patterns: Array.isArray(ruleYaml.patterns) ? ruleYaml.patterns : [ruleYaml.patterns] });
    }
  }

  if (rules.length === 0) continue;

  const files = collectFiles(srcDir);
  for (const file of files) {
    const relPath = relative(projectRoot, file);
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");

    for (const rule of rules) {
      if (!rule.target_globs.some(g => matchesGlob(relPath, g))) continue;

      for (const pattern of rule.patterns) {
        if (!pattern.expression) continue;
        const regex = new RegExp(pattern.expression);
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes("// @forge:allow-")) continue;
          if (regex.test(lines[i])) {
            const sev = rule.severity === "error" ? "✘" : "⚠";
            console.log(`${sev} ${rule.id}: ${relPath}:${i + 1} — ${pattern.message || rule.description}`);
            totalFindings++;
          }
        }
      }
    }
  }
}

if (totalFindings > 0) {
  console.log(`\n${totalFindings} finding(s) from pack lint rules.`);
  process.exit(1);
} else {
  console.log("No pack lint findings.");
  process.exit(0);
}
