#!/usr/bin/env node
// category: internal-only
/**
 * inject-plan-context.mjs — Plan context injection for Claude Code hooks.
 *
 * Scans .forge/plans/*.md for active plans, extracts headers respecting token
 * budget constraints, and outputs them to stdout for UserPromptSubmit hook.
 *
 * Fail-open: errors produce no output rather than blocking the user.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PLANS_DIR = ".forge/plans";
const MAX_PLANS = 3;
const MAX_LINES_PER_PLAN = 50;
const MAX_CHARS_PER_PLAN = 2000;
const MAX_TOTAL_CHARS = 8000; // ~2000 tokens

function isActive(content) {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return false;
  return /^status:\s*["']?(active|approved)["']?/m.test(fm[1]);
}

function extractHead(content) {
  const lines = content.split("\n").slice(0, MAX_LINES_PER_PLAN);
  const body = lines.join("\n");
  return body.length > MAX_CHARS_PER_PLAN
    ? body.slice(0, MAX_CHARS_PER_PLAN) + "\n[... truncated]"
    : body;
}

try {
  let entries;
  try {
    entries = readdirSync(PLANS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ path: join(PLANS_DIR, f), mtime: statSync(join(PLANS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    // Plans directory doesn't exist — nothing to inject
    process.exit(0);
  }

  const active = [];
  for (const e of entries) {
    if (active.length >= MAX_PLANS) break;
    const content = readFileSync(e.path, "utf-8");
    if (isActive(content)) active.push({ path: e.path, body: extractHead(content) });
  }

  if (active.length === 0) process.exit(0);

  let output = "=== Forge Context ===\n";
  let total = output.length;
  for (let i = 0; i < active.length; i++) {
    const chunk = `\n--- ${active[i].path} ---\n${active[i].body}\n`;
    if (total + chunk.length > MAX_TOTAL_CHARS) {
      output += `\n[... ${active.length - i} plans truncated due to token budget]\n`;
      break;
    }
    output += chunk;
    total += chunk.length;
  }

  process.stdout.write(output);
} catch {
  // fail-open: don't inject rather than error
  process.exit(0);
}
