import { describe, expect, it } from "vitest";
import { execCommand, execCommandTracked } from "../../src/mcp/tools/forge-exec.js";

// These tests exercise the real subprocess branches of execCommand /
// execCommandTracked using fast, safe commands (echo/true/false/sleep). No
// mocking needed — the branches are about exit-code/timeout/stdio handling,
// which only real subprocesses exercise faithfully.

describe("execCommand (subprocess branch coverage)", () => {
  it("runs a simple command and captures stdout", async () => {
    const r = await execCommand("echo hello", 5000);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("hello");
    expect(r.timedOut).toBe(false);
  });

  it("captures non-zero exit code (false command)", async () => {
    const r = await execCommand("false", 5000);
    expect(r.exitCode).not.toBe(0);
    expect(r.timedOut).toBe(false);
  });

  it("runs a complex command via /bin/sh -c (shell metachar)", async () => {
    const r = await execCommand("echo a && echo b", 5000);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("a");
    expect(r.stdout).toContain("b");
  });

  it("reports timedOut=true when the command exceeds the timeout", async () => {
    const r = await execCommand("sleep 5", 200);
    expect(r.timedOut).toBe(true);
  });

  it("respects the cwd option", async () => {
    const r = await execCommand("pwd", 5000, { cwd: "/tmp" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("tmp");
  });

  it("captures stderr", async () => {
    const r = await execCommand("echo oops 1>&2", 5000);
    expect(r.exitCode).toBe(0);
    expect(r.stderr.trim()).toBe("oops");
  });
});

describe("execCommandTracked (subprocess + reap branch coverage)", () => {
  it("runs a simple command and captures stdout + exit code", async () => {
    const r = await execCommandTracked("echo tracked", {
      timeoutMs: 5000,
      reapGraceMs: 50,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("tracked");
    expect(r.timedOut).toBe(false);
  });

  it("captures non-zero exit code", async () => {
    const r = await execCommandTracked("false", { timeoutMs: 5000, reapGraceMs: 50 });
    expect(r.exitCode).not.toBe(0);
  });

  it("reports timedOut=true + kills the process group on timeout", async () => {
    const r = await execCommandTracked("sleep 10", { timeoutMs: 200, reapGraceMs: 50 });
    expect(r.timedOut).toBe(true);
  }, 10000);

  it("runs a complex command via /bin/sh -c", async () => {
    const r = await execCommandTracked("echo x && echo y", {
      timeoutMs: 5000,
      reapGraceMs: 50,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("x");
    expect(r.stdout).toContain("y");
  });

  it("captures stderr", async () => {
    const r = await execCommandTracked("echo err 1>&2", { timeoutMs: 5000, reapGraceMs: 50 });
    expect(r.stderr.trim()).toBe("err");
  });

  it("respects cwd option", async () => {
    const r = await execCommandTracked("pwd", {
      timeoutMs: 5000,
      reapGraceMs: 50,
      cwd: "/tmp",
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("tmp");
  });
});
