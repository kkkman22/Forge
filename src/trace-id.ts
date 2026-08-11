/**
 * Trace ID — cross-phase correlation identifier for `/tinkerman` command lifecycles.
 *
 * Generates unique trace IDs that propagate through all phases
 * (decide → spec → plan → build → review → test → ship → learn)
 * via `dispatch.jsonl`, `status.md`, and NDJSON events.
 *
 * Format: `trace_<YYYYMMDDTHHmm>_<6-char-hex>`
 * Example: `trace_20260606T1437_a3f100`
 *
 * @module trace-id
 */

import { randomBytes } from "node:crypto";

/**
 * Trace ID format: `trace_<YYYYMMDDTHHmm>_<6-char-hex>`.
 *
 * - Timestamp provides human-readable temporal ordering.
 * - 6-char hex sequence (16M values/process window) provides uniqueness for single-user CLI.
 */
export const TRACE_ID_PATTERN = /^trace_\d{8}T\d{4}_[0-9a-f]{6}$/;

const TRACE_SEQUENCE_MODULO = 0x1000000;
let traceSequence = randomBytes(3).readUIntBE(0, 3);

/**
 * Generate a unique trace ID for a `/tinkerman` command invocation.
 *
 * Seeds a per-process monotonic sequence with `crypto.randomBytes` (not `Math.random`).
 * A pure 24-bit random suffix has a non-negligible birthday-collision chance in
 * rapid CI loops, while a seeded sequence keeps the public 6-hex format stable.
 */
export function generateTraceId(): string {
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  traceSequence = (traceSequence + 1) % TRACE_SEQUENCE_MODULO;
  const hex = traceSequence.toString(16).padStart(6, "0");
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
