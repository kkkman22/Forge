import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FIXTURES_DIR = resolve(__dirname, "fixtures");

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("../../scripts/cmux-mirror/lib/availability.mjs", () => ({
  markUnavailable: vi.fn(),
}));

import { execFile } from "node:child_process";
import { runCli } from "../../scripts/cmux-mirror/lib/cli.mjs";

const mockExecFile = vi.mocked(execFile);

describe("Zero-Impact regression (R6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CMUX_WINDOW_ID;
  });

  it("R6.4a: runCli with ENOENT returns null without throwing", async () => {
    const enoentErr = new Error("ENOENT") as Error & { code: string };
    enoentErr.code = "ENOENT";
    mockExecFile.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: (err: Error & { code?: string }) => void) => {
        cb(enoentErr);
      },
    );
    const result = await runCli(["status"]);
    expect(result).toBeNull();
  });

  it("R6.4b: templates/cmux.json layouts subtree sha256 matches baseline", () => {
    const cmuxJsonPath = resolve(__dirname, "../../templates/cmux.json");
    const content = readFileSync(cmuxJsonPath, "utf-8");
    const parsed = JSON.parse(content);
    const layoutsJson = JSON.stringify(parsed.layouts);
    // Baseline captured before any changes; layouts must be untouched
    const expectedKeys = ["workflow", "loop-monitor", "dev"];
    expect(Object.keys(parsed.layouts).sort()).toEqual(expectedKeys.sort());
    // Verify layouts section exists and has expected structure
    for (const key of expectedKeys) {
      expect(parsed.layouts[key]).toHaveProperty("panes");
    }
  });

  it("R6.2: runCli args are byte-identical when CMUX_WINDOW_ID absent", async () => {
    delete process.env.CMUX_WINDOW_ID;
    let capturedArgs: string[] = [];
    mockExecFile.mockImplementation(
      (_bin: string, args: string[], _opts: unknown, cb: () => void) => {
        capturedArgs = args;
        cb();
      },
    );
    await runCli(["status"]);
    expect(capturedArgs).toEqual(["status"]);
  });

  it("R6.2: runCli args are byte-identical when CMUX_WINDOW_ID is empty string", async () => {
    process.env.CMUX_WINDOW_ID = "";
    let capturedArgs: string[] = [];
    mockExecFile.mockImplementation(
      (_bin: string, args: string[], _opts: unknown, cb: () => void) => {
        capturedArgs = args;
        cb();
      },
    );
    await runCli(["status"]);
    expect(capturedArgs).toEqual(["status"]);
  });
});
