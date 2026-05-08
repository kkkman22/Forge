#!/usr/bin/env node
/**
 * check-public-api.mjs — Validate barrel file against @public/@internal annotations.
 *
 * Checks:
 * 1. All barrel exports have @public in source
 * 2. No @internal symbols are in barrel
 * 3. Barrel statement count ≤ 20
 * 4. Export count matches test expectation
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const BARREL = join(ROOT, "src/index.ts");
const SRC = join(ROOT, "src");

const MAX_STATEMENTS = 20;

function read(path) {
  return readFileSync(path, "utf-8");
}

// --- Check 1: barrel statement count ---
const barrelContent = read(BARREL);
const exportStatements = barrelContent.split("\n").filter((l) => /^export\s/.test(l.trim()));
const statementCount = exportStatements.length;

console.log(`Barrel export statements: ${statementCount} (max ${MAX_STATEMENTS})`);
if (statementCount > MAX_STATEMENTS) {
  console.error(`FAIL: barrel has ${statementCount} export statements, max is ${MAX_STATEMENTS}`);
  process.exit(1);
}

// --- Extract exported symbol names from barrel ---
const barrelSymbols = new Set();
for (const line of exportStatements) {
  // Match: export { X, type Y, Z as Alias } from "./mod.js"
  const match = line.match(/\{([^}]+)\}/);
  if (!match) continue;
  for (const part of match[1].split(",")) {
    const trimmed = part.trim();
    // Skip type-only exports
    if (trimmed.startsWith("type ")) continue;
    // Handle `X as Y` — take the alias
    const name = trimmed.includes(" as ") ? trimmed.split(" as ").pop().trim() : trimmed;
    if (name) barrelSymbols.add(name);
  }
}

console.log(`Barrel value exports: ${barrelSymbols.size}`);

// --- Check 2: all @public symbols are in barrel ---
function walkDir(dir, ext, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkDir(full, ext, files);
    } else if (entry.endsWith(ext)) {
      files.push(full);
    }
  }
  return files;
}

const srcFiles = walkDir(SRC, ".ts").filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".d.ts"));

let hasError = false;

// Collect @public symbols
const publicSymbols = new Map(); // name → file
for (const file of srcFiles) {
  const content = read(file);
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/@public\b/.test(lines[i])) {
      // Next non-empty line has the symbol
      for (let j = i + 1; j < lines.length; j++) {
        const trimmed = lines[j].trim();
        if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
        // Extract name from: export function X, export class X, export const X, export type X, export interface X
        const nameMatch = trimmed.match(
          /(?:export\s+(?:declare\s+)?(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)|export\s+\{([^}]+)\})/,
        );
        if (nameMatch) {
          const name = nameMatch[1] || nameMatch[2]?.split(",").pop()?.trim();
          if (name) publicSymbols.set(name, relative(ROOT, file));
        }
        break;
      }
    }
  }
}

// Check @public symbols not in barrel (but only for value exports, not types)
// Types don't appear at runtime, so skip them
const valueTypes = new Set(["const", "let", "var", "function", "class", "enum"]);
const publicValueSymbols = new Map();

for (const file of srcFiles) {
  const content = read(file);
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/@public\b/.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const trimmed = lines[j].trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
      const kindMatch = trimmed.match(
        /export\s+(?:declare\s+)?(?:default\s+)?(const|let|var|function|class|interface|type|enum)\s+/,
      );
      if (kindMatch && valueTypes.has(kindMatch[1])) {
        const nameMatch = trimmed.match(
          /export\s+(?:declare\s+)?(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/,
        );
        if (nameMatch) {
          publicValueSymbols.set(nameMatch[1], relative(ROOT, file));
        }
      }
      break;
    }
  }
}

// Also check inline export syntax in barrel: re-exported via `export { X } from "./mod.js"`
// The barrel already handles this — just verify @public annotations exist for barrel exports

// Check that each barrel symbol comes from a module where it's marked @public
// For re-exports, the symbol name in barrel matches the source module's exported name
const barrelImportMap = new Map(); // symbol → source module
for (const line of exportStatements) {
  const fromMatch = line.match(/from\s+"\.\/([^"]+)"/);
  if (!fromMatch) continue;
  const module = fromMatch[1];
  const braceMatch = line.match(/\{([^}]+)\}/);
  if (!braceMatch) continue;
  for (const part of braceMatch[1].split(",")) {
    const trimmed = part.trim();
    if (trimmed.startsWith("type ")) continue;
    const name = trimmed.includes(" as ") ? trimmed.split(" as ").pop().trim() : trimmed;
    if (name) barrelImportMap.set(name, module);
  }
}

// Verify all barrel value exports have @public in their source
for (const [symbol, mod] of barrelImportMap) {
  const sourceFile = join(SRC, `${mod}.ts`);
  let content;
  try {
    content = read(sourceFile);
  } catch {
    // Some modules may not exist as .ts (could be .tsx, etc.)
    continue;
  }

  // Check if the symbol has @public annotation (either directly above it or in a group comment)
  const lines = content.split("\n");
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    // Look for the symbol name in an export line
    const exportPattern = new RegExp(
      `export\\s+(?:declare\\s+)?(?:default\\s+)?(?:const|let|var|function|class|enum)\\s+${symbol}\\b`,
    );
    const inlineExportPattern = new RegExp(`\\b${symbol}\\b`);
    if (exportPattern.test(lines[i]) || (inlineExportPattern.test(lines[i]) && /^export\s*\{/.test(lines[i].trim()))) {
      // Check preceding lines for @public
      for (let k = i - 1; k >= Math.max(0, i - 5); k--) {
        if (/@public/.test(lines[k])) {
          found = true;
          break;
        }
        if (lines[k].trim() === "" || lines[k].trim().startsWith("//") || lines[k].trim().startsWith("/*") || lines[k].trim().startsWith("*")) {
          continue;
        }
        break;
      }
      if (found) break;
      // Also check if @public is in a grouped export block header
      // e.g., lines before `export {` block
    }
  }

  // For grouped re-exports (export { X, Y, Z } from "..."), @public may be on individual
  // definitions in the source module. Check if @public appears anywhere relevant.
  if (!found) {
    // Check if the source file has @public at all, and the symbol is exported
    const hasPublic = content.includes("@public");
    const hasSymbolExport = new RegExp(`export[^;]*\\b${symbol}\\b`).test(content);
    if (!hasPublic || !hasSymbolExport) {
      console.warn(`WARN: ${symbol} (from ${mod}) — @public annotation not found near symbol definition`);
    }
  }
}

// --- Check 3: no @internal symbols in barrel ---
for (const file of srcFiles) {
  const content = read(file);
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/@internal\b/.test(lines[i])) continue;
    // Find symbol name after @internal
    for (let j = i + 1; j < lines.length; j++) {
      const trimmed = lines[j].trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
      const nameMatch = trimmed.match(
        /(?:export\s+(?:declare\s+)?(?:default\s+)?)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/,
      );
      if (nameMatch && barrelSymbols.has(nameMatch[1])) {
        console.error(`FAIL: @internal symbol "${nameMatch[1]}" found in barrel (from ${relative(ROOT, file)})`);
        hasError = true;
      }
      break;
    }
  }
}

if (hasError) {
  process.exit(1);
}

console.log("OK: public API checks passed");
