/**
 * Tests for rebuild-spec-index.mjs script.
 *
 * Feature: spec-lifecycle-management
 * Requirements: 3.1, 3.2
 *
 * Tests the script's CLI interface and output format.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = "scripts/rebuild-spec-index.mjs";

/** Helper: create a file, ensuring parent directories exist. */
function writeFileSyncRecursive(filePath: string, content: string): void {
  const dir = join(filePath, "..");
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content);
}

/** Helper: create temp dir, copy script, return path. */
function setupTmpDir(prefix: string): string {
  const tmpDir = join(tmpdir(), `forge-test-${prefix}-${Date.now()}`);
  mkdirSync(join(tmpDir, ".kiro", "specs"), { recursive: true });

  const scriptContent = readFileSync(SCRIPT, "utf-8");
  mkdirSync(join(tmpDir, "scripts"), { recursive: true });
  writeFileSync(join(tmpDir, "scripts", "rebuild-spec-index.mjs"), scriptContent);

  return tmpDir;
}

describe("rebuild-spec-index.mjs", () => {
  it("--help prints usage and exits 0", () => {
    const output = execSync(`node ${SCRIPT} --help`, { encoding: "utf-8" });
    expect(output).toContain("rebuild-spec-index.mjs");
    expect(output).toContain("--incremental");
    expect(output).toContain("--check");
    expect(output).toContain("--help");
  });

  it("generates INDEX.md with correct structure", () => {
    const tmpDir = setupTmpDir("gen");
    const specsDir = join(tmpDir, ".kiro", "specs");

    // Create a spec with frontmatter
    writeFileSyncRecursive(
      join(specsDir, "test-spec", "requirements.md"),
      [
        "---",
        "name: test-spec",
        "status: in_progress",
        'created: "2026-05-29"',
        'updated: "2026-05-29"',
        "priority: P1",
        "tier: standard",
        "depends_on:",
        "  - other-spec",
        "---",
        "",
        "# Test Spec",
      ].join("\n"),
    );

    // Create another spec with deferred status
    writeFileSyncRecursive(
      join(specsDir, "deferred-spec", "requirements.md"),
      [
        "---",
        "name: deferred-spec",
        "status: deferred",
        'created: "2026-01-01"',
        'updated: "2026-05-29"',
        'deferred_reason: "Needs review"',
        'deferred_date: "2026-05-29"',
        "---",
        "",
        "# Deferred Spec",
      ].join("\n"),
    );

    // Create an archived spec
    writeFileSyncRecursive(
      join(specsDir, "_archived", "old-spec", "requirements.md"),
      [
        "---",
        "name: old-spec",
        "status: archived",
        "replaced_by:",
        "  - test-spec",
        "---",
        "",
        "# Old Spec",
      ].join("\n"),
    );

    // Create a spec without frontmatter
    writeFileSyncRecursive(
      join(specsDir, "no-fm-spec", "requirements.md"),
      ["# No Frontmatter Spec", "", "Some content."].join("\n"),
    );

    // Run the script from tmpDir
    const tmpScript = join(tmpDir, "scripts", "rebuild-spec-index.mjs");
    const output = execSync(`node ${tmpScript}`, { encoding: "utf-8", cwd: tmpDir });
    expect(output).toContain("INDEX.md updated");

    // Check INDEX.md was generated
    const indexPath = join(specsDir, "INDEX.md");
    expect(existsSync(indexPath)).toBe(true);

    const indexContent = readFileSync(indexPath, "utf-8");

    // Check structure
    expect(indexContent).toContain("# Spec 索引");
    expect(indexContent).toContain("## 统计");
    expect(indexContent).toContain("## 活跃 Spec");
    expect(indexContent).toContain("## 已归档 Spec");

    // Check stats
    expect(indexContent).toMatch(/\| in_progress \| 2 \|/);
    expect(indexContent).toMatch(/\| deferred \| 1 \|/);
    expect(indexContent).toMatch(/\| archived \| 1 \|/);

    // Check active spec entry
    expect(indexContent).toContain("test-spec");
    expect(indexContent).toContain("no-fm-spec");

    // Check deferred section
    expect(indexContent).toContain("## Deferred Spec");
    expect(indexContent).toContain("deferred-spec");
    expect(indexContent).toContain("Needs review");

    // Check archived entry
    expect(indexContent).toContain("old-spec");
    expect(indexContent).toContain("test-spec");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("--check mode exits 0 when INDEX.md is current", () => {
    const tmpDir = setupTmpDir("check-ok");
    const specsDir = join(tmpDir, ".kiro", "specs");

    // Create a minimal spec
    writeFileSyncRecursive(
      join(specsDir, "simple", "requirements.md"),
      [
        "---",
        "name: simple",
        "status: draft",
        'created: "2026-01-01"',
        'updated: "2026-01-01"',
        "---",
        "# Simple",
      ].join("\n"),
    );

    // Run full rebuild first
    const tmpScript = join(tmpDir, "scripts", "rebuild-spec-index.mjs");
    execSync(`node ${tmpScript}`, { cwd: tmpDir });

    // Now run --check
    const output = execSync(`node ${tmpScript} --check`, {
      encoding: "utf-8",
      cwd: tmpDir,
    });
    expect(output).toContain("INDEX.md is up to date");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("--check mode exits 1 when INDEX.md is stale", () => {
    const tmpDir = setupTmpDir("check-stale");
    const specsDir = join(tmpDir, ".kiro", "specs");

    // Create a spec
    writeFileSyncRecursive(
      join(specsDir, "a", "requirements.md"),
      [
        "---",
        "name: a",
        "status: draft",
        'created: "2026-01-01"',
        'updated: "2026-01-01"',
        "---",
        "# A",
      ].join("\n"),
    );

    // Write a stale INDEX.md
    writeFileSync(join(specsDir, "INDEX.md"), "# Stale\n");

    // Run --check -- should fail
    let error: Error | null = null;
    try {
      const tmpScript = join(tmpDir, "scripts", "rebuild-spec-index.mjs");
      execSync(`node ${tmpScript} --check`, { cwd: tmpDir });
    } catch (e) {
      error = e as Error;
    }
    expect(error).not.toBeNull();

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reports validation errors for invalid frontmatter", () => {
    const tmpDir = setupTmpDir("validation");
    const specsDir = join(tmpDir, ".kiro", "specs");

    // Create a spec with invalid status
    writeFileSyncRecursive(
      join(specsDir, "bad-status", "requirements.md"),
      [
        "---",
        "name: bad-status",
        "status: invalid_status",
        'created: "2026-01-01"',
        'updated: "2026-01-01"',
        "---",
        "# Bad",
      ].join("\n"),
    );

    // Run -- should print error to stderr but still generate INDEX
    const tmpScript = join(tmpDir, "scripts", "rebuild-spec-index.mjs");
    const output = execSync(`node ${tmpScript} 2>&1`, { encoding: "utf-8", cwd: tmpDir });
    expect(output).toContain("Frontmatter validation errors");
    expect(output).toContain("invalid status");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("skips _archived and _template directories from active scan", () => {
    const tmpDir = setupTmpDir("skip");
    const specsDir = join(tmpDir, ".kiro", "specs");

    // Create a _template directory that should be skipped
    writeFileSyncRecursive(
      join(specsDir, "_template", "requirements.md"),
      "---\nname: template\n---",
    );

    // Create a regular spec
    writeFileSyncRecursive(
      join(specsDir, "real", "requirements.md"),
      [
        "---",
        "name: real",
        "status: draft",
        'created: "2026-01-01"',
        'updated: "2026-01-01"',
        "---",
        "# Real",
      ].join("\n"),
    );

    const tmpScript = join(tmpDir, "scripts", "rebuild-spec-index.mjs");
    const output = execSync(`node ${tmpScript}`, { encoding: "utf-8", cwd: tmpDir });
    expect(output).toContain("1 active specs");

    const indexContent = readFileSync(join(specsDir, "INDEX.md"), "utf-8");
    expect(indexContent).not.toContain("_template");
    expect(indexContent).toContain("real");

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
