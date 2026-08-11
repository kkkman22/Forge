#!/usr/bin/env node
/**
 * SKILL-src Parity Check — validates instructions.md rules have src/ counterparts.
 *
 * Scans all skill instructions for rule markers (IRON-LAW, 铁律, <important)
 * and cross-references against skill-function-registry.ts entries.
 * Reports covered vs uncovered rules.
 *
 * Exit codes:
 *   0 — all enforceable rules covered
 *   1 — uncovered rules found
 *
 * Usage: node scripts/skill-parity-check.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

// ---------------------------------------------------------------------------
// Rule extraction from instructions.md
// ---------------------------------------------------------------------------

const RULE_PATTERNS = [
  // <IRON-LAW name="..."> blocks
  { type: "IRON-LAW", regex: /<IRON-LAW\s+name="([^"]+)"/g, group: 1 },
  // 铁律 markers in text
  { type: "iron-law-text", regex: /[（(]铁律[)）]/g, group: 0 },
  // <important if="..."> blocks
  { type: "important-block", regex: /<important\s+if="([^"]+)"/g, group: 1 },
];

/**
 * @param {string} dirPath
 * @returns {string[]}
 */
function listInstructionFiles(dirPath) {
  const results = [];
  for (const entry of readdirSync(dirPath)) {
    const full = join(dirPath, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      const instr = join(full, "instructions.md");
      try {
        statSync(instr);
        results.push(instr);
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
        // no instructions.md — skip
      }
    }
  }
  return results;
}

/**
 * @param {string} filePath
 * @returns {Array<{type: string, name: string, file: string}>}
 */
function extractRules(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const rules = [];
  const relPath = filePath.replace(`${ROOT}`, "");

  for (const pattern of RULE_PATTERNS) {
    let match;
    while ((match = pattern.regex.exec(content)) !== null) {
      rules.push({
        type: pattern.type,
        name: match[pattern.group],
        // Normalize to "tinkerman/lib/..." format for registry comparison
        file: relPath.replace(/^skills\//, ""),
      });
    }
    // Reset regex lastIndex
    pattern.regex.lastIndex = 0;
  }

  return rules;
}

// ---------------------------------------------------------------------------
// Registry cross-reference
// ---------------------------------------------------------------------------

/**
 * Parse skill-function-registry.ts to extract skill → function mappings.
 * @returns {Map<string, string[]>} skill path → function names
 */
function parseRegistry() {
  const registryPath = join(ROOT, "src/skill-function-registry.ts");
  const content = readFileSync(registryPath, "utf-8");
  const skillSet = new Set();

  // Match entries: skills: ["tinkerman/lib/xxx/instructions.md", ...]
  const entryRegex = /skills:\s*\[([^\]]+)\]/g;
  let entryMatch;
  while ((entryMatch = entryRegex.exec(content)) !== null) {
    const skillsStr = entryMatch[1];
    const skillRefs = [...skillsStr.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    for (const ref of skillRefs) {
      skillSet.add(ref);
    }
  }

  return skillSet;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const skillDir = join(ROOT, "skills/tinkerman/lib");
  const instructionFiles = listInstructionFiles(skillDir);
  const registry = parseRegistry();

  const allRules = [];
  for (const file of instructionFiles) {
    allRules.push(...extractRules(file));
  }

  // Check coverage: a skill file is "covered" if it has registry entries
  const coveredSkills = registry;
  const ruleFiles = new Set(allRules.map((r) => r.file));
  const uncoveredRuleFiles = [...ruleFiles].filter((f) => !coveredSkills.has(f));

  // Deduplicate rules
  const uniqueRules = [...new Map(allRules.map((r) => [`${r.type}:${r.name}`, r])).values()];

  // Report
  const lines = [];
  lines.push("=== SKILL-src Parity Check ===");
  lines.push("");
  lines.push(`Skills scanned:     ${instructionFiles.length}`);
  lines.push(`Registry entries:    ${registry.size}`);
  lines.push(`Rules found:         ${uniqueRules.length}`);
  lines.push(`  IRON-LAW:          ${uniqueRules.filter((r) => r.type === "IRON-LAW").length}`);
  lines.push(
    `  Iron-law (text):   ${uniqueRules.filter((r) => r.type === "iron-law-text").length}`,
  );
  lines.push(
    `  Important blocks:  ${uniqueRules.filter((r) => r.type === "important-block").length}`,
  );
  lines.push(`Rule sources:        ${ruleFiles.size}`);
  lines.push(`Covered by registry: ${ruleFiles.size - uncoveredRuleFiles.length}`);
  lines.push(`Uncovered:           ${uncoveredRuleFiles.length}`);
  lines.push("");

  if (uniqueRules.length > 0) {
    lines.push("Rules detail:");
    for (const rule of uniqueRules) {
      lines.push(`  [${rule.type}] ${rule.name} (${rule.file})`);
    }
    lines.push("");
  }

  if (uncoveredRuleFiles.length > 0) {
    lines.push("⚠ Uncovered rule files (no registry entry):");
    for (const f of uncoveredRuleFiles) {
      lines.push(`  ${f}`);
    }
  } else {
    lines.push("✅ All rule-containing skills have registry entries.");
  }

  const output = lines.join("\n");
  console.log(output);

  // Exit 1 if uncovered rules exist (but currently we accept text-iron-laws as
  // documentation-only, so only fail on IRON-LAW blocks without coverage)
  const uncoveredIronLaws = uniqueRules.filter(
    (r) => r.type === "IRON-LAW" && !coveredSkills.has(r.file),
  );

  if (uncoveredIronLaws.length > 0) {
    process.exit(1);
  }
}

main();
