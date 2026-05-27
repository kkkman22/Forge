/**
 * F13/F14: path traversal hardening — negative tests.
 *
 * F13: workflow-audit-writer rejects ctx.topic / ctx.runId / ctx.date that
 *      don't match /^[a-zA-Z0-9._-]{1,64}$/, and asserts the resolved dest
 *      stays under forgeRoot.
 *
 * F14: workflow-dispatcher rejects ctx.runId that doesn't match the slug
 *      pattern; asserts <forgeRoot>/runs/<runId>/ is contained.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  InvalidIdentifierError,
  resolveDestPath,
  writeAuditRecord,
} from "../../src/workflow-audit-writer.js";
import {
  type DispatchContext,
  InvalidRunIdError,
  isolatePartialFindings,
  writeDispatchRecord,
} from "../../src/workflow-dispatcher.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "path-traversal-"));
}

function dispatchCtx(over: Partial<DispatchContext> = {}): DispatchContext {
  return {
    subcommand: "review",
    runId: "run_safe",
    sessionId: "sess_x",
    mode: "interactive",
    forgeRoot: tmp(),
    pluginRoot: "/n/a",
    ...over,
  };
}

const BAD_SLUGS = [
  "../etc/passwd",
  "..",
  "/abs/path",
  "with space",
  "weird?char",
  "",
  "a".repeat(65), // > 64 chars
  "tab\there",
  "null\x00byte",
];

describe("F13: workflow-audit-writer slug validation", () => {
  it.each(BAD_SLUGS)("rejects topic=%j as InvalidIdentifierError", (bad) => {
    expect(() =>
      resolveDestPath({
        forgeRoot: tmp(),
        runId: "run_x",
        subcommand: "review",
        topic: bad,
      }),
    ).toThrow(InvalidIdentifierError);
  });

  it.each(BAD_SLUGS)("rejects runId=%j as InvalidIdentifierError", (bad) => {
    expect(() =>
      resolveDestPath({
        forgeRoot: tmp(),
        runId: bad,
        subcommand: "learn",
      }),
    ).toThrow(InvalidIdentifierError);
  });

  it("rejects empty topic for review subcommand", () => {
    expect(() =>
      resolveDestPath({
        forgeRoot: tmp(),
        runId: "run_x",
        subcommand: "review",
      }),
    ).toThrow(InvalidIdentifierError);
  });

  it("accepts safe identifiers", () => {
    expect(() =>
      resolveDestPath({
        forgeRoot: tmp(),
        runId: "run_2026.05.25",
        subcommand: "review",
        topic: "auth-flow",
      }),
    ).not.toThrow();
  });

  it("writeAuditRecord propagates the validation error before mkdir", () => {
    expect(() =>
      writeAuditRecord(
        {
          forgeRoot: tmp(),
          runId: "run_x",
          subcommand: "review",
          topic: "../escape",
        },
        "payload",
      ),
    ).toThrow(InvalidIdentifierError);
  });
});

describe("F14: workflow-dispatcher runId validation + containment", () => {
  it.each(BAD_SLUGS)("writeDispatchRecord rejects runId=%j", (bad) => {
    const ctx = dispatchCtx({ runId: bad });
    expect(() =>
      writeDispatchRecord(ctx, {
        subcommand: "review",
        mode: "interactive",
        run_id: bad,
        session_id: ctx.sessionId,
        workflow_state_id: "wsid_x",
        workflow_version: "1.0.0",
        gate_enabled: true,
        workflow_available: true,
        chosen_level: "L0",
        exit_code: 0,
        duration_ms: 0,
        timestamp: new Date().toISOString(),
        frozen_zone_blocked: false,
      }),
    ).toThrow(InvalidRunIdError);
  });

  it.each(BAD_SLUGS)("isolatePartialFindings rejects runId=%j", (bad) => {
    const ctx = dispatchCtx({ runId: bad });
    expect(() => isolatePartialFindings(ctx, "partial")).toThrow(InvalidRunIdError);
  });

  it("accepts a safe runId", () => {
    const ctx = dispatchCtx({ runId: "run_safe-123" });
    expect(() =>
      writeDispatchRecord(ctx, {
        subcommand: "review",
        mode: "interactive",
        run_id: ctx.runId,
        session_id: ctx.sessionId,
        workflow_state_id: "wsid_x",
        workflow_version: "1.0.0",
        gate_enabled: true,
        workflow_available: true,
        chosen_level: "L0",
        exit_code: 0,
        duration_ms: 0,
        timestamp: new Date().toISOString(),
        frozen_zone_blocked: false,
      }),
    ).not.toThrow();
  });
});
