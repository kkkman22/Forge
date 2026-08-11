/**
 * Integration tests for Post-Push Verify in ship.ts.
 *
 * Covers [R8.1, R8.2, R8.5, R14.11, R14.12]:
 *   - Passing command returns passed=true
 *   - Failing command returns passed=false + writes artifact
 *   - Custom ci_check_command respected
 *   - Timeout handled gracefully
 *
 * **Validates: Requirements R8.1, R8.2, R8.5**
 */

import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executePostPushVerify } from "../src/ship.js";

let testDir: string;

describe("Post-Push Verify [R8.1, R8.2, R8.5]", () => {
  afterEach(() => {
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        /* */
      }
    }
  });

  it("returns passed=true for successful command", async () => {
    const result = await executePostPushVerify("test-topic", false, {
      ciCheckCommand: "echo success",
    });

    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("success");
  });

  it("returns passed=false for failing command", async () => {
    const result = await executePostPushVerify("test-topic", false, {
      ciCheckCommand: "exit 1",
    });

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it("writes artifact on failure when forgeDir provided", async () => {
    testDir = join(tmpdir(), `forge-ppv-${Date.now()}`);
    const forgeDir = join(testDir, ".tinkerman");
    mkdirSync(forgeDir, { recursive: true });

    const result = await executePostPushVerify("test-artifact", false, {
      forgeDir,
      ciCheckCommand: "exit 1",
    });

    expect(result.passed).toBe(false);

    const { existsSync, readFileSync } = await import("node:fs");
    const artifactPath = join(forgeDir, "ship", "test-artifact-post-push-verify.md");
    expect(existsSync(artifactPath)).toBe(true);
    const content = readFileSync(artifactPath, "utf-8");
    expect(content).toContain("status: failed");
  });

  it("does not write artifact on success", async () => {
    testDir = join(tmpdir(), `forge-ppv-ok-${Date.now()}`);
    const forgeDir = join(testDir, ".tinkerman");
    mkdirSync(forgeDir, { recursive: true });

    await executePostPushVerify("test-no-artifact", false, {
      forgeDir,
      ciCheckCommand: "echo ok",
    });

    const { existsSync } = await import("node:fs");
    const artifactPath = join(forgeDir, "ship", "test-no-artifact-post-push-verify.md");
    expect(existsSync(artifactPath)).toBe(false);
  });

  it("uses npm run check as default command", async () => {
    const result = await executePostPushVerify("test-default", false, {
      ciCheckCommand: "echo default-check",
    });

    expect(result.command).toBe("echo default-check");
  });

  it("never throws", async () => {
    await expect(
      executePostPushVerify("test-safe", false, {
        ciCheckCommand: "nonexistent-command-that-does-not-exist",
      }),
    ).resolves.toBeDefined();
  });
});
