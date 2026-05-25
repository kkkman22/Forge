/**
 * Contract test (F11): every line in dispatch.jsonl — regardless of which
 * module produced it — must conform to the shared 14-field DispatchRecord
 * schema.
 *
 * Two emitters exist:
 *   - workflow-dispatcher.writeDispatchRecord (full ladder context)
 *   - workflow-audit-writer.writeAuditRecord (frozen-zone violation)
 *
 * Both go through src/dispatch-record.ts since F11.
 */

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendDispatchRecord,
  assertValidDispatchRecord,
  type DispatchRecord,
  frozenZoneRecord,
} from "../../src/dispatch-record.js";
import { FrozenZoneViolation, writeAuditRecord } from "../../src/workflow-audit-writer.js";
import { writeDispatchRecord } from "../../src/workflow-dispatcher.js";

function fullRecord(over: Partial<DispatchRecord> = {}): DispatchRecord {
  return {
    subcommand: "review",
    mode: "interactive",
    run_id: "run_contract",
    session_id: "sess_contract",
    workflow_state_id: "wsid_xyz",
    workflow_version: "1.0.0",
    gate_enabled: true,
    workflow_available: true,
    chosen_level: "L0",
    exit_code: 0,
    duration_ms: 100,
    timestamp: new Date().toISOString(),
    frozen_zone_blocked: false,
    ...over,
  };
}

describe("dispatch.jsonl schema contract (F11)", () => {
  it("assertValidDispatchRecord accepts full record", () => {
    expect(() => assertValidDispatchRecord(fullRecord())).not.toThrow();
  });

  it("assertValidDispatchRecord throws on missing field", () => {
    const bad = fullRecord();
    delete (bad as Partial<DispatchRecord>).workflow_state_id;
    expect(() => assertValidDispatchRecord(bad)).toThrow(/workflow_state_id/);
  });

  it("assertValidDispatchRecord throws on non-object", () => {
    expect(() => assertValidDispatchRecord(null)).toThrow();
    expect(() => assertValidDispatchRecord("string")).toThrow();
  });

  it("dispatcher and audit-writer produce schema-conformant lines", () => {
    const tmp = mkdtempSync(join(tmpdir(), "dispatch-contract-"));

    // Dispatcher path: ladder record.
    writeDispatchRecord(
      {
        forgeRoot: tmp,
        runId: "run_x",
        sessionId: "sess_x",
        mode: "interactive",
        subcommand: "review",
        pluginRoot: "/n/a",
      },
      fullRecord({ run_id: "run_x", session_id: "sess_x" }),
    );

    // Audit-writer path: frozen-zone violation.
    expect(() =>
      writeAuditRecord(
        {
          forgeRoot: tmp,
          runId: "run_x",
          sessionId: "sess_x",
          subcommand: "decide",
          topic: "locked",
          isFrozenZone: () => true,
        },
        "blocked",
      ),
    ).toThrow(FrozenZoneViolation);

    const dispatchPath = join(tmp, "runs", "run_x", "dispatch.jsonl");
    const lines = readFileSync(dispatchPath, "utf-8").trim().split("\n");
    expect(lines.length).toBe(2);

    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(() => assertValidDispatchRecord(parsed)).not.toThrow();
    }

    // Specific assertions on the audit-writer (frozen-zone) line.
    const frozenLine = JSON.parse(lines[1]!);
    expect(frozenLine.frozen_zone_blocked).toBe(true);
    expect(frozenLine.l0_failure_signature).toBe("frozen_zone_blocked");
    expect(frozenLine.subcommand).toBe("decide");
  });

  it("frozenZoneRecord helper produces a valid record", () => {
    const r = frozenZoneRecord("learn", "run_fz", "sess_fz");
    expect(() => assertValidDispatchRecord(r)).not.toThrow();
    expect(r.frozen_zone_blocked).toBe(true);
    expect(r.l0_failure_signature).toBe("frozen_zone_blocked");
  });

  it("appendDispatchRecord rejects malformed records before write", () => {
    const tmp = mkdtempSync(join(tmpdir(), "dispatch-contract-"));
    const bad = fullRecord();
    delete (bad as Partial<DispatchRecord>).timestamp;
    expect(() => appendDispatchRecord(tmp, "run_bad", bad)).toThrow(/timestamp/);
  });
});
