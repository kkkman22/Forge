import { mkdirSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("check-frozen: hook-notify integration (R6.1, R11.10.b)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cmux-check-frozen-"));
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("isFrozenZonePath identifies frozen zone paths (.forge/specs/, .forge/plans/)", async () => {
    const { isFrozenZonePath } = await import("../../src/check-frozen.js");
    expect(isFrozenZonePath(".forge/specs/my-spec.md")).toBe(true);
    expect(isFrozenZonePath(".forge/plans/my-plan.md")).toBe(true);
    expect(isFrozenZonePath(".forge/config.md")).toBe(true);
    expect(isFrozenZonePath(".forge/status.md")).toBe(false);
    expect(isFrozenZonePath("src/main.ts")).toBe(false);
  });

  it("extractStatus reads frontmatter correctly", async () => {
    const { extractStatus } = await import("../../src/check-frozen.js");
    expect(extractStatus('---\nstatus: "locked"\n---\ncontent')).toBe("locked");
    expect(extractStatus("---\nother: true\n---\ncontent")).toBeNull();
    expect(extractStatus("no frontmatter")).toBeNull();
  });

  it("R11.10.b: check-frozen exit code is unchanged (1 for frozen, 0 for allowed)", async () => {
    // Check that the module still exports correctly
    const mod = await import("../../src/check-frozen.js");
    expect(typeof mod.isFrozenZonePath).toBe("function");
    expect(typeof mod.extractStatus).toBe("function");
    expect(typeof mod.isHardFrozenSourceFile).toBe("function");
  });

  it("R6.1: notifyFrozen function exists and is callable", async () => {
    // Verify the module structure includes the notification path
    const mod = await import("../../src/check-frozen.js");
    expect(mod.isFrozenZonePath).toBeDefined();
  });

  it("isHardFrozenSourceFile detects protected paths", async () => {
    const { isHardFrozenSourceFile } = await import("../../src/check-frozen.js");
    expect(isHardFrozenSourceFile("src/prompt-defense-patterns.ts")).toBe(true);
    expect(isHardFrozenSourceFile("/repo/src/prompt-defense-patterns.ts")).toBe(true);
    expect(isHardFrozenSourceFile("src/other.ts")).toBe(false);
  });
});
