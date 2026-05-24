import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("./availability.mjs", () => ({
  markUnavailable: vi.fn(),
}));

import { execFile } from "node:child_process";
import { runCli } from "../../scripts/cmux-mirror/lib/cli.mjs";

const mockExecFile = vi.mocked(execFile);

function mockExecSuccess(
  _bin: string,
  args: string[],
  _opts: unknown,
  cb: (err: null, stdout: string, stderr: string) => void,
) {
  cb(null, `mock-stdout args=${JSON.stringify(args)}`, "");
}

describe("runCli --window injection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFile.mockImplementation(mockExecSuccess as never);
    delete process.env.CMUX_WINDOW_ID;
  });

  it("never injects --window when CMUX_WINDOW_ID is absent", async () => {
    delete process.env.CMUX_WINDOW_ID;
    await runCli(["status"]);
    expect(mockExecFile).toHaveBeenCalledWith(
      "cmux",
      ["status"],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("never injects --window when CMUX_WINDOW_ID is empty string", async () => {
    process.env.CMUX_WINDOW_ID = "";
    await runCli(["status"]);
    expect(mockExecFile).toHaveBeenCalledWith(
      "cmux",
      ["status"],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("never injects --window when CMUX_WINDOW_ID contains '..'", async () => {
    process.env.CMUX_WINDOW_ID = "../etc/passwd";
    await runCli(["status"]);
    expect(mockExecFile).toHaveBeenCalledWith(
      "cmux",
      ["status"],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("never injects --window when CMUX_WINDOW_ID has non-ASCII chars", async () => {
    process.env.CMUX_WINDOW_ID = "win-中文";
    await runCli(["status"]);
    expect(mockExecFile).toHaveBeenCalledWith(
      "cmux",
      ["status"],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("never injects --window when CMUX_WINDOW_ID exceeds 64 chars", async () => {
    process.env.CMUX_WINDOW_ID = "a".repeat(65);
    await runCli(["status"]);
    expect(mockExecFile).toHaveBeenCalledWith(
      "cmux",
      ["status"],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("never injects --window when CMUX_WINDOW_ID contains spaces", async () => {
    process.env.CMUX_WINDOW_ID = "win-bad space";
    await runCli(["status"]);
    expect(mockExecFile).toHaveBeenCalledWith(
      "cmux",
      ["status"],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("injects --window prefix when CMUX_WINDOW_ID is valid", async () => {
    process.env.CMUX_WINDOW_ID = "win-abc123";
    await runCli(["status"]);
    expect(mockExecFile).toHaveBeenCalledWith(
      "cmux",
      ["--window", "win-abc123", "status"],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("allows opts.windowId to override env", async () => {
    process.env.CMUX_WINDOW_ID = "env-value";
    await runCli(["status"], { windowId: "opt-value" } as never);
    expect(mockExecFile).toHaveBeenCalledWith(
      "cmux",
      ["--window", "opt-value", "status"],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("opts.windowId is validated the same as env", async () => {
    await runCli(["status"], { windowId: "../evil" } as never);
    expect(mockExecFile).toHaveBeenCalledWith(
      "cmux",
      ["status"],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("injects at args[0..1] position (prefix)", async () => {
    process.env.CMUX_WINDOW_ID = "win-xyz";
    await runCli(["notify", "title", "body"]);
    const calledArgs = mockExecFile.mock.calls[0][1] as string[];
    expect(calledArgs[0]).toBe("--window");
    expect(calledArgs[1]).toBe("win-xyz");
    expect(calledArgs.slice(2)).toEqual(["notify", "title", "body"]);
  });

  it("accepts ids with dots, colons, hyphens", async () => {
    process.env.CMUX_WINDOW_ID = "win.abc:def-123";
    await runCli(["status"]);
    expect(mockExecFile).toHaveBeenCalledWith(
      "cmux",
      ["--window", "win.abc:def-123", "status"],
      expect.any(Object),
      expect.any(Function),
    );
  });
});
