import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { appendAuditLog } from "../../src/forge-dispatcher/audit-log.js";

const TMP_DIR = resolve(import.meta.dirname, "..", "__audit_tmp__");

describe("R2.7: audit log out of workspace", () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("writes NDJSON to designated audit directory", async () => {
    await appendAuditLog({
      ts: "2026-05-17T00:00:00Z",
      sub: "build",
      topic_hash: "abc123",
      lib_hash: "def456",
      tools_granted: ["Read", "Bash"],
      dispatch_mode: "inline",
      outcome: "success",
      prev_hmac: "",
      hmac: "hmac1",
    }, { auditDir: TMP_DIR });

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
      outcome: "success",
      prev_hmac: "",
      hmac: "hmac1",
    };
    const entry2 = {
      ts: "2026-05-17T00:00:01Z",
      sub: "review",
      topic_hash: "h3",
      lib_hash: "h4",
      tools_granted: ["Read", "Glob"],
      dispatch_mode: "fork",
      outcome: "success",
      prev_hmac: "hmac1",
      hmac: "hmac2",
    };

    await appendAuditLog(entry1, { auditDir: TMP_DIR });
    await appendAuditLog(entry2, { auditDir: TMP_DIR });

    const lines = readFileSync(resolve(TMP_DIR, "dispatch.log"), "utf-8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(2);
    const parsed2 = JSON.parse(lines[1]);
    expect(parsed2.prev_hmac).toBe("hmac1");
  });

  it("does not write to .forge/ directory", async () => {
    await appendAuditLog({
      ts: "2026-05-17T00:00:00Z",
      sub: "test",
      topic_hash: "x",
      lib_hash: "y",
      tools_granted: [],
      dispatch_mode: "inline",
      outcome: "success",
      prev_hmac: "",
      hmac: "h",
    }, { auditDir: TMP_DIR });

    const workspaceAuditDir = resolve(process.cwd(), ".forge/debug");
    expect(existsSync(resolve(workspaceAuditDir, "dispatch.log"))).toBe(false);
  });
});
