/**
 * Vitest setup file (loaded into every worker before each test file).
 *
 * Sets safety defaults for fast-check property-based tests so that
 * pathological generators or shrink paths cannot run indefinitely
 * — even when Node's event loop is starved by CPU-bound predicate code
 * (which is exactly what bypasses vitest's testTimeout).
 *
 * Background: see decision log entry for orphan vitest worker incident
 * on 2026-05-23. Three workers ran ~22h at 100% CPU after their parent
 * vitest process exited; vitest's testTimeout never fired because the
 * synchronous predicate starved the event loop.
 *
 * Per-call options passed to fc.assert(...) override these defaults.
 */
import * as fc from "fast-check";

fc.configureGlobal({
  // Wall-clock cap (ms) measured inside fast-check's runner.
  // Slightly above vitest's testTimeout so vitest reports timeouts first
  // under normal conditions; this is the safety net when the event loop is
  // starved and vitest's timer cannot fire.
  interruptAfterTimeLimit: 8000,
  // Treat interrupted runs as failures so the offending property surfaces
  // loudly rather than passing silently after a partial run.
  markInterruptAsFailure: true,
});
