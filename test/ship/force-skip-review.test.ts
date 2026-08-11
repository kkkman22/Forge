import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkShipGateWithForceSkip, recordForceSkip, type ShipOptions } from "../../src/ship.js";

const tempDir = join(process.cwd(), ".tinkerman", "findings");

describe("checkShipGateWithForceSkip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Create temp directory for findings files
    try {
      mkdirSync(tempDir, { recursive: true });
    } catch {
      // Directory already exists
    }
  });

  afterEach(() => {
    // Clean up temp files
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("--force-skip-review without reason throws", () => {
    const options: ShipOptions = { forceSkipReview: true };
    const review = { passed: true, p0Count: 0, p1Count: 0 };
    const test = { passed: true };
    const progress = { totalTasks: 5, completedTasks: 5 };

    expect(() => checkShipGateWithForceSkip(review, test, progress, options)).toThrow(
      "--force-skip-review requires --reason='<non-empty>'",
    );
  });

  it("--force-skip-review with empty reason throws", () => {
    const options: ShipOptions = { forceSkipReview: true, forceSkipReason: "   " };
    const review = { passed: true, p0Count: 0, p1Count: 0 };
    const test = { passed: true };
    const progress = { totalTasks: 5, completedTasks: 5 };

    expect(() => checkShipGateWithForceSkip(review, test, progress, options)).toThrow(
      "--force-skip-review requires --reason='<non-empty>'",
    );
  });

  it("--force-skip-review with non-empty reason returns passed + forceSkipped=true", () => {
    const options: ShipOptions = {
      forceSkipReview: true,
      forceSkipReason: "Emergency fix for production incident",
    };
    const review = { passed: false, p0Count: 1, p1Count: 0 };
    const test = { passed: false };
    const progress = { totalTasks: 5, completedTasks: 3 };

    const result = checkShipGateWithForceSkip(review, test, progress, options);

    expect(result.allowed).toBe(true);
    expect(result.reasons).toContain("SKIPPED-BY-FORCE: Emergency fix for production incident");
    expect(result.forceSkipped).toBe(true);
  });

  it("--force-skip-review adds SKIPPED-BY-FORCE to commit message", () => {
    const options: ShipOptions = {
      forceSkipReview: true,
      forceSkipReason: "Emergency fix",
    };
    const review = { passed: false, p0Count: 1, p1Count: 0 };
    const test = { passed: false };
    const progress = { totalTasks: 5, completedTasks: 3 };

    const result = checkShipGateWithForceSkip(review, test, progress, options);

    expect(result.reasons[0]).toContain("SKIPPED-BY-FORCE");
    expect(result.reasons[0]).toContain("Emergency fix");
  });

  it("--force-skip-review writes findings record with commit hash + reason + user", () => {
    const options: ShipOptions = {
      forceSkipReview: true,
      forceSkipReason: "Emergency fix",
    };
    const review = { passed: false, p0Count: 1, p1Count: 0 };
    const test = { passed: false };
    const progress = { totalTasks: 5, completedTasks: 3 };

    const commitHash = "abc123";
    const user = "test-user";

    checkShipGateWithForceSkip(review, test, progress, options);
    recordForceSkip(commitHash, options.forceSkipReason!, user);

    // Check that the findings file was created
    const date = new Date().toISOString().slice(0, 10);
    const findingsPath = join(tempDir, `force-skip-review-${date}.md`);
    const content = readFileSync(findingsPath, "utf-8");

    expect(content).toContain(commitHash);
    expect(content).toContain(options.forceSkipReason);
    expect(content).toContain(user);
  });
});
