/**
 * check-spec-status.mjs — snapshot + behavior tests.
 *
 * T-06 RED: spec status 巡检脚本契约。脚本扫描 .forge/specs/** frontmatter
 * status 字段，输出分布 + warning（缺失/矛盾），只读不改。
 *
 * 对应 spec: .forge/specs/arch-review-remediate-0626 REQ-06。
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts", "check-spec-status.mjs");

/** Run the script against a given specs root, returning {stdout, stderr, status}. */
function runScript(args: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args], {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr: "", status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", status: e.status ?? 1 };
  }
}

describe("check-spec-status.mjs — --help", () => {
  it("--help exits 0 and prints usage", () => {
    const { stdout, status } = runScript(["--help"]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Usage:/);
    expect(stdout.toLowerCase()).toContain("status");
  });
});

describe("check-spec-status.mjs — status distribution scan", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "forge-spec-status-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("reports status distribution across specs", () => {
    mkdirSync(join(tmpRoot, "alpha"), { recursive: true });
    mkdirSync(join(tmpRoot, "beta"), { recursive: true });
    writeFileSync(
      join(tmpRoot, "alpha", "requirements.md"),
      "---\nstatus: approved\nfeature: alpha\n---\n# Alpha\n",
    );
    writeFileSync(
      join(tmpRoot, "beta", "requirements.md"),
      "---\nstatus: draft\nfeature: beta\n---\n# Beta\n",
    );

    const { stdout, status } = runScript([tmpRoot]);
    expect(status).toBe(0);
    expect(stdout).toContain("approved");
    expect(stdout).toContain("draft");
    // Distribution should mention counts
    expect(stdout).toMatch(/\d/);
  });

  it("warns on specs missing status field", () => {
    mkdirSync(join(tmpRoot, "gamma"), { recursive: true });
    writeFileSync(
      join(tmpRoot, "gamma", "requirements.md"),
      "---\nfeature: gamma\n---\n# Gamma (no status)\n",
    );

    const { stdout } = runScript([tmpRoot]);
    // Missing status → warning mentioning the spec
    expect(stdout.toLowerCase()).toMatch(/warn|miss|incomplete/);
    expect(stdout).toContain("gamma");
  });

  it("read-only: does not modify spec files", () => {
    mkdirSync(join(tmpRoot, "delta"), { recursive: true });
    const specPath = join(tmpRoot, "delta", "requirements.md");
    const original = "---\nfeature: delta\n---\n# Delta (no status)\n";
    writeFileSync(specPath, original);

    runScript([tmpRoot]);
    const after = require("node:fs").readFileSync(specPath, "utf-8");
    expect(after).toBe(original);
  });

  it("handles empty specs dir gracefully", () => {
    const { status } = runScript([tmpRoot]);
    expect(status).toBe(0);
  });
});
