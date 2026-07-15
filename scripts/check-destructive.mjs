#!/usr/bin/env node
// category: internal-only

/**
 * check-destructive.mjs — PreToolUse hook for Bash tool (unconditional).
 *
 * Audit P1: the destructive guard (git reset --hard / push --force / clean -fd /
 * stash drop / infra destroy) was previously only wired through check-sandbox,
 * which short-circuits to allow when `.forge/.sandbox-active.json` is absent.
 * That meant in normal (non-sandboxed) runs, nothing intercepted these
 * history-rewriting / untracked-deleting commands.
 *
 * This hook calls the SAME authority (`checkDestructive`) but with
 * `guardEnabled: true` unconditionally — no sandbox-active precondition. It is
 * fail-open on parse/infra errors (exit 0) to avoid blocking legitimate work
 * when the compiled guard is unavailable.
 *
 * Exit codes:
 *   0 — allow
 *   2 — block (destructive command detected, message on stderr)
 */

import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Input parsing — same shape as bash-ban-raw.mjs
// ---------------------------------------------------------------------------

async function readCommandFromStdin() {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const input = Buffer.concat(chunks).toString("utf-8");
    if (!input) return null;
    const parsed = JSON.parse(input);
    return parsed?.tool_input?.command ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Escape hatch — same 10-min unlock file convention as bash-ban-raw.mjs
// ---------------------------------------------------------------------------

function isEscapeHatchActive() {
  const escapeFile = join(tmpdir(), `destructive-unlock-${process.ppid}`);
  try {
    if (!existsSync(escapeFile)) return false;
    const stats = statSync(escapeFile);
    const ageMs = Date.now() - stats.mtimeMs;
    return ageMs < 10 * 60 * 1000; // 10 minutes
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Load the compiled guard authority — resolve from plugin root / skills dir
// ---------------------------------------------------------------------------

async function loadGuard() {
  const candidates = [
    process.env.CLAUDE_PLUGIN_ROOT && `${process.env.CLAUDE_PLUGIN_ROOT}/dist/src/destructive-guard.js`,
    "dist/src/destructive-guard.js",
    "forge/dist/src/destructive-guard.js",
    join(process.env.HOME ?? "", ".claude/skills/forge/dist/src/destructive-guard.js"),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        const abs = isAbsolute(p) ? p : join(process.cwd(), p);
        return await import(pathToFileURL(abs).href);
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const command = await readCommandFromStdin();
  if (!command) {
    process.exit(0); // fail-open on unparseable input
  }

  if (isEscapeHatchActive()) {
    process.exit(0);
  }

  const mod = await loadGuard();
  if (!mod || typeof mod.checkDestructive !== "function") {
    // Compiled guard unavailable — fail-open rather than block all Bash.
    process.exit(0);
  }

  const decision = mod.checkDestructive(command, {
    guardEnabled: true,
    rollbackActive: false,
    userSingleAllow: false,
  });

  if (!decision.allowed) {
    process.stderr.write(
      `BLOCKED (destructive guard): ${decision.reason}\n` +
      `Escape hatch: touch /tmp/destructive-unlock-$PPID (10 min)\n`,
    );
    process.exit(2);
  }

  process.exit(0);
}

main();
