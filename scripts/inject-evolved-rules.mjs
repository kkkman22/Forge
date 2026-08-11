#!/usr/bin/env node
// category: internal-only
/**
 * inject-evolved-rules.mjs — SessionStart hook: evolved-rules + spec-title injector.
 *
 * Reads .tinkerman/knowledge/evolved-rules.md with a 4KB byte limit.
 * Detects active spec from .tinkerman/state/spec-lock or .kiro/specs/ directory.
 * Outputs JSON with additionalContext + hookSpecificOutput (reloadSkills, sessionTitle).
 * Short-circuits to zero output when stdin signals subagent caller.
 * Fails open silently when file doesn't exist (stderr diagnostic + exit 0).
 *
 * @see https://code.claude.com/docs/en/hooks#common-input-fields
 */
import { readFileSync, statSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { shouldSkipForSubagent } from "./lib/hook-stdin-router.mjs";
import { getCachePath, migrateOldCache } from "./lib/plugin-data-path.mjs";
import { pruneHookOutput } from "./lib/zcode-platform.mjs";

const RULES_PATH = ".tinkerman/knowledge/evolved-rules.md";
const SPEC_LOCK_PATH = ".tinkerman/state/spec-lock";
const SPECS_DIR = ".kiro/specs";
// Max source file read size (32KB — full file, extraction will trim)
const MAX_BYTES = 32768;
// Max byte budget per Content line (80 bytes — CJK uses 3 bytes/char)
const MAX_CONTENT_BYTES = 80;

/**
 * Extract only rule headers + **Content** lines from evolved-rules markdown.
 * Strips YAML frontmatter, intro text, comments, and all metadata fields.
 * Truncates Content lines to MAX_CONTENT_CHARS. Reduces injection to <1.5KB.
 */
function extractContentOnly(markdown) {
  const lines = markdown.split("\n");
  const result = ["## Evolved Rules (content-only)"];
  let inRule = false;
  let inFrontmatter = false;

  for (const line of lines) {
    if (line.trim() === "---") {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;

    if (/^### R\d+:/.test(line)) {
      inRule = true;
      result.push("", line);
      continue;
    }
    if (!inRule) continue;

    if (/^\*\*Content\*\*:/.test(line)) {
      let truncated = line;
      while (Buffer.byteLength(truncated, "utf-8") > MAX_CONTENT_BYTES && truncated.length > 10) {
        truncated = truncated.slice(0, -1);
      }
      if (truncated !== line) truncated += "…";
      result.push(truncated);
      continue;
    }

    if (/^### |^<!-- |^## /.test(line)) {
      inRule = false;
      continue;
    }

    if (
      /^\*\*(Prevents|Source|Added|Confidence|Last_triggered|Infra_Ref)\*\*:/.test(
        line,
      )
    ) {
      continue;
    }
  }

  return result.join("\n");
}

/**
 * Read evolved-rules.md content, truncated at MAX_BYTES.
 * Returns { content, mtimeMs } or null when file doesn't exist.
 */
function readEvolvedRules(cwd) {
  const fullPath = resolve(cwd, RULES_PATH);
  try {
    const stat = statSync(fullPath);
    const buf = readFileSync(fullPath);
    let content;
    if (buf.length <= MAX_BYTES) {
      content = buf.toString("utf-8");
    } else {
      let end = MAX_BYTES;
      const nl = buf.subarray(0, MAX_BYTES).lastIndexOf(0x0a);
      if (nl > 0) end = nl + 1;
      content = buf.subarray(0, end).toString("utf-8");
    }
    return { content, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

/**
 * Detect active spec name.
 * Priority: .tinkerman/state/spec-lock > single spec in .kiro/specs/ > null
 */
function detectSpecName(cwd) {
  // Check spec-lock first
  const lockPath = resolve(cwd, SPEC_LOCK_PATH);
  try {
    const lockContent = readFileSync(lockPath, "utf-8").trim();
    if (lockContent) return lockContent;
  } catch {
    // lock doesn't exist, fall through
  }

  // Check .kiro/specs/ for a single spec directory
  const specsPath = resolve(cwd, SPECS_DIR);
  try {
    const entries = readdirSync(specsPath, { withFileTypes: true });
    const specDirs = entries
      // Skip underscore-prefixed dirs (_archived, _templates) — not active specs
      .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
      .map((e) => e.name);
    if (specDirs.length === 1) return specDirs[0];
    // Multiple specs with no lock → ambiguous, return null
  } catch {
    // specs dir doesn't exist
  }

  return null;
}

/**
 * Read evolved-rules with caching via plugin data dir.
 * Uses mtimeMs (number) for precise cache invalidation.
 * Returns the extracted content string, or null if no rules file exists.
 */
function readEvolvedRulesWithCache(cwd) {
  const result = readEvolvedRules(cwd);
  if (result === null) return null;

  const rulesContent = extractContentOnly(result.content);
  const sourceMtimeMs = result.mtimeMs;

  const cacheFilePath = getCachePath("evolved-rules-cache.json");

  // Try reading cache
  if (cacheFilePath) {
    try {
      const cached = JSON.parse(readFileSync(cacheFilePath, "utf-8"));
      // Schema validation: cached must have correct shape
      if (
        typeof cached.sourceMtimeMs === "number" &&
        typeof cached.rules === "string" &&
        cached.sourceMtimeMs === sourceMtimeMs
      ) {
        return cached.rules;
      }
    } catch {
      // Cache miss or corrupted — rebuild below
    }

    // Cache miss / invalid — compile and write cache
    try {
      const cacheEntry = {
        sourceMtimeMs,
        compiledAt: new Date().toISOString(),
        rules: rulesContent,
      };
      writeFileSync(cacheFilePath, JSON.stringify(cacheEntry), { mode: 0o600 });
    } catch {
      // Cache write failure — degraded mode, continue without cache
    }
  }

  return rulesContent;
}

(async () => {
  try {
    if (process.env.FORGE_DIAGNOSTIC_MODE === "1") process.exit(0);
    if (await shouldSkipForSubagent()) process.exit(0);

    const cwd = process.cwd();
    migrateOldCache(cwd);
    const rulesContent = readEvolvedRulesWithCache(cwd);

    // No evolved-rules.md → silent exit
    if (rulesContent === null) {
      process.exit(0);
    }

    const specName = detectSpecName(cwd);

    const output = {
      additionalContext: rulesContent,
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        reloadSkills: true,
      },
    };

    if (specName) {
      output.hookSpecificOutput.sessionTitle = `Forge: ${specName}`;
    }

    process.stdout.write(JSON.stringify(pruneHookOutput(output, "SessionStart")));
  } catch (err) {
    // Failure path: stderr diagnostic + exit 0
    if (err instanceof Error && err.message) {
      process.stderr.write(`session-start-hook: ${err.message}\n`);
    }
    process.exit(0);
  }
})();
