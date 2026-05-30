#!/usr/bin/env node

/**
 * StopFailure lifecycle hook.
 *
 * Records API errors (rate limit, auth failure, etc.) to
 * .forge/debug/failures.jsonl for later /forge debug analysis.
 * Auto-creates .forge/debug/ directory on first run.
 *
 * Fail-open: exits 0 on any condition.
 *
 * Environment variables (provided by Claude Code):
 *   STOP_ERROR_TYPE — error category (rate_limit, auth_failure, timeout, etc.)
 *   STOP_ERROR_MESSAGE — human-readable error description
 *
 * Usage: node scripts/stop-failure-hook.mjs
 *
 * Exit codes: 0 (always — fail-open)
 */

import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const CWD = process.cwd();
const DEBUG_DIR = join(CWD, ".forge", "debug");
const FAILURES_FILE = join(DEBUG_DIR, "failures.jsonl");

try {
  const errorType = process.env.STOP_ERROR_TYPE;
  const errorMessage = process.env.STOP_ERROR_MESSAGE;

  if (!errorType) {
    process.exit(0);
  }

  // Auto-create .forge/debug/
  mkdirSync(DEBUG_DIR, { recursive: true });

  const entry = {
    error_type: errorType,
    timestamp: new Date().toISOString(),
    details: errorMessage || "No details provided",
  };

  appendFileSync(FAILURES_FILE, JSON.stringify(entry) + "\n", "utf-8");
} catch {
  // fail-open: exit 0 on any error
}

process.exit(0);
