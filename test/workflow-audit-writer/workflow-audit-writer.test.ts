import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type AuditWriteContext,
  FrozenZoneViolation,
  resolveDestPath,
  writeAuditRecord,
} from "../../src/workflow-audit-writer.js";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "audit-writer-"));
});

afterEach(() => {
  // OS reclaims tmp
});

function makeCtx(over: Partial<AuditWriteContext> = {}): AuditWriteContext {
  return {
    forgeRoot: tmpRoot,
    runId: "run_t9",
    subcommand: "review",
    topic: "demo",
    ...over,
  };
}

describe("WorkflowAuditWriter: AC 4.1/4.2/4.3 — resolveDestPath", () => {
  it("review → .forge/reviews/<topic>.md", () => {
    const path = resolveDestPath(makeCtx({ subcommand: "review", topic: "auth" }));
    expect(path).toBe(join(tmpRoot, "reviews", "auth.md"));
  });

  it("decide → .forge/decisions/<date>-<topic-slug>.md", () => {
    const path = resolveDestPath(
      makeCtx({ subcommand: "decide", topic: "Auth Strategy", date: "2026-05-25" }),
    );
    expect(path).toMatch(/decisions\/2026-05-25-auth-strategy\.md$/);
  });

  it("learn → .forge/knowledge/sessions/<runId>.md", () => {
    const path = resolveDestPath(makeCtx({ subcommand: "learn", runId: "run_xyz" }));
    expect(path).toBe(join(tmpRoot, "knowledge", "sessions", "run_xyz.md"));
  });
});

describe("WorkflowAuditWriter: AC 4.5 — append-only invariant", () => {
  it("preserves existing content as a strict prefix when appending", () => {
    const ctx = makeCtx({ subcommand: "review", topic: "preserve" });
    const dest = resolveDestPath(ctx);
    require("node:fs").mkdirSync(join(tmpRoot, "reviews"), { recursive: true });
    writeFileSync(dest, "EXISTING\n");
    writeAuditRecord(ctx, "NEW\n");
    const after = readFileSync(dest, "utf-8");
    expect(after.startsWith("EXISTING\n")).toBe(true);
    expect(after).toContain("NEW");
  });

  it("property-based: 100 random (existing, append) pairs preserve prefix", () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.string({ maxLength: 200 }), fc.string({ maxLength: 200 })),
        ([existing, append]) => {
          const ctx = makeCtx({
            subcommand: "review",
            topic: `prop-${Math.random().toString(36).slice(2, 8)}`,
          });
          const dest = resolveDestPath(ctx);
          require("node:fs").mkdirSync(join(tmpRoot, "reviews"), { recursive: true });
          writeFileSync(dest, existing);
          writeAuditRecord(ctx, append);
          const after = readFileSync(dest, "utf-8");
          return after.startsWith(existing);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("WorkflowAuditWriter: AC 4.6 — auto-create parent directory", () => {
  it("mkdir -p when parent dir is absent", () => {
    const ctx = makeCtx({ subcommand: "decide", topic: "fresh", date: "2026-01-01" });
    expect(existsSync(join(tmpRoot, "decisions"))).toBe(false);
    writeAuditRecord(ctx, "decision body");
    const dest = resolveDestPath(ctx);
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, "utf-8")).toContain("decision body");
  });
});

describe("WorkflowAuditWriter: AC 4.7 — Frozen Zone block", () => {
  it("throws FrozenZoneViolation when isFrozenZone callback returns true", () => {
    const ctx = makeCtx({
      subcommand: "review",
      topic: "locked",
      isFrozenZone: () => true,
    });
    expect(() => writeAuditRecord(ctx, "blocked content")).toThrow(FrozenZoneViolation);
  });

  it("appends frozen_zone_blocked record to dispatch.jsonl on violation", () => {
    const ctx = makeCtx({
      subcommand: "review",
      topic: "locked",
      isFrozenZone: () => true,
    });
    expect(() => writeAuditRecord(ctx, "blocked")).toThrow(FrozenZoneViolation);
    const dispatchPath = join(tmpRoot, "runs", "run_t9", "dispatch.jsonl");
    expect(existsSync(dispatchPath)).toBe(true);
    const line = JSON.parse(readFileSync(dispatchPath, "utf-8").trim().split("\n").pop()!);
    expect(line.frozen_zone_blocked).toBe(true);
    expect(line.subcommand).toBe("review");
  });

  it("proceeds when isFrozenZone callback returns false", () => {
    const ctx = makeCtx({
      subcommand: "review",
      topic: "ok",
      isFrozenZone: () => false,
    });
    writeAuditRecord(ctx, "ok content");
    const dest = resolveDestPath(ctx);
    expect(readFileSync(dest, "utf-8")).toContain("ok content");
  });
});

describe("WorkflowAuditWriter: AC 4.8 — hook-check-frozen.sh integration", () => {
  it("calls preWriteHook when provided and aborts on non-zero exit", () => {
    const ctx = makeCtx({
      subcommand: "review",
      topic: "hook-block",
      preWriteHook: () => 1, // non-zero exit code → abort
    });
    expect(() => writeAuditRecord(ctx, "data")).toThrow(/preWriteHook/);
  });

  it("proceeds when preWriteHook returns 0", () => {
    let called = 0;
    const ctx = makeCtx({
      subcommand: "review",
      topic: "hook-pass",
      preWriteHook: () => {
        called++;
        return 0;
      },
    });
    writeAuditRecord(ctx, "passed");
    expect(called).toBe(1);
    expect(readFileSync(resolveDestPath(ctx), "utf-8")).toContain("passed");
  });
});
