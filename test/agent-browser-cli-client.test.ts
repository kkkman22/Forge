import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock child_process so no real agent-browser binary is invoked.
const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import { AgentBrowserCliClient, buildOpenArgs } from "../src/agent-browser-client.js";

// Verifies the CliClient against the REAL agent-browser CLI contract
// (verified by smoke probe: session is a global flag, snapshot -i --json,
// refs are @e1, fill value is in argv). R1-AC3, R3-AC5.

function okCb(stdout = "") {
  return (...rest: unknown[]) => {
    if (rest.length === 0) return;
    const cb = rest[rest.length - 1] as (e: Error | null, o: string, s: string) => void;
    cb(null, stdout, "");
  };
}

describe("buildOpenArgs (pure descriptor) — real CLI: --session is global flag", () => {
  it("produces agent-browser --session <id> open <url>", () => {
    const d = buildOpenArgs("http://localhost:5173/login", "s1");
    expect(d.executable).toBe("agent-browser");
    // REAL: --session is a global flag BEFORE the subcommand.
    expect(d.args).toEqual(["--session", "s1", "open", "http://localhost:5173/login"]);
  });
});

describe("AgentBrowserCliClient.open", () => {
  beforeEach(() => execFileMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("calls execFile with --session global flag", async () => {
    execFileMock.mockImplementation(okCb());
    const c = new AgentBrowserCliClient();
    await c.open("http://localhost:5173/login", "s1");
    expect(execFileMock).toHaveBeenCalledOnce();
    const [, args] = execFileMock.mock.calls[0];
    expect(args).toEqual(["--session", "s1", "open", "http://localhost:5173/login"]);
  });

  it("rejects on timeout", async () => {
    execFileMock.mockImplementation(() => {});
    const c = new AgentBrowserCliClient({ openTimeoutMs: 30 });
    await expect(c.open("http://localhost:5173", "s1")).rejects.toThrow(/timeout/i);
  });
});

describe("AgentBrowserCliClient.snapshot — real -i --json contract", () => {
  beforeEach(() => execFileMock.mockReset());

  it("calls snapshot -i --json and parses the real envelope", async () => {
    // REAL envelope: {success, data:{origin, refs:{e1:{name,role}}, snapshot}, error}
    const json = JSON.stringify({
      success: true,
      data: {
        origin: "http://localhost:5173/dashboard",
        refs: {
          e1: { name: "Logout", role: "button" },
          e2: { name: "Welcome admin", role: "heading" },
        },
        snapshot: '- button "Logout" [ref=e1]\n- heading "Welcome admin" [ref=e2]',
      },
      error: null,
    });
    execFileMock.mockImplementation(okCb(json));
    const c = new AgentBrowserCliClient();
    const snap = await c.snapshot("s1");
    expect(snap.url).toBe("http://localhost:5173/dashboard");
    expect(snap.refs).toEqual([
      { ref: "e1", tag: "", text: "Logout", role: "button" },
      { ref: "e2", tag: "", text: "Welcome admin", role: "heading" },
    ]);
    // text field carries the snapshot text block
    expect(snap.text).toContain("Logout");
  });
});

describe("AgentBrowserCliClient.fill — real CLI: value in argv (not stdin)", () => {
  beforeEach(() => execFileMock.mockReset());

  it("calls fill @<ref> <value> with --session global flag", async () => {
    // NOTE: agent-browser CLI takes the value as a positional argv argument.
    // There is no stdin option (verified via `fill --help`). R4-AC2 is therefore
    // a best-effort: the process is short-lived (fills then exits), mitigating
    // argv exposure to ps/process-list.
    execFileMock.mockImplementation(okCb());
    const c = new AgentBrowserCliClient();
    await c.fill("s1", "e2", "admin");
    const fillCall = execFileMock.mock.calls.find(
      (cl: unknown[]) => Array.isArray(cl[1]) && (cl[1] as string[]).includes("fill"),
    );
    expect(fillCall).toBeDefined();
    const args = fillCall![1] as string[];
    expect(args).toEqual(["--session", "s1", "fill", "@e2", "admin"]);
  });
});

describe("AgentBrowserCliClient.click / get url / screenshot / close", () => {
  beforeEach(() => execFileMock.mockReset());

  it("click uses @ref prefix", async () => {
    execFileMock.mockImplementation(okCb());
    const c = new AgentBrowserCliClient();
    await c.click("s1", "e5");
    const clickCall = execFileMock.mock.calls.find(
      (cl: unknown[]) => Array.isArray(cl[1]) && (cl[1] as string[]).includes("click"),
    );
    expect(clickCall![1] as string[]).toEqual(["--session", "s1", "click", "@e5"]);
  });
});
