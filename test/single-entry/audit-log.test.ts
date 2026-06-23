import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendAuditLog, type GateBlockReason } from "../../src/forge-dispatcher/audit-log.js";
import * as lockHelper from "../../src/tool-health-writer.js";

const TMP_DIR = resolve(import.meta.dirname, "..", "__audit_tmp__");

describe("R2.7: audit log out of workspace", () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("writes NDJSON to designated audit directory", async () => {
    await appendAuditLog(
      {
        ts: "2026-05-17T00:00:00Z",
        sub: "build",
        topic_hash: "abc123",
        lib_hash: "def456",
        tools_granted: ["Read", "Bash"],
        dispatch_mode: "inline",
        outcome: "success" as const,
        prev_hmac: "",
        hmac: "hmac1",
        gate_result: "n_a",
        cmux_available: null,
        gate_reason: null,
      },
      { auditDir: TMP_DIR },
    );

    const logFile = resolve(TMP_DIR, "dispatch.log");
    expect(existsSync(logFile)).toBe(true);
    const line = readFileSync(logFile, "utf-8").trim();
    const parsed = JSON.parse(line);
    expect(parsed.sub).toBe("build");
    expect(parsed.hmac).toBe("hmac1");
  });

  it("HMAC chain: second entry references first", async () => {
    const entry1 = {
      ts: "2026-05-17T00:00:00Z",
      sub: "build",
      topic_hash: "h1",
      lib_hash: "h2",
      tools_granted: ["Read"],
      dispatch_mode: "inline",
      outcome: "success" as const,
      prev_hmac: "",
      hmac: "hmac1",
      gate_result: "n_a" as const,
      cmux_available: null as boolean | null,
      gate_reason: null as GateBlockReason | null,
    };
    const entry2 = {
      ts: "2026-05-17T00:00:01Z",
      sub: "review",
      topic_hash: "h3",
      lib_hash: "h4",
      tools_granted: ["Read", "Glob"],
      dispatch_mode: "fork",
      outcome: "success" as const,
      prev_hmac: "hmac1",
      hmac: "hmac2",
      gate_result: "n_a" as const,
      cmux_available: null as boolean | null,
      gate_reason: null as GateBlockReason | null,
    };

    await appendAuditLog(entry1, { auditDir: TMP_DIR });
    await appendAuditLog(entry2, { auditDir: TMP_DIR });

    const lines = readFileSync(resolve(TMP_DIR, "dispatch.log"), "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    const parsed2 = JSON.parse(lines[1]);
    expect(parsed2.prev_hmac).toBe("hmac1");
  });

  it("does not write to .forge/ directory", async () => {
    await appendAuditLog(
      {
        ts: "2026-05-17T00:00:00Z",
        sub: "test",
        topic_hash: "x",
        lib_hash: "y",
        tools_granted: [],
        dispatch_mode: "inline",
        outcome: "success" as const,
        prev_hmac: "",
        hmac: "h",
        gate_result: "n_a",
        cmux_available: null,
        gate_reason: null,
      },
      { auditDir: TMP_DIR },
    );

    const workspaceAuditDir = resolve(process.cwd(), ".forge/debug");
    expect(existsSync(resolve(workspaceAuditDir, "dispatch.log"))).toBe(false);
  });

  it("writes gate_result fields for cmux-gated entry", async () => {
    await appendAuditLog(
      {
        ts: "2026-05-24T00:00:00Z",
        sub: "forge-cmux-sidebar-sync",
        topic_hash: "g1",
        lib_hash: "",
        tools_granted: [],
        dispatch_mode: "n_a",
        outcome: "rejected" as const,
        prev_hmac: "",
        hmac: "hgate",
        gate_result: "blocked",
        cmux_available: false,
        gate_reason: "socket_missing",
      },
      { auditDir: TMP_DIR },
    );

    const line = readFileSync(resolve(TMP_DIR, "dispatch.log"), "utf-8").trim();
    const parsed = JSON.parse(line);
    expect(parsed.gate_result).toBe("blocked");
    expect(parsed.cmux_available).toBe(false);
    expect(parsed.gate_reason).toBe("socket_missing");
  });

  it("writes n_a gate fields for non-cmux entry", async () => {
    await appendAuditLog(
      {
        ts: "2026-05-24T00:00:01Z",
        sub: "build",
        topic_hash: "n1",
        lib_hash: "lib1",
        tools_granted: ["Read"],
        dispatch_mode: "inline",
        outcome: "success" as const,
        prev_hmac: "",
        hmac: "hna",
        gate_result: "n_a",
        cmux_available: null,
        gate_reason: null,
      },
      { auditDir: TMP_DIR },
    );

    const line = readFileSync(resolve(TMP_DIR, "dispatch.log"), "utf-8").trim();
    const parsed = JSON.parse(line);
    expect(parsed.gate_result).toBe("n_a");
    expect(parsed.cmux_available).toBeNull();
    expect(parsed.gate_reason).toBeNull();
  });
});

// --- REQ-06 (T6): concurrent writes must not interleave/torn ---

describe("R2.7: audit log concurrency [REQ-06]", () => {
  const CONCURRENCY_DIR = resolve(import.meta.dirname, "..", "__audit_concurrency__");

  beforeEach(() => {
    rmSync(CONCURRENCY_DIR, { recursive: true, force: true });
    mkdirSync(CONCURRENCY_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(CONCURRENCY_DIR, { recursive: true, force: true });
  });

  const makeEntry = (i: number) => ({
    ts: "2026-06-23T00:00:00Z",
    sub: "build",
    // pad topic_hash so each entry is a large-ish JSON line (stresses
    // O_APPEND atomicity beyond PIPE_BUF on platforms where it is small)
    topic_hash: `entry-${i}-${"x".repeat(400)}`,
    lib_hash: "lh",
    tools_granted: ["Read", "Bash", "Glob", "Grep"],
    dispatch_mode: "inline",
    outcome: "success" as const,
    prev_hmac: "",
    hmac: `hmac-${i}`,
    gate_result: "n_a" as const,
    cmux_available: null as boolean | null,
    gate_reason: null as GateBlockReason | null,
  });

  it("concurrent appends produce N complete, parseable lines (no torn records)", async () => {
    const N = 40;
    const entries = Array.from({ length: N }, (_, i) => makeEntry(i));

    await Promise.all(entries.map((e) => appendAuditLog(e, { auditDir: CONCURRENCY_DIR })));

    const raw = readFileSync(resolve(CONCURRENCY_DIR, "dispatch.log"), "utf-8");
    const lines = raw.split("\n").filter((l) => l.length > 0);

    // exactly N lines — no interleaving produced extra/fewer lines
    expect(lines).toHaveLength(N);
    // every line is independently parseable JSON (no torn/merged records)
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.sub).toBe("build");
      expect(parsed.hmac).toMatch(/^hmac-\d+$/);
    }
  });

  it("lock file is cleaned up after writes complete", async () => {
    await appendAuditLog(makeEntry(0), { auditDir: CONCURRENCY_DIR });
    // the .lock companion must not linger after a successful write
    expect(existsSync(resolve(CONCURRENCY_DIR, "dispatch.log.lock"))).toBe(false);
  });

  it("uses the shared .lock primitive to serialise writes [REQ-06 contract]", async () => {
    // appendAuditLog must delegate to the same O_EXCL lock primitive that
    // tool-health-writer uses, so concurrent writers are serialised.
    const spy = vi.spyOn(lockHelper, "acquireLockSync");
    await appendAuditLog(makeEntry(0), { auditDir: CONCURRENCY_DIR });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
