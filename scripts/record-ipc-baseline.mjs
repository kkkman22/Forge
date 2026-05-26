/**
 * record-ipc-baseline.mjs — Produce a deterministic IPC baseline NDJSON fixture
 *
 * Usage: node scripts/record-ipc-baseline.mjs
 * Output: apps/forge-loop-desktop/test/fixtures/ipc-baseline.ndjson
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const IPC_SCHEMA_VERSION = 1;
const RUN_ID = "baseline-run-001";
const BASE_TS = new Date("2026-01-15T00:00:00.000Z");

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "apps", "forge-loop-desktop", "test", "fixtures", "ipc-baseline.ndjson");

function ts(offsetSeconds) {
  const d = new Date(BASE_TS.getTime() + offsetSeconds * 1000);
  return d.toISOString();
}

const events = [
  {
    event: "version",
    schema: IPC_SCHEMA_VERSION,
    supported_events: [
      "forge_loop_run_started",
      "iteration_start",
      "iteration_end",
      "progress",
      "message",
      "tool_use",
      "tool_result",
      "completion",
      "run_completed",
      "error",
      "warning",
      "version",
    ],
  },
  {
    event: "forge_loop_run_started",
    objective: "refactor auth module",
    tier: "standard",
    max_iterations: 10,
  },
  {
    event: "iteration_start",
    iteration: 1,
  },
  {
    event: "progress",
    percentage: 10,
  },
  {
    event: "message",
    role: "assistant",
    text: "Starting auth module refactoring...",
  },
  {
    event: "tool_use",
    tool: "Read",
    input: { file_path: "/src/auth/login.ts" },
  },
  {
    event: "tool_result",
    output: "file contents here",
    status_code: 0,
  },
  {
    event: "iteration_end",
    iteration: 1,
    outcome: "progress",
  },
  {
    event: "iteration_start",
    iteration: 2,
  },
  {
    event: "message",
    role: "assistant",
    text: "Completed refactoring of auth module.",
  },
  {
    event: "completion",
    result: "success",
    summary: "Auth module refactored successfully.",
  },
  {
    event: "iteration_end",
    iteration: 2,
    outcome: "success",
  },
  {
    event: "run_completed",
    exit_code: 0,
    total_iterations: 2,
  },
  {
    event: "error",
    code: "subprocess_crash",
    message: "exit code 137",
    fatal: false,
    retryable: true,
  },
  {
    event: "warning",
    code: "subprocess-retry",
    attempt: 1,
    fatal: false,
    retryable: false,
  },
];

const lines = events.map((payload, idx) =>
  JSON.stringify({
    run_id: RUN_ID,
    schema: IPC_SCHEMA_VERSION,
    ts: ts(idx),
    ...payload,
  }),
);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join("\n") + "\n");
process.stdout.write(`Wrote ${lines.length} events to ${OUT}\n`);
