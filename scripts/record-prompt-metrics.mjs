#!/usr/bin/env node

// record-prompt-metrics.mjs
// UserPromptSubmit hook: parses the user prompt, extracts the /forge <sub>
// subcommand (if any), and records a usage metric by delegating to
// metrics-recorder.mjs. Non-blocking: any failure is swallowed.
//
// Prompt content is delivered via stdin (Claude Code UserPromptSubmit contract).
// Only the subcommand name is recorded — prompt body is never persisted (privacy).
//
// Exports extractForgeSubcommand / classifyPrompt for unit testing.

import { spawnSync } from "node:child_process";
import { existsSync, readSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FORGE_MARKER = ".forge";
const FORGE_SUBCOMMANDS = new Set([
  "plan", "build", "review", "test", "ship", "learn",
  "decide", "spec", "debug", "loop", "status", "resume",
  "abort", "refactor", "fix", "grill", "storm", "zoom-out",
  "verify", "accept", "replay", "triage", "charter", "recap",
  "continue",
]);

/**
 * Extract the /forge <sub> subcommand from a prompt string.
 * Returns the subcommand name (e.g. "build"), or null when the prompt is
 * not a /forge slash invocation with a known subcommand.
 *
 * Matching rules:
 *  - Must start with (optional whitespace then) "/forge ".
 *  - Bare "/forge" (router path) → null (handled by classifyPrompt as router).
 *  - The token right after /forge must be a known subcommand.
 *  - "/forgex" or "/forgebuild" does not match (word boundary required).
 */
export function extractForgeSubcommand(prompt) {
  if (!prompt || typeof prompt !== "string") return null;
  const match = prompt.match(/^\s*\/forge(?:\s+([A-Za-z][A-Za-z0-9_-]*))?/);
  if (!match) return null;
  const sub = match[1];
  if (!sub) return null; // bare /forge → router path, no direct subcommand
  if (!FORGE_SUBCOMMANDS.has(sub)) return null; // unknown subcommand → let router decide
  return sub;
}

/**
 * Classify a prompt into a metric record.
 * Returns { kind, skill }:
 *  - kind "slash": explicit /forge <sub>; skill = "forge-<sub>"
 *  - kind "natural": bare /forge (router path) or unknown /forge sub; skill = "forge-router"
 *  - kind "other": not a forge prompt at all; skill = null (do not record)
 */
export function classifyPrompt(prompt) {
  if (!prompt || typeof prompt !== "string") {
    return { kind: "other", skill: null };
  }
  const isForge = /^\s*\/forge(?:\s|$)/.test(prompt);
  if (!isForge) return { kind: "other", skill: null };
  const sub = extractForgeSubcommand(prompt);
  if (sub) return { kind: "slash", skill: `forge-${sub}` };
  // bare /forge or unknown sub → routed by forge-router
  return { kind: "natural", skill: "forge-router" };
}

function readStdinSync() {
  // UserPromptSubmit delivers the prompt via stdin. Read synchronously with a
  // bounded buffer so a huge prompt cannot stall the hook.
  try {
    const fd = 0;
    const BUFSIZ = 65536;
    const chunks = [];
    const buf = Buffer.alloc(BUFSIZ);
    let total = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const n = readSync(fd, buf, 0, BUFSIZ, null);
      if (n <= 0) break;
      total += n;
      chunks.push(Buffer.from(buf.subarray(0, n)));
      if (total >= 65536) break; // cap: we only need the leading token
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return "";
  }
}

function isForgeProject(startDir) {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, FORGE_MARKER))) return true;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

function recordMetric(skill, source) {
  // Delegate to the existing metrics-recorder.mjs to keep a single write path.
  const recorder = join(__dirname, "metrics-recorder.mjs");
  try {
    const res = spawnSync("node", [recorder, skill, source], {
      stdio: "ignore",
      timeout: 5000,
    });
    return res.status === 0;
  } catch {
    return false;
  }
}

async function main() {
  // Non-forge project: silently skip (do not pollute non-forge repos).
  const cwd = process.cwd();
  if (!isForgeProject(cwd)) {
    process.exit(0);
  }

  // In some hook invocation contexts stdin may not carry the prompt. Fall back
  // to CLAUDE_PROMPT env var if present.
  let prompt = "";
  if (process.env.CLAUDE_PROMPT) {
    prompt = process.env.CLAUDE_PROMPT;
  } else {
    try {
      prompt = readStdinSync();
    } catch {
      prompt = "";
    }
  }

  const { skill } = classifyPrompt(prompt);
  if (!skill) {
    // Not a forge prompt; do not record.
    process.exit(0);
  }

  recordMetric(skill, "manual");
  // Always exit 0 — metrics must never block the user prompt.
  process.exit(0);
}

// Only run main when invoked directly as a CLI (not when imported by tests).
const invokedPath = process.argv[1] ? fileURLToPath(`file://${process.argv[1]}`) : "";
const scriptPath = fileURLToPath(import.meta.url);
const isMain = invokedPath === scriptPath;
if (isMain) {
  main().catch(() => process.exit(0));
}
