#!/usr/bin/env node

/**
 * Stop hook: verify active phase before session ends + desktop notification.
 *
 * Reads .forge/status.md and warns if the current phase is active
 * (not "completed" or empty), reminding the user to verify their
 * last change. Also outputs a terminalSequence desktop notification
 * for phase transitions (suppressed in CI/non-interactive environments).
 *
 * Migrated from inline shell command in plugin.json Stop hook.
 *
 * Usage: node scripts/stop-phase-verify.mjs
 *
 * Exit codes:
 *   0 — allow session end (phase completed, no status, or parse error)
 *   2 — BLOCK session end (audit P1 iron-law: phase active but no verify
 *       artifact found). Set FORGE_VERIFY_WARN_ONLY=1 to revert to warn-only.
 *
 * Audit P1 (verification-run-command iron-law): was fail-open (exit 0 always),
 * making the "no verification = cannot claim done" iron-law advisory only.
 * Now blocks session end when a phase is active AND no verify artifact exists,
 * unless FORGE_VERIFY_WARN_ONLY=1.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CWD = process.cwd();
const STATUS_FILE = join(CWD, ".forge", "status.md");

/** Phase emoji map for desktop notifications. */
const PHASE_EMOJI = {
  build: "🔨",
  review: "📝",
  test: "🧪",
  ship: "🚢",
  plan: "📋",
  spec: "📐",
  decide: "🎯",
  learn: "📚",
  debug: "🐛",
};

/** Check if running in CI or non-interactive environment. */
function isInteractive() {
  // CI env vars (GitHub Actions, GitLab CI, etc.)
  if (process.env.CI === "true" || process.env.CI === "1") return false;
  if (process.env.GITHUB_ACTIONS) return false;
  if (process.env.GITLAB_CI) return false;
  // No TTY
  if (!process.stdout.isTTY) return false;
  return true;
}

try {
  if (!existsSync(STATUS_FILE)) {
    process.exit(0);
  }

  const content = readFileSync(STATUS_FILE, "utf-8");

  // Extract phase from frontmatter
  const phaseMatch = content.match(/^phase:\s*"?([^"\n]*)"?\s*$/m);
  if (!phaseMatch) {
    process.exit(0);
  }

  const phase = phaseMatch[1].trim();

  if (phase && phase !== "completed" && phase !== "") {
    // Audit P1: check for a verify artifact. If the phase is active but no
    // verification was run, block session end (iron-law: verification-run-command).
    const verifyArtifact = existsSync(join(CWD, ".forge", "verify-artifact.json"))
      || existsSync(join(CWD, ".forge", "reviews", "test-verdict.md"));
    const warnOnly = process.env.FORGE_VERIFY_WARN_ONLY === "1";

    const msg = `⚠️ Phase "${phase}" is active — did you verify your last change? Run the relevant test/lint command (npm run typecheck && npm test) before stopping.`;
    console.error(msg);

    // Desktop notification (interactive only)
    if (isInteractive()) {
      const emoji = PHASE_EMOJI[phase] || "⏳";
      const notification = {
        terminalSequence: {
          type: "notification",
          title: "Forge Phase Active",
          message: `${emoji} ${phase} — verify before stopping`,
        },
      };
      console.log(JSON.stringify(notification));
    }

    if (!verifyArtifact && !warnOnly) {
      console.error("BLOCKED: no verify artifact found. Run verification, or set FORGE_VERIFY_WARN_ONLY=1 to allow.");
      process.exit(2);
    }
  }
} catch {
  // fail-open: exit 0 on any error
}

process.exit(0);
