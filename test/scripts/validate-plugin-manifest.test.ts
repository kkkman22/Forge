import { type ExecFileSyncOptionsWithStringEncoding, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const SCRIPT = join(ROOT, "scripts", "validate-plugin-manifest.mjs");

function runScript(cwd: string): { stdout: string; stderr: string; status: number } {
  const opts: ExecFileSyncOptionsWithStringEncoding = {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  };
  try {
    const stdout = execFileSync("node", [SCRIPT], opts);
    return { stdout, stderr: "", status: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
      status: err.status ?? 1,
    };
  }
}

describe("validate-plugin-manifest.mjs (R1.5)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "forge-validate-"));
    mkdirSync(join(tmp, ".claude-plugin"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("AC 1.5: exits non-zero with 'workflow load failed' when workflows/ missing", () => {
    writeFileSync(
      join(tmp, ".claude-plugin", "plugin.json"),
      JSON.stringify({
        name: "forge",
        version: "2.6.0",
        workflows: ["./workflows"],
      }),
    );
    const result = runScript(tmp);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("workflow load failed");
  });

  it("AC 1.5: exits non-zero when declared workflow file has syntax error", () => {
    writeFileSync(
      join(tmp, ".claude-plugin", "plugin.json"),
      JSON.stringify({
        name: "forge",
        version: "2.6.0",
        workflows: ["./workflows"],
      }),
    );
    mkdirSync(join(tmp, "workflows"));
    writeFileSync(join(tmp, "workflows", "broken.js"), "this is ((( not js");
    const result = runScript(tmp);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("workflow load failed");
  });

  it("AC 1.5: exits zero when plugin has valid workflows directory", () => {
    writeFileSync(
      join(tmp, ".claude-plugin", "plugin.json"),
      JSON.stringify({
        name: "forge",
        version: "2.6.0",
        workflows: ["./workflows"],
      }),
    );
    mkdirSync(join(tmp, "workflows"));
    writeFileSync(
      join(tmp, "workflows", "noop.js"),
      "module.exports = { meta: { name: 'noop' }, run: async () => {} };\n",
    );
    const result = runScript(tmp);
    expect(result.status).toBe(0);
  });

  it("AC 1.5: skips workflow validation when manifest has no workflows field", () => {
    writeFileSync(
      join(tmp, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "forge", version: "2.6.0" }),
    );
    const result = runScript(tmp);
    expect(result.status).toBe(0);
  });
});
