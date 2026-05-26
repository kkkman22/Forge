import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RateLimitDegrader } from "../src/rate-limit-degrader.js";

describe("RateLimitDegrader", () => {
  let tmpDir: string;
  let toolHealthPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `rld-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    toolHealthPath = join(tmpDir, "tool-health.md");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // AC 4.1: 3 consecutive 429s degrade limit: 6→3, 3→2, 2→1
  // -----------------------------------------------------------------------
  it("degrades concurrency on consecutive 429s: 6→3→2→1", () => {
    const degrader = new RateLimitDegrader(6, toolHealthPath, "review");

    expect(degrader.getCurrentLimit()).toBe(6);

    const limit1 = degrader.on429();
    expect(limit1).toBe(3);
    expect(degrader.getCurrentLimit()).toBe(3);

    const limit2 = degrader.on429();
    expect(limit2).toBe(2);
    expect(degrader.getCurrentLimit()).toBe(2);

    const limit3 = degrader.on429();
    expect(limit3).toBe(1);
    expect(degrader.getCurrentLimit()).toBe(1);
  });

  // -----------------------------------------------------------------------
  // AC 4.6: 4th 429 → limit stays at 1 (no further degradation)
  // -----------------------------------------------------------------------
  it("does not degrade below 1 after more 429s", () => {
    const degrader = new RateLimitDegrader(6, toolHealthPath, "review");

    degrader.on429(); // 6→3
    degrader.on429(); // 3→2
    degrader.on429(); // 2→1
    const limit4 = degrader.on429(); // stays 1

    expect(limit4).toBe(1);
    expect(degrader.getCurrentLimit()).toBe(1);
  });

  // -----------------------------------------------------------------------
  // AC 4.3: reset() restores initial limit
  // -----------------------------------------------------------------------
  it("resets to initial limit after reset()", () => {
    const degrader = new RateLimitDegrader(6, toolHealthPath, "review");

    degrader.on429(); // 6→3
    degrader.on429(); // 3→2
    expect(degrader.getCurrentLimit()).toBe(2);

    degrader.reset();
    expect(degrader.getCurrentLimit()).toBe(6);
  });

  // -----------------------------------------------------------------------
  // AC 4.4: tool-health.md has correct entries after 429s
  // -----------------------------------------------------------------------
  it("appends degradation entries to tool-health.md", () => {
    const degrader = new RateLimitDegrader(6, toolHealthPath, "review");

    degrader.on429(); // 6→3
    degrader.on429(); // 3→2
    degrader.on429(); // 2→1

    expect(existsSync(toolHealthPath)).toBe(true);
    const content = readFileSync(toolHealthPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(3);

    // Verify format: <iso-date> · review · 429-degrade · old=<n> new=<n> probe=none
    const pattern =
      /^\d{4}-\d{2}-\d{2}T[\d:.]+Z · review · 429-degrade · old=\d+ new=\d+ probe=none$/;
    for (const line of lines) {
      expect(line).toMatch(pattern);
    }

    // Verify specific old/new values
    expect(lines[0]).toContain("old=6 new=3");
    expect(lines[1]).toContain("old=3 new=2");
    expect(lines[2]).toContain("old=2 new=1");
  });

  // -----------------------------------------------------------------------
  // AC 4.5 (unit): rapid concurrent writes produce complete records
  // -----------------------------------------------------------------------
  it("writes complete records when called rapidly (no interleaving)", () => {
    const degrader = new RateLimitDegrader(6, toolHealthPath, "review");

    // Fire 20 on429 calls in a tight loop (only 3 actually degrade, rest stay at 1)
    for (let i = 0; i < 20; i++) {
      degrader.on429();
    }

    expect(existsSync(toolHealthPath)).toBe(true);
    const content = readFileSync(toolHealthPath, "utf-8");
    const lines = content.trim().split("\n");

    // All 20 calls should produce lines
    expect(lines.length).toBe(20);

    // Every line must be complete (match the format pattern)
    const pattern =
      /^\d{4}-\d{2}-\d{2}T[\d:.]+Z · review · 429-degrade · old=\d+ new=\d+ probe=none$/;
    for (const line of lines) {
      expect(line).toMatch(pattern);
    }
  });

  // -----------------------------------------------------------------------
  // Additional: reset allows fresh degradation cycle
  // -----------------------------------------------------------------------
  it("starts fresh degradation cycle after reset()", () => {
    const degrader = new RateLimitDegrader(6, toolHealthPath, "review");

    degrader.on429(); // 6→3
    degrader.on429(); // 3→2
    degrader.reset();
    expect(degrader.getCurrentLimit()).toBe(6);

    // Fresh cycle
    const limit = degrader.on429();
    expect(limit).toBe(3);
    expect(degrader.getCurrentLimit()).toBe(3);
  });
});
