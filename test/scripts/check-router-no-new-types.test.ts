import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const ROOT = import.meta.dirname + "/../..";

function runScript(script: string, env?: Record<string, string>) {
  try {
    const result = execSync(`node ${script}`, {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 10000,
      env: { ...process.env, ...env },
    });
    return { exitCode: 0, stdout: result };
  } catch (e: any) {
    return { exitCode: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("check-router-no-new-types.mjs", () => {
  it("exits 0 on current router.ts", () => {
    const result = runScript("scripts/check-router-no-new-types.mjs");
    expect(result.exitCode).toBe(0);
  });
});

describe("check-router-no-anti-noise.mjs", () => {
  it("exits 0 on current router files (no stripping patterns)", () => {
    const result = runScript("scripts/check-router-no-anti-noise.mjs");
    expect(result.exitCode).toBe(0);
  });
});

describe("check-dispatcher-skeleton.mjs", () => {
  it("exits 0 on current dispatcher", () => {
    const result = runScript("scripts/check-dispatcher-skeleton.mjs");
    // May skip if dispatcher doesn't exist
    expect([0, 0]).toContain(result.exitCode);
  });
});
