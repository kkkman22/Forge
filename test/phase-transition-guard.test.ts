/**
 * Phase Transition Guard — TDD Tests
 *
 * Tests for scripts/phase-transition-guard.sh which detects phase
 * transitions in .forge/status.md and outputs §2.7 reminders.
 *
 * Spec: .forge/specs/phase-auto-advance-enforcement/requirements.md
 * AC: AC-1 through AC-8
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "scripts/phase-transition-guard.sh");
const CACHE_FILE = "/tmp/forge-last-phase";

/** Create .forge/status.md with the given phase in frontmatter */
function createStatusMd(dir: string, phase: string): void {
  const forgeDir = join(dir, ".forge");
  mkdirSync(forgeDir, { recursive: true });
  writeFileSync(
    join(forgeDir, "status.md"),
    `---\ncurrent_task: "test-task"\nphase: "${phase}"\ntier: "full"\n---\n`,
  );
}

/** Create an empty .forge/status.md with no phase field */
function createEmptyStatusMd(dir: string): void {
  const forgeDir = join(dir, ".forge");
  mkdirSync(forgeDir, { recursive: true });
  writeFileSync(join(forgeDir, "status.md"), `---\ncurrent_task: "test-task"\n---\n`);
}

/** Run the guard script in the given directory, return { stdout, exitCode } */
function runGuard(dir: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`bash "${SCRIPT}"`, {
      cwd: dir,
      timeout: 5000,
      encoding: "utf-8",
      env: { ...process.env, HOME: process.env.HOME },
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? "", exitCode: e.status ?? 1 };
  }
}

describe("phase-transition-guard.sh", () => {
  const tmpDir = join("/tmp", "forge-test-phase-guard");

  beforeAll(() => {
    mkdirSync(tmpDir, { recursive: true });
    // Clean cache file before tests
    try {
      rmSync(CACHE_FILE);
    } catch {
      // Ignore if doesn't exist
    }
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true });
    try {
      rmSync(CACHE_FILE);
    } catch {
      // Ignore
    }
  });

  it("AC-1: outputs §2.7 reminder on phase transition build→review", () => {
    // Setup: set cache to "build", then write status.md with "review"
    writeFileSync(CACHE_FILE, "build");
    createStatusMd(tmpDir, "review");

    const result = runGuard(tmpDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("§2.7");
    expect(result.stdout).toContain("build");
    expect(result.stdout).toContain("review");
    expect(result.stdout).toContain("Skill");
  });

  it("AC-2: no output when phase unchanged", () => {
    // Setup: cache matches current phase
    writeFileSync(CACHE_FILE, "build");
    createStatusMd(tmpDir, "build");

    const result = runGuard(tmpDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  it("AC-3: no output when phase transitions to completed", () => {
    writeFileSync(CACHE_FILE, "ship");
    createStatusMd(tmpDir, "completed");

    const result = runGuard(tmpDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  it("AC-4: cache file updated after run", () => {
    writeFileSync(CACHE_FILE, "build");
    createStatusMd(tmpDir, "review");

    runGuard(tmpDir);

    expect(existsSync(CACHE_FILE)).toBe(true);
    const cached = readFileSync(CACHE_FILE, "utf-8").trim();
    expect(cached).toBe("review");
  });

  it("AC-7: exits 0 with no output when status.md missing", () => {
    // Remove .forge directory entirely
    rmSync(join(tmpDir, ".forge"), { recursive: true });

    const result = runGuard(tmpDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  it("AC-8: exits 0 with no output when phase field empty", () => {
    createEmptyStatusMd(tmpDir);

    const result = runGuard(tmpDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  it("AC-6: stale/missing cache causes no crash", () => {
    try {
      rmSync(CACHE_FILE);
    } catch {
      // Already missing
    }
    createStatusMd(tmpDir, "build");

    // First run ever — no cache exists. Should not crash.
    // Since no previous phase, this is not a "transition" — should be silent
    // OR it could emit a reminder since cache="" != "build". Both are acceptable.
    const result = runGuard(tmpDir);

    expect(result.exitCode).toBe(0);
  });
});
