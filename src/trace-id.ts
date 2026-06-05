/**
 * Trace ID — cross-phase correlation identifier for `/forge` command lifecycles.
 *
 * Generates unique trace IDs that propagate through all phases
 * (decide → spec → plan → build → review → test → ship → learn)
 * via `dispatch.jsonl`, `status.md`, and NDJSON events.
 *
 * Format: `trace_<YYYYMMDDTHHmm>_<4-char-hex>`
 * Example: `trace_20260606T1437_a3f1`
 *
 * @module trace-id
 */

import { randomBytes } from "node:crypto";

/**
 * Trace ID format: `trace_<YYYYMMDDTHHmm>_<4-char-hex>`.
 *
 * - Timestamp provides human-readable temporal ordering.
 * - 6-char hex (16M values/min) provides uniqueness for single-user CLI.
 */
export const TRACE_ID_PATTERN = /^trace_\d{8}T\d{4}_[0-9a-f]{6}$/;

/**
 * Generate a unique trace ID for a `/forge` command invocation.
 *
 * Uses `crypto.randomBytes` for cryptographic randomness (not `Math.random`).
 */
export function generateTraceId(): string {
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const hex = randomBytes(3).toString("hex");
  return `trace_${ts}_${hex}`;
}

/**
 * Validate that a value conforms to the trace ID format.
 *
 * Used at read boundaries (e.g., reading `trace_id` from `status.md`)
 * to guard against corruption or tampering.
 */
export function isValidTraceId(id: unknown): id is string {
  return typeof id === "string" && TRACE_ID_PATTERN.test(id);
}
