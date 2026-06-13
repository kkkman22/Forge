import { afterEach, describe, expect, it, vi } from "vitest";

// cli.mjs: keep REAL buildRpcArgs is irrelevant here; stub runCli to inspect argv.
vi.mock("../../scripts/cmux-mirror/lib/cli.mjs", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    runCli: vi.fn(async () => ({ exitCode: 0, stdout: "", stderr: "" })),
  };
});

vi.mock("../../scripts/cmux-mirror/lib/availability.mjs", () => ({
  cmuxAvailable: vi.fn(() => true),
}));

import { runCli } from "../../scripts/cmux-mirror/lib/cli.mjs";
import {
  __resetReorderForTest,
  __setReorderSupportedForTest,
  buildReorderArgs,
  probeReorderSupported,
  raiseActiveWorkspace,
} from "../../scripts/cmux-mirror/lib/workspace-reorder.mjs";

const mockedRunCli = vi.mocked(runCli);

afterEach(() => {
  vi.clearAllMocks();
  mockedRunCli.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
  __resetReorderForTest();
});

describe("buildReorderArgs: cmux reorder-workspaces argv (0.64.10+)", () => {
  it("builds a single-ref reorder command", () => {
    const args = buildReorderArgs({ orderRefs: ["workspace:1"] });
    expect(args).toEqual(["reorder-workspaces", "--order", "workspace:1"]);
  });

  it("joins multiple refs with commas (batch leading order)", () => {
    const args = buildReorderArgs({ orderRefs: ["workspace:11", "workspace:1"] });
    expect(args).toEqual(["reorder-workspaces", "--order", "workspace:11,workspace:1"]);
  });

  it("appends --dry-run when requested (resolved-index preview, no apply)", () => {
    const args = buildReorderArgs({ orderRefs: ["workspace:1"], dryRun: true });
    expect(args).toContain("--dry-run");
    expect(args[args.indexOf("--order") + 1]).toBe("workspace:1");
  });

  it("never injects --window (runCli owns global --window injection)", () => {
    const args = buildReorderArgs({ orderRefs: ["workspace:1"], dryRun: true });
    expect(args).not.toContain("--window");
  });

  it("rejects an invalid workspace ref (injection / shell-meta guard)", () => {
    expect(() => buildReorderArgs({ orderRefs: ["workspace:1; rm -rf /"] })).toThrow();
    expect(() => buildReorderArgs({ orderRefs: [""] })).toThrow();
  });
});

describe("probeReorderSupported: offline --help probe", () => {
  it("returns true when `cmux reorder-workspaces --help` succeeds", async () => {
    // /bin/echo ignores its args and exits 0 → simulates a successful --help.
    __resetReorderForTest();
    const ok = await probeReorderSupported("/bin/echo");
    expect(ok).toBe(true);
  });

  it("returns false when --help fails (older cmux without the command)", async () => {
    __resetReorderForTest();
    // /bin/false exits non-zero → simulates "unknown command".
    const ok = await probeReorderSupported("/bin/false");
    expect(ok).toBe(false);
  });

  it("caches the probe result for the process lifetime", async () => {
    __resetReorderForTest();
    await probeReorderSupported("/bin/echo");
    // Second call returns instantly without re-spawning — observable via cache hit.
    const cached = await probeReorderSupported("/bin/false");
    expect(cached).toBe(true);
  });
});

describe("raiseActiveWorkspace: Zero-Impact raise-to-front", () => {
  it("no-ops when there is no active workspace ref (not running inside cmux)", async () => {
    __setReorderSupportedForTest(true);
    const res = await raiseActiveWorkspace({ activeRef: "" });
    expect(res.applied).toBe(false);
    expect(res.reason).toBe("no_active_ref");
    expect(mockedRunCli).not.toHaveBeenCalled();
  });

  it("no-ops when cmux lacks reorder-workspaces (graceful degradation)", async () => {
    __setReorderSupportedForTest(false);
    const res = await raiseActiveWorkspace({ activeRef: "workspace:7" });
    expect(res.applied).toBe(false);
    expect(res.reason).toBe("unsupported");
    expect(mockedRunCli).not.toHaveBeenCalled();
  });

  it("emits exactly one reorder call with the active ref when supported", async () => {
    __setReorderSupportedForTest(true);
    const res = await raiseActiveWorkspace({
      activeRef: "workspace:7",
      windowId: "window:3",
    });
    expect(res.applied).toBe(true);
    expect(res.ref).toBe("workspace:7");
    expect(mockedRunCli).toHaveBeenCalledTimes(1);
    const [args, opts] = mockedRunCli.mock.calls[0];
    expect(args).toEqual(["reorder-workspaces", "--order", "workspace:7"]);
    expect(opts).toMatchObject({ windowId: "window:3" });
  });

  it("reports dispatch_failed (not applied) when the call errors", async () => {
    __setReorderSupportedForTest(true);
    mockedRunCli.mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "boom" });
    const res = await raiseActiveWorkspace({ activeRef: "workspace:7" });
    expect(res.applied).toBe(false);
    expect(res.reason).toBe("dispatch_failed");
  });
});
