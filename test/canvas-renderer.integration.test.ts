/**
 * Integration test: canvas renderer produces correct HTML.
 *
 * **Validates: Requirements R4.1, R4.4, R4.7, R4.9**
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderCanvas } from "../src/canvas-renderer.js";

let testDir: string;

function setup(cwd: string, topic: string): void {
  const reviewsDir = join(cwd, ".tinkerman", "reviews");
  mkdirSync(reviewsDir, { recursive: true });
  writeFileSync(join(reviewsDir, `${topic}.md`), "# Review\n\nFindings here");
}

describe("Canvas renderer integration [R4.1, R4.4]", () => {
  afterEach(() => {
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        /* */
      }
    }
  });

  it("produces HTML with three columns and JSON island", async () => {
    testDir = join(tmpdir(), `forge-canvas-int-${Date.now()}`);
    setup(testDir, "test");

    const result = await renderCanvas({
      topic: "test",
      cwd: testDir,
      forgeDir: join(testDir, ".tinkerman"),
      findings: {
        spec: [{ severity: "P1", file: "a.ts", issue: "Missing spec", suggestion: "Add spec" }],
        quality: [{ severity: "P2", file: "b.ts", issue: "Dup code", suggestion: "Extract" }],
        security: [
          { severity: "P0", file: "c.ts", issue: "SQL injection", suggestion: "Parameterize" },
        ],
      },
    });

    expect(result.html).toContain("spec-check");
    expect(result.html).toContain("quality-check");
    expect(result.html).toContain("security-check");
    expect(result.html).toContain("findings-data");
    expect(result.html).toContain("Missing spec");
    expect(result.html).toContain("Dup code");
    expect(result.html).toContain("SQL injection");
    expect(existsSync(result.outputPath)).toBe(true);
  });

  it("blocks when review file missing [R4.7]", async () => {
    testDir = join(tmpdir(), `forge-canvas-noreview-${Date.now()}`);
    mkdirSync(join(testDir, ".tinkerman", "reviews"), { recursive: true });

    await expect(
      renderCanvas({
        topic: "nonexistent",
        cwd: testDir,
        forgeDir: join(testDir, ".tinkerman"),
        findings: { spec: [], quality: [], security: [] },
      }),
    ).rejects.toThrow("Run /tinkerman review first");
  });

  it("completes in under 5 seconds [R4.9]", async () => {
    testDir = join(tmpdir(), `forge-canvas-perf-${Date.now()}`);
    setup(testDir, "perf");

    // Generate 50 findings across 3 layers
    const makeFindings = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        severity: "P2",
        file: `file${i}.ts`,
        issue: `Issue ${i}: some finding text here`,
        suggestion: `Fix suggestion ${i}`,
      }));

    const start = performance.now();
    await renderCanvas({
      topic: "perf",
      cwd: testDir,
      forgeDir: join(testDir, ".tinkerman"),
      findings: {
        spec: makeFindings(17),
        quality: makeFindings(17),
        security: makeFindings(16),
      },
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
  });
});
