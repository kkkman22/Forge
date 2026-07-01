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

// ── T-09 (gap-remediate-0630): directory-level counting ──
describe("check-spec-status.mjs — T-09 directory-level counting", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "forge-spec-status-t09-"));
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("counts per-DIRECTORY not per-file: a spec with 3 files counts once", () => {
    mkdirSync(join(tmpRoot, "spec-a"), { recursive: true });
    for (const f of ["requirements.md", "design.md", "tasks.md"]) {
      writeFileSync(join(tmpRoot, "spec-a", f), `---\nstatus: locked\nname: spec-a\n---\nbody`);
    }
    const { stdout } = runScript([tmpRoot]);
    const lockedLine = stdout.match(/^\s*locked:\s*(\d+)/m);
    expect(lockedLine, "locked count line present").not.toBeNull();
    expect(Number(lockedLine![1])).toBe(1); // not 3
  });

  it("requirements.md status wins as representative (rogue design/tasks ignored)", () => {
    mkdirSync(join(tmpRoot, "spec-b"), { recursive: true });
    writeFileSync(
      join(tmpRoot, "spec-b", "requirements.md"),
      `---\nstatus: completed\nname: spec-b\n---\nbody`,
    );
    writeFileSync(join(tmpRoot, "spec-b", "design.md"), `---\nstatus: locked\n---\nbody`);
    writeFileSync(join(tmpRoot, "spec-b", "tasks.md"), `---\nstatus: approved\n---\nbody`);
    const { stdout } = runScript([tmpRoot]);
    const completedLine = stdout.match(/^\s*completed:\s*(\d+)/m);
    expect(completedLine).not.toBeNull();
    expect(Number(completedLine![1])).toBe(1);
    // locked must still be 0 here (spec-b's design=locked must NOT count)
    const lockedLine = stdout.match(/^\s*locked:\s*(\d+)/m);
    const lockedCount = lockedLine ? Number(lockedLine[1]) : 0;
    expect(lockedCount).toBe(0);
  });

  it("excludes _archived/ from the main distribution", () => {
    mkdirSync(join(tmpRoot, "_archived", "old"), { recursive: true });
    writeFileSync(
      join(tmpRoot, "_archived", "old", "requirements.md"),
      `---\nstatus: archived\n---\nbody`,
    );
    const { stdout } = runScript([tmpRoot]);
    const archivedLine = stdout.match(/^\s*archived:\s*(\d+)/m);
    const archivedCount = archivedLine ? Number(archivedLine[1]) : 0;
    expect(archivedCount).toBe(0); // _archived excluded from main counts
  });
});

// ── T-11 (gap-remediate-0630): rogue status field regression guard ──
describe("check-spec-status.mjs — T-11 rogue status field guard", () => {
  it("flags design.md/tasks.md carrying a status field as rogue", () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "forge-spec-status-t11-"));
    try {
      mkdirSync(join(tmpRoot, "spec-c"), { recursive: true });
      writeFileSync(
        join(tmpRoot, "spec-c", "requirements.md"),
        `---\nstatus: approved\nname: spec-c\n---\nbody`,
      );
      writeFileSync(join(tmpRoot, "spec-c", "design.md"), `---\nstatus: locked\n---\nbody`);
      writeFileSync(join(tmpRoot, "spec-c", "tasks.md"), `---\nstatus: approved\n---\nbody`);
      const { stdout } = runScript([tmpRoot]);
      // rogue status field must be surfaced (warning) for design.md + tasks.md
      expect(stdout).toMatch(/rogue status/i);
      expect(stdout).toContain("spec-c/design.md");
      expect(stdout).toContain("spec-c/tasks.md");
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
