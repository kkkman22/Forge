#!/usr/bin/env node
/**
 * Static purity checker for docs-governance generator and renderers.
 * Enforces P6/P14: no child_process, Date, process.env, Math.random
 * in index-generator/generator.ts and ssot/renderers/*.ts
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { resolve, relative } from "node:path";

const TARGET_PATTERNS = [
  "src/docs-governance/index-generator/generator.ts",
  "src/docs-governance/ssot/renderers/*.ts",
];

const FORBIDDEN = [
  { pattern: /child_process|node:child_process/g, name: "child_process import" },
  { pattern: /\bDate\b|\bDate\.now\(\)/g, name: "Date usage" },
  { pattern: /\bprocess\.env\b/g, name: "process.env access" },
  { pattern: /\bMath\.random\b/g, name: "Math.random() call" },
];

let violations = 0;

for (const pat of TARGET_PATTERNS) {
  const files = globSync(pat);
  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const rel = relative(process.cwd(), file);
    for (const rule of FORBIDDEN) {
      const matches = content.match(rule.pattern);
      if (matches) {
        // Allow in comments
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
          if (rule.pattern.test(line)) {
            console.error(`${rel}:${i + 1}: forbidden ${rule.name}`);
            violations++;
          }
        }
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} purity violation(s) found in generator/renderer files.`);
  process.exit(1);
}
console.log("Purity check passed.");
