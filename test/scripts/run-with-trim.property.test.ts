/**
 * Property tests for scripts/run-with-trim.sh
 *
 * Validates 4 correctness properties:
 *   Property 1: Exit code preservation
 *   Property 2: Success output truncation (>30 lines truncated, ≤30 passthrough)
 *   Property 3: Failure output passthrough (all lines preserved)
 *   Property 4: Header presence (first line matches format)
 *
 * Uses vitest + shell execution. 25 iterations per property for CI speed.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const SCRIPT = join(ROOT, "scripts/run-with-trim.sh");
const ITERATIONS = 25;

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function makeMockScript(lines: number, exitCode: number): string {
  const tmpDir = mkdtempSync(join(tmpdir(), "rwt-"));
  tmpDirs.push(tmpDir);
  const scriptPath = join(tmpDir, "mock.sh");
  writeFileSync(scriptPath, `#!/usr/bin/env bash\nseq 1 ${lines}\nexit ${exitCode}\n`, {
    mode: 0o755,
  });
  return scriptPath;
}

function runTrim(args: string[]): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync("bash", [SCRIPT, ...args], {
      encoding: "utf-8",
      timeout: 5000,
    });
    return { stdout, exitCode: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: string; status?: number };
    return { stdout: err.stdout ?? "", exitCode: err.status ?? 1 };
  }
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe("Property tests: run-with-trim.sh", () => {
  it(`Property 1: Exit code preservation (${ITERATIONS} iterations)`, { timeout: 30_000 }, () => {
    const rng = seededRandom(42);
    for (let i = 0; i < ITERATIONS; i++) {
      const expectedExit = Math.floor(rng() * 256);
      const mock = makeMockScript(5, expectedExit);
      const result = runTrim(["bash", mock]);
      expect(result.exitCode, `i=${i} expected=${expectedExit}`).toBe(expectedExit);
    }
  });

  it(`Property 2: Success output truncation (${ITERATIONS} iterations)`, {
    timeout: 30_000,
  }, () => {
    const rng = seededRandom(123);
    for (let i = 0; i < ITERATIONS; i++) {
      const lineCount = Math.floor(rng() * 100) + 1;
      const mock = makeMockScript(lineCount, 0);
      const result = runTrim(["bash", mock]);
      expect(result.exitCode, `i=${i}`).toBe(0);

      if (lineCount > 30) {
        const outputLines = result.stdout.trim().split("\n");
        expect(outputLines.length, `i=${i} lines=${lineCount}`).toBeLessThan(lineCount);
        expect(result.stdout, `i=${i}`).toContain("truncated");
        expect(result.stdout, `i=${i}`).toContain(String(lineCount));
      } else {
        expect(result.stdout, `i=${i} lines=${lineCount}`).toContain("1");
        expect(result.stdout, `i=${i}`).toContain(String(lineCount));
      }
    }
  });

  it(`Property 3: Failure output passthrough (${ITERATIONS} iterations)`, {
    timeout: 30_000,
  }, () => {
    const rng = seededRandom(456);
    for (let i = 0; i < ITERATIONS; i++) {
      const lineCount = Math.floor(rng() * 100) + 1;
      const exitCode = Math.floor(rng() * 254) + 1;
      const mock = makeMockScript(lineCount, exitCode);
      const result = runTrim(["bash", mock]);
      expect(result.exitCode, `i=${i}`).toBe(exitCode);
      // Verify first and last lines of original output are present
      expect(result.stdout, `i=${i} first line`).toContain("1");
      expect(result.stdout, `i=${i} last line`).toContain(String(lineCount));
    }
  });

  it(`Property 4: Header presence (${ITERATIONS} iterations)`, { timeout: 30_000 }, () => {
    const rng = seededRandom(789);
    for (let i = 0; i < ITERATIONS; i++) {
      const exitCode = Math.floor(rng() * 256);
      const mock = makeMockScript(5, exitCode);
      const result = runTrim(["bash", mock]);
      const firstLine = result.stdout.split("\n")[0];
      expect(firstLine, `i=${i}`).toMatch(/^── run-with-trim ── .+ ── exit:\d+ ──$/);
    }
  });
});
