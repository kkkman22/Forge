/**
 * Test: empty reviews produce "no findings" placeholder.
 *
 * **Validates: Requirements R14.5, R14.7**
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderCanvas } from "../src/canvas-renderer.js";

let testDir: string;

describe("Canvas empty reviews [R14.5, R14.7]", () => {
  afterEach(() => {
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        /* */
      }
    }
  });

  it("shows no-findings placeholder when findings are empty", async () => {
    testDir = join(tmpdir(), `forge-canvas-empty-${Date.now()}`);
    const forgeDir = join(testDir, ".tinkerman");
    mkdirSync(join(forgeDir, "reviews"), { recursive: true });
    writeFileSync(join(forgeDir, "reviews", "empty.md"), "# Review");

    const result = await renderCanvas({
      topic: "empty",
      cwd: testDir,
      forgeDir,
      findings: { spec: [], quality: [], security: [] },
    });

    // The JSON island should contain empty arrays
    expect(result.html).toContain("No findings");
  });

  it("succeeds with success status when file exists but has no parsed findings", async () => {
    testDir = join(tmpdir(), `forge-canvas-noparse-${Date.now()}`);
    const forgeDir = join(testDir, ".tinkerman");
    mkdirSync(join(forgeDir, "reviews"), { recursive: true });
    writeFileSync(
      join(forgeDir, "reviews", "noparse.md"),
      "# Empty Review\n\nNo findings to report.",
    );

    const result = await renderCanvas({
      topic: "noparse",
      cwd: testDir,
      forgeDir,
      findings: { spec: [], quality: [], security: [] },
    });

    expect(result.html).toContain("No findings");
    expect(existsSync(result.outputPath)).toBe(true);
  });
});
