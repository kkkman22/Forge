#!/usr/bin/env node
// knowledge-hook-dispatch.mjs — PostToolUse hook for knowledge auto-rebuild
//
// Modes:
//   node knowledge-hook-dispatch.mjs --from-path <path>  — Hook mode (silent)
//   node knowledge-hook-dispatch.mjs --event <json>      — Direct event dispatch
//   node knowledge-hook-dispatch.mjs --check-catalog     — Catalog freshness check
//
// Exit codes: 0 success / 1 error / 2 no .tinkerman/

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { getCachePath, migrateOldCache } from "./lib/plugin-data-path.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..");

const modPath = join(projectRoot, "dist", "src", "src", "knowledge-hooks.js");
let mod;
try {
  mod = await import(modPath);
} catch {
  // Silent fail for hook mode
  process.exit(0);
}

const { dispatchKnowledgeEvent } = mod;

const args = process.argv.slice(2);
const forgeRoot = findForgeRoot();
if (!forgeRoot) process.exit(2);

// Migrate old .tinkerman/.cache/ to plugin data dir on first run
migrateOldCache(forgeRoot);

// ---------------------------------------------------------------------------
// Arg dispatch
// ---------------------------------------------------------------------------

if (args[0] === "--from-path" || process.env.TOOL_INPUT_FILE) {
  const inputPath = process.env.TOOL_INPUT_FILE || args[1];
  if (!inputPath) process.exit(0);

  // Path traversal defense: reject absolute paths and parent references
  if (inputPath.startsWith("/") || inputPath.includes("..")) process.exit(0);

  const relPath = inputPath.replace(/^\.forge\//, "").replace(/^\.\/\.forge\//, "");

  // Prevent infinite loop: catalog.md rebuild should not trigger itself
  if (relPath === "knowledge/catalog.md") process.exit(0);
  // findings/ writes should not trigger rebuild
  if (relPath.startsWith("findings/")) process.exit(0);

  const event = deriveEventFromPath(relPath);
  if (!event) process.exit(0);

  try {
    const result = await dispatchKnowledgeEvent({
      event,
      forgeRoot,
      recentHashes: new Set(),
      now: new Date(),
    });

    // Cache the result for this event type
    writeEventCache(event, result);
  } catch {
    // Fail-silent for hook mode
  }
  process.exit(0);
}

if (args[0] === "--event") {
  const json = args[1];
  if (!json) {
    console.error("Usage: --event '<json>'");
    process.exit(1);
  }
  // Max input size: 64KB (JSON bomb defense)
  if (json.length > 65536) {
    console.error("--event argument too large (max 64KB)");
    process.exit(1);
  }
  let event;
  try {
    event = JSON.parse(json);
  } catch {
    console.error("Invalid JSON in --event argument");
    process.exit(1);
  }
  const result = await dispatchKnowledgeEvent({
    event,
    forgeRoot,
    recentHashes: new Set(),
    now: new Date(),
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (args[0] === "--check-catalog") {
  const result = await dispatchKnowledgeEvent({
    event: { kind: "catalog_read", readerSkill: "cli" },
    forgeRoot,
    recentHashes: new Set(),
    now: new Date(),
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log("Usage:");
console.log("  node knowledge-hook-dispatch.mjs --from-path <path>");
console.log("  node knowledge-hook-dispatch.mjs --event '<json>'");
console.log("  node knowledge-hook-dispatch.mjs --check-catalog");
process.exit(1);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_CACHE_KEYS = 500;

function readKnowledgeCache() {
  const cachePath = getCachePath("knowledge-cache.json");
  if (!cachePath) return {};
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

function writeEventCache(event, result) {
  const cachePath = getCachePath("knowledge-cache.json");
  if (!cachePath) return;
  try {
    const cache = readKnowledgeCache();
    const key = `${event.kind}:${event.path || event.topic || ""}`;
    cache[key] = {
      event,
      result,
      cachedAt: new Date().toISOString(),
    };
    // Evict oldest entries when cache exceeds limit
    const entries = Object.keys(cache);
    if (entries.length > MAX_CACHE_KEYS) {
      const sorted = entries.sort((a, b) =>
        (cache[a].cachedAt || "").localeCompare(cache[b].cachedAt || ""),
      );
      const evictCount = entries.length - MAX_CACHE_KEYS;
      for (let i = 0; i < evictCount; i++) delete cache[sorted[i]];
    }
    writeFileSync(cachePath, JSON.stringify(cache), { mode: 0o600 });
  } catch {
    // Cache write failure — degraded mode
  }
}

function deriveEventFromPath(relPath) {
  if (relPath.startsWith("decisions/ADR-") && relPath.endsWith(".md")) {
    return { kind: "adr_written", path: relPath };
  }
  if (relPath.startsWith("knowledge/solutions/") && relPath.endsWith(".md")) {
    const topic = basename(relPath, ".md");
    return { kind: "solution_written", topic, path: relPath };
  }
  if (relPath === "knowledge/instincts.md") {
    return { kind: "instincts_written", path: relPath };
  }
  if (relPath === "knowledge/known-failures.md") {
    return { kind: "known_failures_written", path: relPath };
  }
  if (relPath === "glossary.md") {
    return { kind: "glossary_written", path: relPath };
  }
  return null;
}

function findForgeRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, ".tinkerman"))) return join(dir, ".tinkerman");
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
