import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../scripts/cmux-mirror/lib/cli.mjs", () => ({
  runCli: vi.fn(async () => ({ exitCode: 0, stdout: "ok", stderr: "" })),
}));

vi.mock("../../scripts/cmux-mirror/lib/availability.mjs", () => ({
  cmuxAvailable: vi.fn(() => true),
}));

import { runBrowserQa } from "../../scripts/cmux-mirror/browser-qa.mjs";
import { cmuxAvailable } from "../../scripts/cmux-mirror/lib/availability.mjs";
import { runCli } from "../../scripts/cmux-mirror/lib/cli.mjs";

const mockedRunCli = vi.mocked(runCli);
const mockedAvailable = vi.mocked(cmuxAvailable);
const TMP_DIR = join(process.cwd(), "test", ".browser-qa-tmp");

describe("browser-qa.mjs (R8.1–R8.9)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockedRunCli.mockResolvedValue({ exitCode: 0, stdout: "ok", stderr: "" });
    mockedAvailable.mockReturnValue(true);
    if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true });
  });

  it("returns inconclusive when cmux unavailable (R8.1)", async () => {
    mockedAvailable.mockReturnValue(false);
    const result = await runBrowserQa({ forgeDir: TMP_DIR });
    expect(result.verdict).toBe("inconclusive");
  });

  it("returns inconclusive when browser command unsupported (R8.2)", async () => {
    mkdirSync(TMP_DIR, { recursive: true });
    mockedRunCli.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "unknown command" });
    const result = await runBrowserQa({ forgeDir: TMP_DIR });
    expect(result.verdict).toBe("inconclusive");
  });

  it("returns pass when all steps succeed (R8.3)", async () => {
    mkdirSync(TMP_DIR, { recursive: true });
    const result = await runBrowserQa({ forgeDir: TMP_DIR });
    expect(result.verdict).toBe("pass");
  });

  it("returns fail when a step fails (R8.4)", async () => {
    mkdirSync(TMP_DIR, { recursive: true });
    let callCount = 0;
    mockedRunCli.mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        return { exitCode: 1, stdout: "", stderr: "assertion failed" };
      }
      return { exitCode: 0, stdout: "ok", stderr: "" };
    });

    const result = await runBrowserQa({ forgeDir: TMP_DIR });
    expect(result.verdict).toBe("fail");
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it("writes verdict artifact to .tinkerman/ (R8.5)", async () => {
    mkdirSync(TMP_DIR, { recursive: true });
    await runBrowserQa({ forgeDir: TMP_DIR, writeArtifact: true });

    const artifact = join(TMP_DIR, ".cmux-browser-qa.json");
    expect(existsSync(artifact)).toBe(true);
    const parsed = JSON.parse(readFileSync(artifact, "utf-8"));
    expect(parsed).toHaveProperty("verdict");
    expect(parsed).toHaveProperty("timestamp");
    expect(parsed).toHaveProperty("steps");
  });

  it("skips gracefully on EPIPE / null result (R8.6)", async () => {
    mkdirSync(TMP_DIR, { recursive: true });
    mockedRunCli.mockResolvedValue(null);
    const result = await runBrowserQa({ forgeDir: TMP_DIR });
    expect(result.verdict).toBe("inconclusive");
  });

  it("result has valid verdict type (R8.7)", async () => {
    mkdirSync(TMP_DIR, { recursive: true });
    const result = await runBrowserQa({ forgeDir: TMP_DIR });
    expect(["pass", "fail", "inconclusive"]).toContain(result.verdict);
  });

  it("never throws — errors produce inconclusive (R8.8)", async () => {
    mkdirSync(TMP_DIR, { recursive: true });
    mockedRunCli.mockRejectedValue(new Error("unexpected"));
    const result = await runBrowserQa({ forgeDir: TMP_DIR });
    expect(result.verdict).toBe("inconclusive");
  });
});
