import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock child_process so no real agent-browser binary is invoked.
// vi.hoisted ensures the mock fn exists before vi.mock factory runs (hoisting).
const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import { AgentBrowserCliClient, buildOpenArgs } from "../src/agent-browser-client.js";

// Verifies spec R1-AC3 (CLI exec), R3-AC5 (timeout), R4-AC2 (creds via stdin not argv).
// T2.2 RED → GREEN

describe("buildOpenArgs (pure descriptor)", () => {
  it("produces {executable, args} without command string concatenation", () => {
    const d = buildOpenArgs("http://localhost:5173/login", "s1");
    expect(d.executable).toBe("agent-browser");
    expect(d.args).toEqual(["open", "http://localhost:5173/login", "--session", "s1"]);
  });

  it("does NOT include any password/secret literal in args", () => {
    const d = buildOpenArgs("http://localhost:5173", "s1");
    const joined = d.args.join(" ");
    expect(joined).not.toMatch(/password|secret|token/i);
  });
});

describe("AgentBrowserCliClient.open", () => {
  beforeEach(() => execFileMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("calls execFile with the descriptor args", async () => {
    execFileMock.mockImplementation((...rest: unknown[]) => {
      if (rest.length === 0) return;
      const cb = rest[rest.length - 1] as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void;
      cb(null, "", "");
    });
    const c = new AgentBrowserCliClient();
    await c.open("http://localhost:5173/login", "s1");
    expect(execFileMock).toHaveBeenCalledOnce();
    const call = execFileMock.mock.calls[0];
    const cmd = call[0];
    const args = call[1];
    expect(cmd).toBe("agent-browser");
    expect(args).toEqual(["open", "http://localhost:5173/login", "--session", "s1"]);
  });

  it("rejects on timeout (open 15000ms)", async () => {
    // never invoke callback → promise races against timeout
    execFileMock.mockImplementation(() => {});
    const c = new AgentBrowserCliClient({ openTimeoutMs: 30 });
    await expect(c.open("http://localhost:5173", "s1")).rejects.toThrow(/timeout/i);
  });

  it("rejects on non-zero exit (stderr propagated)", async () => {
    execFileMock.mockImplementation((...rest: unknown[]) => {
      if (rest.length === 0) return;
      const cb = rest[rest.length - 1] as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void;
      cb(new Error("agent-browser not found"), "", "spawn error");
    });
    const c = new AgentBrowserCliClient();
    await expect(c.open("http://localhost:5173", "s1")).rejects.toThrow();
  });
});

describe("AgentBrowserCliClient.fill — credentials via stdin not argv", () => {
  beforeEach(() => execFileMock.mockReset());

  it("passes value through input (stdin), never in args", async () => {
    execFileMock.mockImplementation((...rest: unknown[]) => {
      if (rest.length === 0) return;
      const cb = rest[rest.length - 1] as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void;
      cb(null, "", "");
    });
    const c = new AgentBrowserCliClient();
    await c.fill("s1", "e2", "supersecret-password");
    // find the call that has the fill args
    const fillCall = execFileMock.mock.calls.find(
      (cl: unknown[]) => Array.isArray(cl[1]) && (cl[1] as string[])[0] === "fill",
    );
    expect(fillCall).toBeDefined();
    const args = fillCall![1] as string[];
    const opts = fillCall![2] as { input?: string };
    const joined = args.join(" ");
    expect(joined).not.toContain("supersecret-password");
    expect(opts.input).toBe("supersecret-password");
  });
});

describe("AgentBrowserCliClient.snapshot — parses agent-browser JSON", () => {
  beforeEach(() => execFileMock.mockReset());

  it("parses refs/url/title/text from stdout JSON", async () => {
    const json = JSON.stringify({
      url: "http://localhost:5173/dashboard",
      title: "Dashboard",
      text: "Welcome admin",
      elements: [{ ref: "e1", tag: "button", text: "Logout", role: "button" }],
    });
    execFileMock.mockImplementation((...rest: unknown[]) => {
      if (rest.length === 0) return;
      const cb = rest[rest.length - 1] as (
        err: Error | null,
        stdout: string,
        stderr: string,
      ) => void;
      cb(null, json, "");
    });
    const c = new AgentBrowserCliClient();
    const snap = await c.snapshot("s1");
    expect(snap.url).toBe("http://localhost:5173/dashboard");
    expect(snap.title).toBe("Dashboard");
    expect(snap.refs).toEqual([{ ref: "e1", tag: "button", text: "Logout", role: "button" }]);
  });
});
