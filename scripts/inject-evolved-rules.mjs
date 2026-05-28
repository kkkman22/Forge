#!/usr/bin/env node
// category: internal-only
/**
 * inject-evolved-rules.mjs — SessionStart hook: evolved-rules + spec-title injector.
 *
 * Reads .forge/knowledge/evolved-rules.md with a 4KB byte limit.
 * Detects active spec from .forge/state/spec-lock or .kiro/specs/ directory.
 * Outputs JSON with additionalContext + hookSpecificOutput (reloadSkills, sessionTitle).
 * Short-circuits to zero output when stdin signals subagent caller.
 * Fails open silently when file doesn't exist (stderr diagnostic + exit 0).
 *
 * @see https://code.claude.com/docs/en/hooks#common-input-fields
 */
import { readFileSync, statSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { shouldSkipForSubagent } from "./lib/hook-stdin-router.mjs";

const RULES_PATH = ".forge/knowledge/evolved-rules.md";
const SPEC_LOCK_PATH = ".forge/state/spec-lock";
const SPECS_DIR = ".kiro/specs";
const MAX_BYTES = 32768; // Read full file — extraction will trim
const MAX_CONTENT_BYTES = 80; // Byte budget per Content line (CJK = 3 bytes/char)

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
 * Returns null when file doesn't exist.
 */
function readEvolvedRules(cwd) {
  const fullPath = resolve(cwd, RULES_PATH);
  try {
    statSync(fullPath);
    const buf = readFileSync(fullPath);
    if (buf.length <= MAX_BYTES) {
      return buf.toString("utf-8");
    }
    let end = MAX_BYTES;
    const nl = buf.subarray(0, MAX_BYTES).lastIndexOf(0x0a);
    if (nl > 0) end = nl + 1;
    return buf.subarray(0, end).toString("utf-8");
  } catch {
    return null;
  }
}

/**
 * Detect active spec name.
 * Priority: .forge/state/spec-lock > single spec in .kiro/specs/ > null
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
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    if (specDirs.length === 1) return specDirs[0];
    // Multiple specs with no lock → ambiguous, return null
  } catch {
    // specs dir doesn't exist
  }

  return null;
}

(async () => {
  try {
    if (await shouldSkipForSubagent()) process.exit(0);

    const cwd = process.cwd();
    const rawRules = readEvolvedRules(cwd);

    // No evolved-rules.md → silent exit
    if (rawRules === null) {
      process.exit(0);
    }

    // Extract only Content lines to reduce injection size (~4KB → ~1KB)
    let rulesContent;
    try {
      rulesContent = extractContentOnly(rawRules);
    } catch {
      // Fallback to raw truncation if parsing fails
      rulesContent = rawRules;
    }

    const specName = detectSpecName(cwd);

    const output = {
      additionalContext: rulesContent,
      hookSpecificOutput: {
        reloadSkills: true,
      },
    };

    if (specName) {
      output.hookSpecificOutput.sessionTitle = `Forge: ${specName}`;
    }

    process.stdout.write(JSON.stringify(output));
  } catch (err) {
    // Failure path: stderr diagnostic + exit 0
    if (err instanceof Error && err.message) {
      process.stderr.write(`session-start-hook: ${err.message}\n`);
    }
    process.exit(0);
  }
})();
