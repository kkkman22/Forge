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

import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const CWD = process.cwd();
const DEBUG_DIR = join(CWD, ".forge", "debug");
const FAILURES_FILE = join(DEBUG_DIR, "failures.jsonl");

/** Max message length to prevent unbounded JSONL entries. */
const MAX_MESSAGE_LENGTH = 500;

/** Patterns that may contain credentials or tokens. */
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,          // OpenAI-style keys
  /key[a-zA-Z0-9]{20,}/gi,         // Generic API keys
  /token[a-zA-Z0-9]{20,}/gi,       // Generic tokens
  /Bearer\s+[a-zA-Z0-9._-]+/gi,    // Bearer tokens
  /[a-zA-Z0-9]{40,}/g,             // Long hex/base64 strings (likely secrets)
];

/**
 * Sanitize error message: truncate and redact potential secrets.
 */
function sanitizeMessage(msg) {
  let sanitized = msg.slice(0, MAX_MESSAGE_LENGTH);
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

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
    details: sanitizeMessage(errorMessage || "No details provided"),
  };

  appendFileSync(FAILURES_FILE, JSON.stringify(entry) + "\n", "utf-8");
} catch {
  // fail-open: exit 0 on any error
}

process.exit(0);
